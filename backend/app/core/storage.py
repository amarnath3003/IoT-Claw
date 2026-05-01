import json
import uuid
from datetime import datetime
import sqlite3

from app.core.db import get_connection, init_db

class Storage:
    def __init__(self):
        # We don't need filepath or lock anymore, sqlite handles it.
        # Initialize db if it hasn't been initialized
        init_db()

    def _dict_factory(self, cursor, row):
        d = {}
        for idx, col in enumerate(cursor.description):
            d[col[0]] = row[idx]
        return d

    def _execute(self, query, params=(), commit=False):
        conn = get_connection()
        conn.row_factory = self._dict_factory
        cursor = conn.cursor()
        cursor.execute(query, params)
        if commit:
            conn.commit()
        res = cursor.fetchall()
        conn.close()
        return res

    # ── Logging ──

    def add_log(self, level: str, source: str, message: str, detail: dict = None) -> dict:
        entry = {
            "id": str(uuid.uuid4())[:8],
            "ts": datetime.now().isoformat(),
            "level": level,       # info | success | warning | error
            "source": source,     # ai | mqtt | engine | api | user
            "message": message,
            "detail": detail or {}
        }
        self._execute('''
            INSERT INTO logs (id, ts, level, source, message, detail)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            entry["id"], entry["ts"], entry["level"], entry["source"],
            entry["message"], json.dumps(entry["detail"])
        ), commit=True)
        return entry

    def get_logs(self, limit: int = 100) -> list:
        rows = self._execute('SELECT * FROM logs ORDER BY ts DESC LIMIT ?', (limit,))
        for row in rows:
            if row.get('detail'):
                try:
                    row['detail'] = json.loads(row['detail'])
                except:
                    row['detail'] = {}
        return rows

    # ── Device methods ──

    def get_all_devices(self) -> dict:
        rows = self._execute('SELECT * FROM devices')
        devices = {}
        
        # Batch fetch script history to avoid N+1 queries
        all_history = self._execute('''
            SELECT device_name, timestamp, script_content as script, description 
            FROM script_history 
            ORDER BY timestamp DESC
        ''')
        history_map = {}
        for h in all_history:
            d_name = h['device_name']
            if d_name not in history_map:
                history_map[d_name] = []
            if len(history_map[d_name]) < 10:
                history_map[d_name].append({
                    "timestamp": h["timestamp"],
                    "script": h["script"],
                    "description": h["description"]
                })

        for row in rows:
            if row.get('capabilities'):
                try:
                    row['capabilities'] = json.loads(row['capabilities'])
                except:
                    row['capabilities'] = []
                    
            if row.get('last_detection'):
                try:
                    row['last_detection'] = json.loads(row['last_detection'])
                except:
                    row['last_detection'] = {}
            
            row['simulated'] = bool(row.get('simulated'))
            row['script_history'] = history_map.get(row['name'], [])
            devices[row['name']] = row
        return devices

    def register_device(self, device: dict):
        name = device["name"]
        capabilities = json.dumps(device.get("capabilities", []))
        self._execute('''
            INSERT OR REPLACE INTO devices (
                name, topic_base, type, status, location, description, 
                unit, brightness, last_updated, last_heartbeat, created_at, 
                capabilities, simulated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            name,
            device.get("topic_base"),
            device.get("type", "generic"),
            device.get("status", "unknown"),
            device.get("location", ""),
            device.get("description", ""),
            device.get("unit", ""),
            device.get("brightness"),
            device.get("last_updated"),
            device.get("last_heartbeat"),
            device.get("created_at", datetime.now().isoformat()),
            capabilities,
            device.get("simulated", False)
        ), commit=True)

    def ensure_device(self, device: dict) -> dict:
        """Register a built-in device if missing, otherwise refresh metadata without losing state."""
        name = device["name"]
        rows = self._execute('SELECT * FROM devices WHERE name = ?', (name,))
        if not rows:
            record = {
                "name": name,
                "topic_base": device["topic_base"],
                "type": device.get("type", "generic"),
                "status": device.get("status", "unknown"),
                "unit": device.get("unit", ""),
                "location": device.get("location", ""),
                "description": device.get("description", ""),
                "brightness": None,
                "last_updated": None,
                "created_at": datetime.now().isoformat(),
                "capabilities": device.get("capabilities", []),
                "simulated": device.get("simulated", False)
            }
            self.register_device(record)
            record["script_history"] = []
            return record

        existing = rows[0]
        updates = []
        params = []
        for key in ("topic_base", "type", "unit", "location", "description", "simulated", "capabilities"):
            if key in device:
                updates.append(f"{key} = ?")
                val = device[key]
                if key == "capabilities":
                    val = json.dumps(val)
                params.append(val)
                existing[key] = device[key] # for return

        if "status" in device:
            updates.append("status = ?")
            params.append(device["status"])
            existing["status"] = device["status"]

        if updates:
            query = f"UPDATE devices SET {', '.join(updates)} WHERE name = ?"
            params.append(name)
            self._execute(query, tuple(params), commit=True)

        if existing.get('capabilities') and isinstance(existing['capabilities'], str):
             try:
                 existing['capabilities'] = json.loads(existing['capabilities'])
             except:
                 existing['capabilities'] = []

        existing["script_history"] = self.get_script_history(name)
        return existing

    def delete_device(self, name: str) -> bool:
        rows = self._execute('SELECT name FROM devices WHERE name = ?', (name,))
        if not rows:
            return False
        self._execute('DELETE FROM devices WHERE name = ?', (name,), commit=True)
        return True

    def update_device_state_from_topic(self, topic: str, value):
        rows = self._execute('SELECT name, topic_base FROM devices')
        for row in rows:
            expected_topic = row["topic_base"] + "/state"
            if topic == expected_topic:
                self._execute(
                    'UPDATE devices SET status = ?, last_updated = ? WHERE name = ?',
                    (value, datetime.now().isoformat(), row['name']),
                    commit=True
                )
                return row['name']
        return None

    def update_device_field(self, device_name: str, field: str, value):
        if field in ("capabilities", "last_detection"):
            value = json.dumps(value)
        self._execute(
            f'UPDATE devices SET {field} = ?, last_updated = ? WHERE name = ?',
            (value, datetime.now().isoformat(), device_name),
            commit=True
        )

    # ── Workflow methods ──

    def get_workflows(self) -> list:
        rows = self._execute('SELECT * FROM workflows')
        workflows = []
        for row in rows:
            w = json.loads(row['config']) if row.get('config') else {}
            w['id'] = row['id']
            w['enabled'] = bool(row['enabled'])
            w['run_count'] = row['run_count']
            w['last_run'] = row['last_run']
            w['deployed_to_edge'] = bool(row['deployed_to_edge'])
            w['created_at'] = row['created_at']
            workflows.append(w)
        return workflows

    def save_workflow(self, workflow: dict) -> dict:
        w_id = str(uuid.uuid4())
        workflow["id"] = w_id
        created_at = datetime.now().isoformat()
        workflow["created_at"] = created_at
        workflow.setdefault("enabled", True)
        workflow.setdefault("run_count", 0)
        workflow.setdefault("last_run", None)
        workflow.setdefault("deployed_to_edge", False)

        config = dict(workflow)
        config.pop("id", None)
        config.pop("enabled", None)
        config.pop("run_count", None)
        config.pop("last_run", None)
        config.pop("deployed_to_edge", None)
        config.pop("created_at", None)

        self._execute('''
            INSERT INTO workflows (id, config, enabled, run_count, last_run, deployed_to_edge, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            w_id, json.dumps(config), workflow["enabled"], workflow["run_count"], 
            workflow["last_run"], workflow["deployed_to_edge"], created_at
        ), commit=True)
        return workflow

    def toggle_workflow(self, workflow_id: str):
        rows = self._execute('SELECT enabled FROM workflows WHERE id = ?', (workflow_id,))
        if rows:
            new_state = not rows[0]['enabled']
            self._execute('UPDATE workflows SET enabled = ? WHERE id = ?', (new_state, workflow_id), commit=True)
            w_rows = self._execute('SELECT * FROM workflows WHERE id = ?', (workflow_id,))
            if w_rows:
                w = json.loads(w_rows[0]['config']) if w_rows[0].get('config') else {}
                w['id'] = w_rows[0]['id']
                w['enabled'] = bool(w_rows[0]['enabled'])
                w['run_count'] = w_rows[0]['run_count']
                w['last_run'] = w_rows[0]['last_run']
                w['deployed_to_edge'] = bool(w_rows[0]['deployed_to_edge'])
                w['created_at'] = w_rows[0]['created_at']
                return w
        return None

    def update_workflow_deployed(self, workflow_id: str, target_device: str, deployed: bool = True):
        self._execute('UPDATE workflows SET deployed_to_edge = ? WHERE id = ?', (deployed, workflow_id), commit=True)
        # Also update the target device inside config if needed
        rows = self._execute('SELECT config FROM workflows WHERE id = ?', (workflow_id,))
        if rows and rows[0]['config']:
            config = json.loads(rows[0]['config'])
            config['target_edge_device'] = target_device
            self._execute('UPDATE workflows SET config = ? WHERE id = ?', (json.dumps(config), workflow_id), commit=True)

    def delete_workflow(self, workflow_id: str):
        self._execute('DELETE FROM workflows WHERE id = ?', (workflow_id,), commit=True)

    # ── Telemetry (Persistent SQLite table now!) ──

    def add_telemetry(self, device_name: str, value: float):
        self._execute('''
            INSERT INTO telemetry (device_name, ts, value) VALUES (?, ?, ?)
        ''', (device_name, datetime.now().isoformat(), round(float(value), 4)), commit=True)

    def get_telemetry(self, device_name: str) -> list:
        # Return last 60 for backward compatibility with frontend sparklines
        rows = self._execute('''
            SELECT ts, value as v FROM telemetry 
            WHERE device_name = ? 
            ORDER BY ts DESC LIMIT 60
        ''', (device_name,))
        return list(reversed(rows))

    def get_historical_telemetry(self, device_name: str, days: int = 7) -> list:
        rows = self._execute('''
            SELECT ts, value as v FROM telemetry 
            WHERE device_name = ? AND ts > datetime('now', ?)
            ORDER BY ts ASC
        ''', (device_name, f'-{days} days'))
        return rows

    # ── Device heartbeat ──

    def update_device_heartbeat(self, device_name: str):
        self._execute('''
            UPDATE devices SET last_heartbeat = ? WHERE name = ?
        ''', (datetime.now().isoformat(), device_name), commit=True)

    # ── Script history ──

    def add_script_history(self, device_name: str, entry: dict):
        # Allow 'script' or 'script_content' as key since main.py and original used 'script'
        script_content = entry.get("script", entry.get("script_content", ""))
        self._execute('''
            INSERT INTO script_history (device_name, timestamp, script_content, description)
            VALUES (?, ?, ?, ?)
        ''', (
            device_name,
            entry.get("timestamp", datetime.now().isoformat()),
            script_content,
            entry.get("description", "")
        ), commit=True)

    def get_script_history(self, device_name: str) -> list:
        # Alias script_content to script to match frontend and engine expectations
        rows = self._execute('''
            SELECT timestamp, script_content as script, description 
            FROM script_history 
            WHERE device_name = ? 
            ORDER BY timestamp DESC LIMIT 10
        ''', (device_name,))
        return list(rows)

    def increment_workflow_run(self, workflow_id: str):
        self._execute('''
            UPDATE workflows 
            SET run_count = run_count + 1, last_run = ? 
            WHERE id = ?
        ''', (datetime.now().isoformat(), workflow_id), commit=True)

    # ── Camera Captures ──

    def save_capture(self, device_name: str, timestamp: str, detected_types: list, image_data: bytes):
        types_str = ",".join(detected_types)
        self._execute('''
            INSERT INTO captures (device_name, timestamp, detected_types, image_data)
            VALUES (?, ?, ?, ?)
        ''', (device_name, timestamp, types_str, sqlite3.Binary(image_data)), commit=True)

    def get_captures(self, device_name: str, limit: int = 10) -> list:
        rows = self._execute('''
            SELECT id, timestamp, detected_types 
            FROM captures 
            WHERE device_name = ? 
            ORDER BY timestamp DESC LIMIT ?
        ''', (device_name, limit))
        return list(rows)

    def get_capture_image(self, capture_id: int) -> bytes:
        rows = self._execute('SELECT image_data FROM captures WHERE id = ?', (capture_id,))
        if rows and rows[0]['image_data']:
            return rows[0]['image_data']
        return None
