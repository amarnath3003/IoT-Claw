"""
RTSPCameraManager
─────────────────
Multi-camera RTSP stream manager with local OpenCV detection (no API key required).

Detection pipeline per camera:
  1. MOG2 background subtraction  →  motion gate   (~1 ms/frame)
  2. Haar frontalface cascade      →  face detection
  3. Haar fullbody cascade         →  body/person detection
  Runs every N frames; annotated snapshots sent via Telegram + WebSocket.

HLS transcoding:
  ffmpeg subprocess per camera → hls/{name}/*.ts + index.m3u8
  FastAPI mounts /hls/ as static files for browser-native <video> playback.
  Soft-fallback to MJPEG preview if ffmpeg is not on PATH.
"""

import asyncio
import os
import shutil
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path

try:
    from app.services.telegram_notify import notify as _notify
except ImportError:
    def _notify(*a, **kw): pass

# ── ffmpeg availability ────────────────────────────────────────────────────────
HLS_AVAILABLE = shutil.which("ffmpeg") is not None

# ── Detection config ───────────────────────────────────────────────────────────
DETECTION_ENABLED  = os.getenv("CAMERA_DETECTION_ENABLED",  "true").lower() == "true"
ALERT_COOLDOWN     = int(os.getenv("CAMERA_ALERT_COOLDOWN",    "120"))
MOTION_SENSITIVITY = int(os.getenv("CAMERA_MOTION_SENSITIVITY", "500"))
DETECT_PERSONS     = os.getenv("CAMERA_DETECT_PERSONS", "true").lower() == "true"
DETECT_FACES       = os.getenv("CAMERA_DETECT_FACES",   "true").lower() == "true"
CAPTURE_DIR        = Path(os.getenv("SECURITY_CAMERA_CAPTURE_DIR", "captures"))

# Run detection every N frames (5 = ~5 checks/sec at 25fps — responsive, low CPU)
_DETECT_EVERY = 5


def _parse_cameras_from_env() -> list[dict]:
    """Return list of {name, rtsp_url, location} from env."""
    multi  = os.getenv("RTSP_CAMERAS",    "").strip()
    single = os.getenv("RTSP_CAMERA_URL", "").strip()

    if multi:
        urls = [u.strip() for u in multi.split(",") if u.strip()]
    elif single:
        urls = [single]
    else:
        return []

    names     = [n.strip() for n in os.getenv("RTSP_CAMERA_NAMES",     "").split(",") if n.strip()]
    locations = [l.strip() for l in os.getenv("RTSP_CAMERA_LOCATIONS",  "").split(",") if l.strip()]

    return [
        {
            "name":     names[i]     if i < len(names)     else f"cam_{i + 1}",
            "location": locations[i] if i < len(locations) else "",
            "rtsp_url": url,
        }
        for i, url in enumerate(urls)
    ]


