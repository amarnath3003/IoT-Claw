import sqlite3
import os

db_path = 'iot_claw.db'
if not os.path.exists(db_path):
    print(f"Error: {db_path} not found")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT name, type, status FROM devices;")
        rows = cursor.fetchall()
        print("Devices in SQLite:")
        for row in rows:
            print(f"- {row[0]} ({row[1]}): {row[2]}")
    except Exception as e:
        print(f"Error reading DB: {e}")
    conn.close()
