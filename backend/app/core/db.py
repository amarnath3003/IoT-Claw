import sqlite3
import os

# Put the database in the backend root directory (where main.py's parent is)
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "iot_claw.db"))

def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Enable Write-Ahead Logging for better concurrency
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Create devices table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS devices (
            name TEXT PRIMARY KEY,
            topic_base TEXT,
            type TEXT,
            status TEXT,
            location TEXT,
            description TEXT,
            unit TEXT,
            brightness INTEGER,
            last_updated DATETIME,
            last_heartbeat DATETIME,
            created_at DATETIME,
            capabilities TEXT,
            simulated BOOLEAN,
            zigbee BOOLEAN,
            ieee_address TEXT,
            vendor TEXT,
            model TEXT,
            last_detection TEXT,
            last_snapshot TEXT,
            integration_source TEXT DEFAULT 'mqtt'
        )
    ''')

    # ── Schema migrations (safe on existing databases) ────────────────────────

    # Add integration_source column to existing databases that predate it.
    # SQLite does not support ADD COLUMN IF NOT EXISTS, so we catch the error.
    try:
        cursor.execute(
            "ALTER TABLE devices ADD COLUMN integration_source TEXT DEFAULT 'mqtt'"
        )
        conn.commit()
        print("[DB] Migration: added integration_source column")
    except sqlite3.OperationalError:
        pass  # Column already exists — nothing to do

    # Backfill integration_source for devices registered before this migration.
    # Priority: explicit zigbee flag > type prefix > default 'mqtt'.
    cursor.execute("""
        UPDATE devices
        SET integration_source = 'zigbee'
        WHERE zigbee = 1
          AND (integration_source IS NULL OR integration_source = 'mqtt')
    """)
    cursor.execute("""
        UPDATE devices
        SET integration_source = 'ha'
        WHERE type LIKE 'ha_%'
          AND (integration_source IS NULL OR integration_source = 'mqtt')
    """)
    conn.commit()

    # Create telemetry table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_name TEXT,
            ts DATETIME,
            value REAL,
            FOREIGN KEY(device_name) REFERENCES devices(name) ON DELETE CASCADE
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts ON telemetry(device_name, ts DESC)')

    # Create workflows table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY,
            config TEXT,
            enabled BOOLEAN,
            run_count INTEGER,
            last_run DATETIME,
            deployed_to_edge BOOLEAN,
            created_at DATETIME
        )
    ''')

    # Create script_history table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS script_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_name TEXT,
            timestamp DATETIME,
            script_content TEXT,
            description TEXT,
            FOREIGN KEY(device_name) REFERENCES devices(name) ON DELETE CASCADE
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_script_history_device_ts ON script_history(device_name, timestamp DESC)')

    # Create logs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY,
            ts DATETIME,
            level TEXT,
            source TEXT,
            message TEXT,
            detail TEXT
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts DESC)')

    # Create captures table for camera images
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS captures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_name TEXT,
            timestamp DATETIME,
            detected_types TEXT,
            image_data BLOB,
            FOREIGN KEY(device_name) REFERENCES devices(name) ON DELETE CASCADE
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_captures_device_ts ON captures(device_name, timestamp DESC)')

    # Create groups table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT DEFAULT '#6b8cff',
            icon TEXT DEFAULT '⬡',
            created_at DATETIME
        )
    ''')

    # Create device_groups junction table (many devices ↔ many groups)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS device_groups (
            device_name TEXT NOT NULL,
            group_id TEXT NOT NULL,
            PRIMARY KEY (device_name, group_id),
            FOREIGN KEY(device_name) REFERENCES devices(name) ON DELETE CASCADE,
            FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_device_groups_group ON device_groups(group_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_device_groups_device ON device_groups(device_name)')

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print(f"Database initialized at {DB_PATH}")
