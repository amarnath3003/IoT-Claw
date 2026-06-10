import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';

/* ─────────────────────────────────────────────────────────────────
   CameraWall — RTSP IP Camera viewer with local CV detection alerts
   HLS playback via hls.js; MJPEG polling fallback when HLS N/A
───────────────────────────────────────────────────────────────── */

const API = 'http://localhost:8000';

// ── Helpers ────────────────────────────────────────────────────────────────────

function useInterval(fn, delay) {
  const saved = useRef(fn);
  useEffect(() => { saved.current = fn; }, [fn]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

function timeAgo(isoStr) {
  if (!isoStr) return 'Never';
  const diff = (Date.now() - new Date(isoStr)) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

// ── HLS Player ─────────────────────────────────────────────────────────────────

function HlsPlayer({ src, name, running }) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);

  useEffect(() => {
    if (!src || !running) return;
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true, maxBufferLength: 4 });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      return () => { hls.destroy(); hlsRef.current = null; };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => video.play().catch(() => {}));
    }
  }, [src, running]);

  if (!running) {
    return (
      <div className="cw-offline-overlay">
        <span>🔴 Offline</span>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className="cw-video"
      autoPlay muted playsInline
      onError={() => {}}
    />
  );
}

// ── MJPEG fallback ─────────────────────────────────────────────────────────────

function MjpegPlayer({ name, running }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState(false);

  useInterval(() => {
    if (!running) return;
    setSrc(`${API}/devices/${name}/preview?t=${Date.now()}`);
  }, running ? 200 : null);

  if (!running) return (
    <div className="cw-offline-overlay"><span>🔴 Offline</span></div>
  );

  return error ? (
    <div className="cw-offline-overlay"><span>⚠️ No preview</span></div>
  ) : (
    <img
      src={src}
      alt={`${name} preview`}
      className="cw-video"
      onError={() => setError(true)}
      onLoad={() => setError(false)}
    />
  );
}

// ── Single camera tile ─────────────────────────────────────────────────────────

function CameraTile({ cam, onStart, onStop, hasAlert }) {
  const { name, location, running, hls_available, hls_path, last_detection } = cam;

  const detLabel = last_detection?.label || null;
  const detTime  = last_detection?.time_utc || null;

  return (
    <div className={`cw-tile ${hasAlert ? 'cw-tile--alert' : ''}`}>
      {/* Header */}
      <div className="cw-tile-header">
        <div className="cw-tile-title">
          <span className={`cw-dot ${running ? 'cw-dot--on' : 'cw-dot--off'}`} />
          <span className="cw-name">{name.replace(/_/g, ' ')}</span>
          {location && <span className="cw-location">{location}</span>}
        </div>
        <div className="cw-tile-actions">
          {hls_available && <span className="cw-badge cw-badge--hls">HLS</span>}
          {!hls_available && <span className="cw-badge cw-badge--mjpeg">MJPEG</span>}
          {running ? (
            <button className="cw-btn cw-btn--stop" onClick={() => onStop(name)}>⏹ Stop</button>
          ) : (
            <button className="cw-btn cw-btn--start" onClick={() => onStart(name)}>▶ Start</button>
          )}
        </div>
      </div>

      {/* Video area */}
      <div className="cw-video-wrap">
        {hls_available && hls_path ? (
          <HlsPlayer src={hls_path} name={name} running={running} />
        ) : (
          <MjpegPlayer name={name} running={running} />
        )}
        {hasAlert && <div className="cw-alert-badge">🚨 Alert</div>}
      </div>

      {/* Detection panel */}
      <div className="cw-detection">
        {detLabel ? (
          <>
            <span className="cw-det-label">{detLabel}</span>
            <span className="cw-det-time">{timeAgo(detTime)}</span>
          </>
        ) : (
          <span className="cw-det-none">No detections yet</span>
        )}
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="cw-empty">
      <div className="cw-empty-icon">🎥</div>
      <h3>No RTSP Cameras Configured</h3>
      <p>Add your camera URL to the backend <code>.env</code> file:</p>
      <pre className="cw-empty-code">
{`RTSP_CAMERA_URL=rtsp://admin:password@192.168.1.x:554/stream
RTSP_CAMERA_NAMES=front_door
RTSP_CAMERA_LOCATIONS=Entrance`}
      </pre>
      <p className="cw-empty-hint">
        Then restart the backend. For browser playback, ensure <code>ffmpeg</code> is on your PATH.
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CameraWall({ wsAlerts }) {
  const [cameras, setCameras] = useState([]);
  const [alertSet, setAlertSet] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchCameras = useCallback(async () => {
    try {
      const res = await fetch(`${API}/cameras`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCameras(data);
      setError(null);
    } catch (e) {
      setError('Could not reach backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + poll every 5s for status updates
  useEffect(() => { fetchCameras(); }, [fetchCameras]);
  useInterval(fetchCameras, 5000);

  // Listen for WebSocket camera_alert events
  useEffect(() => {
    if (!wsAlerts) return;
    if (wsAlerts.type === 'camera_alert') {
      const cam = wsAlerts.camera;
      setAlertSet(prev => new Set([...prev, cam]));
      // Clear glow after 30 seconds
      setTimeout(() => {
        setAlertSet(prev => {
          const next = new Set(prev);
          next.delete(cam);
          return next;
        });
      }, 30000);
      // Refresh camera status immediately
      fetchCameras();
    }
  }, [wsAlerts, fetchCameras]);

  const handleStart = async (name) => {
    await fetch(`${API}/cameras/${name}/start`, { method: 'POST' });
    fetchCameras();
  };

  const handleStop = async (name) => {
    await fetch(`${API}/cameras/${name}/stop`, { method: 'POST' });
    fetchCameras();
  };

  if (loading) return <div className="cw-loading">Loading cameras…</div>;
  if (error)   return <div className="cw-error">⚠️ {error}</div>;
  if (cameras.length === 0) return <EmptyState />;

  return (
    <div className="cw-root">
      <div className="cw-header">
        <h2 className="cw-title">🎥 Security Cameras</h2>
        <span className="cw-count">{cameras.filter(c => c.running).length}/{cameras.length} online</span>
      </div>
      <div className={`cw-grid cw-grid--${Math.min(cameras.length, 2)}`}>
        {cameras.map(cam => (
          <CameraTile
            key={cam.name}
            cam={cam}
            onStart={handleStart}
            onStop={handleStop}
            hasAlert={alertSet.has(cam.name)}
          />
        ))}
      </div>
    </div>
  );
}
