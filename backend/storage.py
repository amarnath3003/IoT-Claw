import json
import os
import threading
import uuid
from datetime import datetime

DEFAULT_STORAGE = {
    "devices": {},
    "workflows": []
}

class Storage:
    def __init__(self, filepath: str = "storage.json"):
        self.filepath = filepath
        self._lock = threading.Lock()
        self._data = self._load()

    def _load(self) -> dict:
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r") as f:
                    return json.load(f)
            except (json.JSONDecodeError, ValueError):
                print(f"[Storage] WARNING: {self.filepath} is corrupt. Recreating from defaults.")
                backup = self.filepath + ".corrupt"
                os.rename(self.filepath, backup)
                print(f"[Storage] Corrupt file backed up to {backup}")
                self._save_raw(DEFAULT_STORAGE)
                return dict(DEFAULT_STORAGE)
        else:
            self._save_raw(DEFAULT_STORAGE)
            return dict(DEFAULT_STORAGE)

    def _save_raw(self, data: dict):
        with open(self.filepath, "w") as f:
            json.dump(data, f, indent=2)

    def _save(self):
        """Must be called while holding self._lock"""
        self._save_raw(self._data)

    # ── Device methods ──

    def get_all_devices(self) -> dict:
        with self._lock:
            return dict(self._data["devices"])

    def register_device(self, device: dict):
        """Register a new device. device must have: name, topic_base, type"""
        name = device["name"]
        with self._lock:
            self._data["devices"][name] = {
                "topic_base": device["topic_base"],
                "type": device.get("type", "generic"),
                "status": "unknown",
                "unit": device.get("unit", ""),
                "brightness": None,
                "last_updated": None
            }
            self._save()

    def update_device_state_from_topic(self, topic: str, value):
        """Called by MQTT on_message. Finds device by topic and updates its state."""
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
            self._data["workflows"].append(workflow)
            self._save()
            return workflow

    def delete_workflow(self, workflow_id: str):
        with self._lock:
            self._data["workflows"] = [
                w for w in self._data["workflows"] if w.get("id") != workflow_id
            ]
            self._save()