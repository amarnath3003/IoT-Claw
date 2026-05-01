import os
import shutil
import re

base_dir = r"c:\Users\amarn\OneDrive\Desktop\kochi\The-IOT-Claw\IoT-Claw\backend"

dirs_to_create = [
    "app",
    "app/core",
    "app/services",
    "app/api",
    "scripts"
]

for d in dirs_to_create:
    os.makedirs(os.path.join(base_dir, d), exist_ok=True)

moves = {
    "db.py": "app/core/db.py",
    "storage.py": "app/core/storage.py",
    "ai_agent.py": "app/services/ai_agent.py",
    "mqtt_client.py": "app/services/mqtt_client.py",
    "execution_engine.py": "app/services/execution_engine.py",
    "mcp_client.py": "app/services/mcp_client.py",
    "security_camera.py": "app/services/security_camera.py",
    "edge_compiler.py": "app/services/edge_compiler.py",
    "telegram_bot.py": "app/services/telegram_bot.py",
    "migrate_json_to_sqlite.py": "scripts/migrate_json_to_sqlite.py",
    "main.py": "app/main.py"
}

# Move files
for src, dest in moves.items():
    src_path = os.path.join(base_dir, src)
    dest_path = os.path.join(base_dir, dest)
    if os.path.exists(src_path):
        shutil.move(src_path, dest_path)
        print(f"Moved {src} to {dest}")

# Make __init__.py files
for d in ["app", "app/core", "app/services", "app/api"]:
    open(os.path.join(base_dir, d, "__init__.py"), "a").close()

# Replacements
replacements = {
    r"from ai_agent import": "from app.services.ai_agent import",
    r"import ai_agent": "import app.services.ai_agent as ai_agent",
    r"from mqtt_client import": "from app.services.mqtt_client import",
    r"from storage import": "from app.core.storage import",
    r"from execution_engine import": "from app.services.execution_engine import",
    r"from security_camera import": "from app.services.security_camera import",
    r"from edge_compiler import": "from app.services.edge_compiler import",
    r"from mcp_client import": "from app.services.mcp_client import",
    r"from telegram_bot import": "from app.services.telegram_bot import",
    r"from db import": "from app.core.db import"
}

def process_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    original = content
    for old, new in replacements.items():
        # Match word boundaries to avoid partial matches
        content = re.sub(r'^' + old + r'\b', new, content, flags=re.MULTILINE)
        
    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Updated imports in {filepath}")

# Process all .py files in app/
for root, _, files in os.walk(os.path.join(base_dir, "app")):
    for f in files:
        if f.endswith(".py"):
            process_file(os.path.join(root, f))
            
print("Refactoring complete.")
