import json
import sqlite3
import os
import sys

from db import get_connection, init_db

def migrate():
    storage_path = os.path.join(os.path.dirname(__file__), 'storage.json')
    if not os.path.exists(storage_path):
        print(f"No storage.json found at {storage_path}. Nothing to migrate.")
        return

    with open(storage_path, "r") as f:
        data = json.load(f)

    # Initialize SQLite DB
    init_db()
    conn = get_connection()
    cursor = conn.cursor()

    # Migrate Devices
    devices = data.get("devices", {})
    for name, d in devices.items():
        capabilities = json.dumps(d.get("capabilities", []))
        cursor.execute('''
            INSERT OR REPLACE INTO devices (
                name, topic_base, type, status, location, description, 
                unit, brightness, last_updated, last_heartbeat, created_at, 
                capabilities, simulated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            name,
            d.get("topic_base"),
            d.get("type", "generic"),
            d.get("status", "unknown"),
            d.get("location", ""),
            d.get("description", ""),
            d.get("unit", ""),
            d.get("brightness"),
            d.get("last_updated"),
            d.get("last_heartbeat"),
            d.get("created_at"),
            capabilities,
            d.get("simulated", False)
        ))

        # Migrate script history for this device
        history = d.get("script_history", [])
        for entry in history:
            cursor.execute('''
                INSERT INTO script_history (device_name, timestamp, script_content, description)
                VALUES (?, ?, ?, ?)
            ''', (
                name,
                entry.get("timestamp"),
                entry.get("script_content", ""),
                entry.get("description", "")
            ))

    # Migrate Workflows
    workflows = data.get("workflows", [])
    for w in workflows:
        # copy dict to avoid modifying original when deleting 'id'
        w_config = dict(w)
        w_id = w_config.pop("id", None)
        if not w_id:
            continue
        enabled = w_config.pop("enabled", True)
        run_count = w_config.pop("run_count", 0)
        last_run = w_config.pop("last_run", None)
        deployed_to_edge = w_config.pop("deployed_to_edge", False)
        created_at = w_config.pop("created_at", None)

        cursor.execute('''
            INSERT OR REPLACE INTO workflows (
                id, config, enabled, run_count, last_run, deployed_to_edge, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            w_id,
            json.dumps(w_config),
            enabled,
            run_count,
            last_run,
            deployed_to_edge,
            created_at
        ))

    # Migrate Logs
    logs = data.get("logs", [])
    for log in logs:
        detail = json.dumps(log.get("detail", {}))
        cursor.execute('''
            INSERT OR REPLACE INTO logs (id, ts, level, source, message, detail)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            log.get("id"),
            log.get("ts"),
            log.get("level"),
            log.get("source"),
            log.get("message"),
            detail
        ))

    conn.commit()
    conn.close()
    print("Migration from storage.json to SQLite complete!")

if __name__ == "__main__":
    migrate()
