import asyncio
import os
import threading
import time
from datetime import datetime
from pathlib import Path


CAMERA_DEVICE_NAME = os.getenv("SECURITY_CAMERA_DEVICE_NAME", "laptop_security_camera")
CAMERA_TOPIC_BASE = os.getenv("SECURITY_CAMERA_TOPIC_BASE", "simulator/laptop_security_camera")


class SecurityCameraSimulator:
    """Laptop webcam simulator that detects faces/bodies and sends Telegram alerts."""

    def __init__(self, storage, ws_broadcast_fn=None):
        self.storage = storage
        self.ws_broadcast_fn = ws_broadcast_fn
        self.device_name = CAMERA_DEVICE_NAME
        self.camera_index = int(os.getenv("SECURITY_CAMERA_INDEX", "0"))
        self.poll_interval = float(os.getenv("SECURITY_CAMERA_POLL_INTERVAL", "0.25"))
        self.alert_cooldown = int(os.getenv("SECURITY_CAMERA_ALERT_COOLDOWN", "60"))
        self.capture_dir = Path(os.getenv("SECURITY_CAMERA_CAPTURE_DIR", "captures"))
        self.telegram_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        self.telegram_chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
        self._loop = None
        self._thread = None
        self._stop_event = threading.Event()
        self._last_alert_at = 0.0
        self._telegram_warned = False

    def bind_loop(self, loop):
        self._loop = loop

    def ensure_registered(self):
        device = {
            "name": self.device_name,
            "topic_base": CAMERA_TOPIC_BASE,
            "type": "security_camera",
            "unit": "",
            "location": "Laptop",
            "description": "Laptop webcam simulator. Detects faces/bodies and sends Telegram photo alerts.",
            "status": "OFF",
            "simulated": True,
            "capabilities": ["camera", "cv_detection", "telegram_alert"],
        }
        if hasattr(self.storage, "ensure_device"):
            self.storage.ensure_device(device)
        else:
            devices = self.storage.get_all_devices()
            if self.device_name not in devices:
                self.storage.register_device(device)

    def start(self) -> dict:
        self.ensure_registered()
        if self.is_running():
            self.storage.update_device_field(self.device_name, "status", "ON")
            return {"status": "already_on", "device": self.device_name}

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name="security-camera-simulator", daemon=True)
        self._thread.start()
        self.storage.update_device_field(self.device_name, "status", "ON")
        self.storage.add_log("success", "camera", "Laptop security camera started", {"device": self.device_name})
        self._broadcast_state()
        return {"status": "started", "device": self.device_name}

    def stop(self) -> dict:
        if not self.is_running():
            self.storage.update_device_field(self.device_name, "status", "OFF")
            self._broadcast_state()
            return {"status": "already_off", "device": self.device_name}

        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=3)
        self._thread = None
        self.storage.update_device_field(self.device_name, "status", "OFF")
        self.storage.add_log("info", "camera", "Laptop security camera stopped", {"device": self.device_name})
        self._broadcast_state()
        return {"status": "stopped", "device": self.device_name}

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def _run(self):
        try:
            import cv2
        except Exception as exc:
            self.storage.update_device_field(self.device_name, "status", "ERROR")
            self.storage.add_log(
                "error",
                "camera",
                "OpenCV is not installed. Install backend requirements to use the laptop camera simulator.",
                {"error": str(exc)},
            )
            self._broadcast_state()
            return

        capture = self._open_capture(cv2)
        if not capture or not capture.isOpened():
            self.storage.update_device_field(self.device_name, "status", "ERROR")
            self.storage.add_log(
                "error",
                "camera",
                "Could not open laptop camera",
                {"device": self.device_name, "camera_index": self.camera_index},
            )
            self._broadcast_state()
            return

        face_detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        body_detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_fullbody.xml")

        try:
            while not self._stop_event.is_set():
                ok, frame = capture.read()
                if not ok:
                    time.sleep(self.poll_interval)
                    continue

                detections = self._detect(cv2, frame, face_detector, body_detector)
                if detections and self._cooldown_elapsed():
                    self._last_alert_at = time.time()
                    snapshot = self._save_snapshot(cv2, frame, detections)
                    self._record_detection(detections, snapshot)
                    self._send_telegram_alert(snapshot, detections)

                time.sleep(self.poll_interval)
        finally:
            capture.release()

    def _open_capture(self, cv2):
        if os.name == "nt":
            return cv2.VideoCapture(self.camera_index, cv2.CAP_DSHOW)
        return cv2.VideoCapture(self.camera_index)

    def _detect(self, cv2, frame, face_detector, body_detector):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
        bodies = body_detector.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=3, minSize=(80, 120))

        detections = []
        for (x, y, w, h) in faces:
            detections.append({"type": "face", "box": [int(x), int(y), int(w), int(h)]})
        for (x, y, w, h) in bodies:
            detections.append({"type": "body", "box": [int(x), int(y), int(w), int(h)]})
        return detections

    def _cooldown_elapsed(self) -> bool:
        return time.time() - self._last_alert_at >= self.alert_cooldown

    def _save_snapshot(self, cv2, frame, detections) -> str:
        self.capture_dir.mkdir(parents=True, exist_ok=True)
        annotated = frame.copy()
        for item in detections:
            x, y, w, h = item["box"]
            color = (0, 255, 255) if item["type"] == "face" else (255, 160, 0)
            cv2.rectangle(annotated, (x, y), (x + w, y + h), color, 2)
            cv2.putText(annotated, item["type"], (x, max(y - 8, 12)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

        filename = f"security_camera_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.jpg"
        path = self.capture_dir / filename
        cv2.imwrite(str(path), annotated)
        return str(path)

    def _record_detection(self, detections, snapshot):
        detected_types = sorted({item["type"] for item in detections})
        detail = {
            "device": self.device_name,
            "detected": detected_types,
            "count": len(detections),
            "snapshot": snapshot,
            "time_utc": datetime.utcnow().isoformat(),
        }
        self.storage.update_device_field(self.device_name, "last_detection", detail)
        self.storage.update_device_field(self.device_name, "last_snapshot", snapshot)
        self.storage.add_log(
            "warning",
            "camera",
            f"Security camera detected {', '.join(detected_types)}",
            detail,
        )
        self._broadcast_state()

    def _send_telegram_alert(self, snapshot, detections):
        if not self.telegram_token or not self.telegram_chat_id:
            if not self._telegram_warned:
                self.storage.add_log(
                    "warning",
                    "camera",
                    "Telegram alert skipped. Configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.",
                    {"device": self.device_name},
                )
                self._telegram_warned = True
            return

        try:
            import requests

            detected = ", ".join(sorted({item["type"] for item in detections}))
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            caption = f"iotClaw security alert\nDetected: {detected}\nTime: {timestamp}"
            url = f"https://api.telegram.org/bot{self.telegram_token}/sendPhoto"
            with open(snapshot, "rb") as photo:
                response = requests.post(
                    url,
                    data={"chat_id": self.telegram_chat_id, "caption": caption},
                    files={"photo": photo},
                    timeout=15,
                )
            response.raise_for_status()
            self.storage.add_log("success", "camera", "Telegram security alert sent", {"snapshot": snapshot})
        except Exception as exc:
            self.storage.add_log("error", "camera", "Failed to send Telegram alert", {"error": str(exc)})

    def _broadcast_state(self):
        if self._loop and self._loop.is_running() and self.ws_broadcast_fn:
            asyncio.run_coroutine_threadsafe(
                self.ws_broadcast_fn({"type": "state", "data": self.storage.get_all_devices()}),
                self._loop,
            )
