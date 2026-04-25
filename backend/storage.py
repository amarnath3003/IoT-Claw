import json
import os
import threading
import uuid
from datetime import datetime
from collections import deque

DEFAULT_STORAGE = {
    "devices": {},
    "workflows": [],
    "logs": []
}

MAX_LOGS = 500

class Storage:
    def __init__(self, filepath: str = "storage.json"):
        self.filepath = filepath
        self._lock = threading.Lock()
        self._data = self._load()
        self._data.setdefault("logs", [])
        self._logs = deque(self._data["logs"], maxlen=MAX_LOGS)

    def _load(self) -> dict:
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r") as f:
                    return json.load(f)
            except (json.JSONDecodeError, ValueError):
                print(f"[Storage] WARNING: {self.filepath} is corrupt. Recreating.")
                backup = self.filepath + ".corrupt"
                os.rename(self.filepath, backup)
                self._save_raw(DEFAULT_STORAGE)
                return dict(DEFAULT_STORAGE)
        else:
            self._save_raw(DEFAULT_STORAGE)
            return dict(DEFAULT_STORAGE)

    def _save_raw(self, data: dict):
        with open(self.filepath, "w") as f:
            json.dump(data, f, indent=2)

    def _save(self):
        self._data["logs"] = list(self._logs)
        self._save_raw(self._data)

    # ── Logging ──

    def add_log(self, level: str, source: str, message: str, detail: dict = None) -> dict:
        entry = {
            "id": str(uuid.uuid4())[:8],
            "ts": datetime.utcnow().isoformat(),
            "level": level,       # info | success | warning | error
            "source": source,     # ai | mqtt | engine | api | user
            "message": message,
            "detail": detail or {}
        }
        with self._lock:
            self._logs.append(entry)
            self._data["logs"] = list(self._logs)
            self._save()
        return entry

    def get_logs(self, limit: int = 100) -> list:
        with self._lock:
            logs = list(self._logs)
        return list(reversed(logs))[:limit]

    # ── Device methods ──

    def get_all_devices(self) -> dict:
        with self._lock:
            return dict(self._data["devices"])

    def register_device(self, device: dict):
        name = device["name"]
        with self._lock:
            record = {
                "topic_base": device["topic_base"],
                "type": device.get("type", "generic"),
                "status": device.get("status", "unknown"),
                "unit": device.get("unit", ""),
                "location": device.get("location", ""),
                "description": device.get("description", ""),
                "brightness": None,
                "last_updated": None,
                "created_at": datetime.utcnow().isoformat()
            }
            for key, value in device.items():
                if key not in {"name", "topic_base", "type", "status", "unit", "location", "description"}:
                    record[key] = value
            self._data["devices"][name] = record
            self._save()

    def ensure_device(self, device: dict) -> dict:
        """Register a built-in device if missing, otherwise refresh metadata without losing state."""
        name = device["name"]
        with self._lock:
            existing = self._data["devices"].get(name)
            if not existing:
                record = {
                    "topic_base": device["topic_base"],
                    "type": device.get("type", "generic"),
                    "status": device.get("status", "unknown"),
                    "unit": device.get("unit", ""),
                    "location": device.get("location", ""),
                    "description": device.get("description", ""),
                    "brightness": None,
                    "last_updated": None,
                    "created_at": datetime.utcnow().isoformat()
                }
                for key, value in device.items():
                    if key not in {"name", "topic_base", "type", "status", "unit", "location", "description"}:
                        record[key] = value
                self._data["devices"][name] = record
                self._save()
                return dict(record)

            for key in ("topic_base", "type", "unit", "location", "description", "simulated", "capabilities"):
                if key in device:
                    existing[key] = device[key]
            existing.setdefault("status", device.get("status", "unknown"))
            existing.setdefault("created_at", datetime.utcnow().isoformat())
            existing.setdefault("last_updated", None)
            self._save()
            return dict(existing)

    def delete_device(self, name: str) -> bool:
        with self._lock:
            if name not in self._data["devices"]:
                return False
            del self._data["devices"][name]
            self._save()
        return True

    def update_device_state_from_topic(self, topic: str, value):
        with self._lock:
            for name, data in self._data["devices"].items():
                expected_topic = data["topic_base"] + "/state"
                if topic == expected_topic:
                    self._data["devices"][name]["status"] = value
                    self._data["devices"][name]["last_updated"] = datetime.utcnow().isoformat()
                    self._save()
                    return name
        return None

    def update_device_field(self, device_name: str, field: str, value):
        with self._lock:
            if device_name in self._data["devices"]:
                self._data["devices"][device_name][field] = value
                self._data["devices"][device_name]["last_updated"] = datetime.utcnow().isoformat()
                self._save()

    # ── Workflow methods ──

    def get_workflows(self) -> list:
        with self._lock:
            return list(self._data["workflows"])

    def save_workflow(self, workflow: dict) -> dict:
        with self._lock:
            workflow["id"] = str(uuid.uuid4())
            workflow["created_at"] = datetime.utcnow().isoformat()
            workflow.setdefault("enabled", True)
            workflow.setdefault("run_count", 0)
            workflow.setdefault("last_run", None)
            self._data["workflows"].append(workflow)
            self._save()
            return workflow

    def toggle_workflow(self, workflow_id: str):
        with self._lock:
            for w in self._data["workflows"]:
                if w.get("id") == workflow_id:
                    w["enabled"] = not w.get("enabled", True)
                    self._save()
                    return w
        return None

    def delete_workflow(self, workflow_id: str):
        with self._lock:
            self._data["workflows"] = [
                w for w in self._data["workflows"] if w.get("id") != workflow_id
            ]
            self._save()

    def increment_workflow_run(self, workflow_id: str):
        with self._lock:
            for w in self._data["workflows"]:
                if w.get("id") == workflow_id:
                    w["run_count"] = w.get("run_count", 0) + 1
                    w["last_run"] = datetime.utcnow().isoformat()
                    self._save()
                    break