class CameraWorker:
    """Manages one RTSP camera: frame reading, CV detection, HLS transcoding."""

    def __init__(self, config: dict, storage, ws_broadcast_fn, tg_token: str, tg_chat_id: str):
        self.name      = config["name"]
        self.rtsp_url  = config["rtsp_url"]
        self.location  = config.get("location", "")
        self.storage   = storage
        self.ws_fn     = ws_broadcast_fn
        self._tg_token  = tg_token
        self._tg_chatid = tg_chat_id
        self._loop      = None
        self._tg_warned = False

        self._stop_event    = threading.Event()
        self._reader_thread: threading.Thread | None = None
        self._ffmpeg_proc:   subprocess.Popen | None = None

        self._frame_lock     = threading.Lock()
        self._latest_preview: bytes | None = None

        self._last_alert_at  = 0.0
        self._last_detection: dict = {}
        self._frame_count    = 0

    # ── Public ─────────────────────────────────────────────────────────────────

    def bind_loop(self, loop):
        self._loop = loop

    def start(self):
        if self.is_running():
            return
        self._stop_event.clear()
        self._reader_thread = threading.Thread(
            target=self._reader_loop, name=f"rtsp-{self.name}", daemon=True
        )
        self._reader_thread.start()
        if HLS_AVAILABLE:
            self._start_ffmpeg()
        else:
            self.storage.add_log(
                "warning", "camera",
                f"ffmpeg not found — HLS disabled for {self.name}. MJPEG fallback active.",
            )

    def stop(self):
        self._stop_event.set()
        if self._ffmpeg_proc:
            try:
                self._ffmpeg_proc.terminate()
                self._ffmpeg_proc.wait(timeout=5)
            except Exception:
                pass
            self._ffmpeg_proc = None
        if self._reader_thread:
            self._reader_thread.join(timeout=5)
            self._reader_thread = None
        with self._frame_lock:
            self._latest_preview = None

    def is_running(self) -> bool:
        return self._reader_thread is not None and self._reader_thread.is_alive()

    def get_preview(self) -> bytes | None:
        with self._frame_lock:
            return self._latest_preview

    def get_status(self) -> dict:
        return {
            "name":           self.name,
            "rtsp_url":       self.rtsp_url,
            "location":       self.location,
            "running":        self.is_running(),
            "hls_available":  HLS_AVAILABLE,
            "hls_path":       f"/hls/{self.name}/index.m3u8" if HLS_AVAILABLE else None,
            "last_detection": self._last_detection,
        }

    # ── HLS ───────────────────────────────────────────────────────────────────

    def _start_ffmpeg(self):
        hls_dir = Path("hls") / self.name
        hls_dir.mkdir(parents=True, exist_ok=True)
        playlist = str(hls_dir / "index.m3u8")

        cmd = [
            "ffmpeg", "-y",
            "-rtsp_transport", "tcp",
            "-i", self.rtsp_url,
            "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
            "-an",
            "-f", "hls",
            "-hls_time", "2",
            "-hls_list_size", "5",
            "-hls_flags", "delete_segments+append_list",
            playlist,
        ]
        try:
            flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            self._ffmpeg_proc = subprocess.Popen(
                cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags
            )
            self.storage.add_log("success", "camera", f"HLS transcoding started: {self.name}")
        except Exception as exc:
            self.storage.add_log("error", "camera", f"ffmpeg failed for {self.name}: {exc}")

    # ── Reader + detection loop ────────────────────────────────────────────────

    def _reader_loop(self):
        try:
            import cv2
        except ImportError:
            self.storage.add_log("error", "camera", "opencv-python not installed.")
            self.storage.update_device_field(self.name, "status", "ERROR")
            return

        face_cascade = (
            cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
            if DETECT_FACES else None
        )
        body_cascade = (
            cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_fullbody.xml")
            if DETECT_PERSONS else None
        )
        bg_sub = (
            cv2.createBackgroundSubtractorMOG2(history=200, varThreshold=40, detectShadows=False)
            if DETECTION_ENABLED else None
        )

        backoff = 2
        while not self._stop_event.is_set():
            cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            if not cap.isOpened():
                self.storage.update_device_field(self.name, "status", "ERROR")
                self.storage.add_log(
                    "error", "camera",
                    f"Cannot open RTSP stream: {self.name}. Retrying in {backoff}s.",
                )
                self._broadcast()
                time.sleep(backoff)
                backoff = min(backoff * 2, 30)
                continue

            backoff = 2
            self.storage.update_device_field(self.name, "status", "ON")
            self._broadcast()
            self.storage.add_log("success", "camera", f"RTSP connected: {self.name}")

            try:
                while not self._stop_event.is_set():
                    ok, frame = cap.read()
                    if not ok:
                        break

                    self._frame_count += 1
                    self._update_preview(cv2, frame)

                    if DETECTION_ENABLED and self._frame_count % _DETECT_EVERY == 0:
                        detections = self._detect(cv2, frame, bg_sub, face_cascade, body_cascade)
                        if detections and self._cooldown_elapsed():
                            self._last_alert_at = time.time()
                            annotated = self._annotate(cv2, frame.copy(), detections)
                            snap = self._save_snapshot(cv2, annotated, detections)
                            self._record_detection(detections, snap)
                            self._send_telegram(snap, detections)
            finally:
                cap.release()

        self.storage.update_device_field(self.name, "status", "OFF")
        self._broadcast()

    # ── Detection ──────────────────────────────────────────────────────────────

    def _detect(self, cv2, frame, bg_sub, face_cascade, body_cascade) -> list[dict]:
        small   = cv2.resize(frame, (320, 240))
        gray    = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        scale_x = frame.shape[1] / 320
        scale_y = frame.shape[0] / 240

        # Motion gate
        if bg_sub is not None:
            mask = bg_sub.apply(small)
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if max((cv2.contourArea(c) for c in contours), default=0) < MOTION_SENSITIVITY:
                return []

        detections = []
        if face_cascade:
            for (x, y, w, h) in face_cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
            ):
                detections.append({"type": "face",
                                    "box": [int(x*scale_x), int(y*scale_y),
                                            int(w*scale_x), int(h*scale_y)]})
        if body_cascade:
            for (x, y, w, h) in body_cascade.detectMultiScale(
                gray, scaleFactor=1.05, minNeighbors=3, minSize=(60, 120)
            ):
                detections.append({"type": "person",
                                    "box": [int(x*scale_x), int(y*scale_y),
                                            int(w*scale_x), int(h*scale_y)]})
        return detections

    def _annotate(self, cv2, frame, detections):
        for d in detections:
            x, y, w, h = d["box"]
            color = (0, 255, 255) if d["type"] == "face" else (255, 160, 0)
            cv2.rectangle(frame, (x, y), (x+w, y+h), color, 2)
            cv2.putText(frame, d["type"].upper(), (x, max(y-8, 14)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1)
        return frame

    def _update_preview(self, cv2, frame):
        small = cv2.resize(frame, (640, 480))
        ok, jpeg = cv2.imencode(".jpg", small, [int(cv2.IMWRITE_JPEG_QUALITY), 60])
        if ok:
            with self._frame_lock:
                self._latest_preview = jpeg.tobytes()

    # ── Alerts ─────────────────────────────────────────────────────────────────

    def _cooldown_elapsed(self) -> bool:
        return time.time() - self._last_alert_at >= ALERT_COOLDOWN

    def _save_snapshot(self, cv2, annotated_frame, detections) -> str:
        CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
        ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = CAPTURE_DIR / f"{self.name}_{ts}.jpg"
        cv2.imwrite(str(path), annotated_frame)
        ok, jpeg = cv2.imencode(".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if ok and hasattr(self.storage, "save_capture"):
            types = sorted({d["type"] for d in detections})
            self.storage.save_capture(self.name, datetime.now().isoformat(), types, jpeg.tobytes())
        return str(path)

    def _record_detection(self, detections, snapshot_path: str):
        types = sorted({d["type"] for d in detections})
        label = ", ".join(t.capitalize() for t in types)
        self._last_detection = {
            "types":    types,
            "label":    f"{label} detected at {self.location or self.name}",
            "count":    len(detections),
            "snapshot": snapshot_path,
            "time_utc": datetime.now().isoformat(),
        }
        self.storage.update_device_field(self.name, "last_detection", self._last_detection)
        self.storage.update_device_field(self.name, "last_snapshot",  snapshot_path)
        self.storage.add_log("warning", "camera",
                             f"Camera {self.name}: {label} detected",
                             {"device": self.name, "types": types})
        self._broadcast("camera_alert")

    def _send_telegram(self, snapshot_path: str, detections: list):
        if not self._tg_token or not self._tg_chatid:
            if not self._tg_warned:
                self.storage.add_log("warning", "camera",
                                     f"Telegram skipped for {self.name}. "
                                     "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.")
                self._tg_warned = True
            return
        types = sorted({d["type"] for d in detections})
        label = ", ".join(t.capitalize() for t in types)
        ts    = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        try:
            _notify(
                title=f"🚨 {label} detected — {self.location or self.name}",
                body=f"Camera: {self.name}\nTime: {ts}",
                photo_path=snapshot_path,
            )
        except Exception as exc:
            self.storage.add_log("error", "camera", f"Telegram alert failed: {exc}")

    def _broadcast(self, event_type: str = "state"):
        if not (self._loop and self._loop.is_running() and self.ws_fn):
            return
        if event_type == "camera_alert":
            payload = {"type": "camera_alert", "camera": self.name,
                       "detection": self._last_detection}
        else:
            payload = {"type": "state", "data": self.storage.get_all_devices()}
        asyncio.run_coroutine_threadsafe(self.ws_fn(payload), self._loop)


# ── Manager ────────────────────────────────────────────────────────────────────

class RTSPCameraManager:
    """Top-level manager for all configured RTSP cameras."""

    def __init__(self, storage, ws_broadcast_fn):
        self.storage = storage
        self.ws_fn   = ws_broadcast_fn
        self._workers: dict[str, CameraWorker] = {}

        tg_token   = os.getenv("TELEGRAM_BOT_TOKEN", "")
        tg_chat_id = os.getenv("TELEGRAM_CHAT_ID",   "")

        for cfg in _parse_cameras_from_env():
            w = CameraWorker(cfg, storage, ws_broadcast_fn, tg_token, tg_chat_id)
            self._workers[cfg["name"]] = w
            self._register_device(cfg)

        if not HLS_AVAILABLE:
            print("[RTSPCameraManager] WARNING: ffmpeg not on PATH — HLS disabled. "
                  "Install ffmpeg for browser-native video playback.")
        cam_list = list(self._workers.keys())
        if cam_list:
            print(f"[RTSPCameraManager] {len(cam_list)} camera(s): {cam_list}")
        else:
            print("[RTSPCameraManager] No RTSP cameras configured (RTSP_CAMERA_URL not set).")

    def bind_loop(self, loop):
        for w in self._workers.values():
            w.bind_loop(loop)

    def start_all(self):
        for w in self._workers.values():
            w.start()
            self.storage.update_device_field(w.name, "status", "ON")

    def stop_all(self):
        for w in self._workers.values():
            w.stop()

    def start_camera(self, name: str) -> dict:
        w = self._workers.get(name)
        if not w:
            return {"error": f"Camera '{name}' not found"}
        if w.is_running():
            return {"status": "already_running", "camera": name}
        w.start()
        self.storage.update_device_field(name, "status", "ON")
        return {"status": "started", "camera": name}

    def stop_camera(self, name: str) -> dict:
        w = self._workers.get(name)
        if not w:
            return {"error": f"Camera '{name}' not found"}
        w.stop()
        self.storage.update_device_field(name, "status", "OFF")
        return {"status": "stopped", "camera": name}

    def get_preview(self, name: str) -> bytes | None:
        w = self._workers.get(name)
        return w.get_preview() if w else None

    def list_cameras(self) -> list[dict]:
        return [w.get_status() for w in self._workers.values()]

    def get_camera(self, name: str) -> dict | None:
        w = self._workers.get(name)
        return w.get_status() if w else None

    @property
    def worker_names(self) -> list[str]:
        return list(self._workers.keys())

    def _register_device(self, cfg: dict):
        device = {
            "name":               cfg["name"],
            "topic_base":         f"rtsp/{cfg['name']}",
            "type":               "ip_camera",
            "integration_source": "rtsp",
            "unit":               "",
            "location":           cfg.get("location", ""),
            "description":        f"RTSP IP camera — {cfg.get('location', cfg['name'])}",
            "status":             "OFF",
            "simulated":          False,
            "capabilities":       ["camera", "cv_detection", "telegram_alert",
                                   "hls_stream" if HLS_AVAILABLE else "mjpeg_preview"],
        }
        if hasattr(self.storage, "ensure_device"):
            self.storage.ensure_device(device)
        else:
            devices = self.storage.get_all_devices()
            if cfg["name"] not in devices:
                self.storage.register_device(device)
