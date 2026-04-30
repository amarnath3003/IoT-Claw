import csv
import io
from fastapi import FastAPI, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import json
import os
from dotenv import load_dotenv

load_dotenv()

from ai_agent import run_chat
from mqtt_client import MQTTClient
from storage import Storage
from execution_engine import ExecutionEngine
from security_camera import SecurityCameraSimulator

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)


storage_file = os.getenv("STORAGE_FILE", "storage.json")
check_interval = float(os.getenv("EXECUTION_ENGINE_INTERVAL", "5"))

manager = ConnectionManager()
storage = Storage(storage_file)
mqtt = MQTTClient(storage=storage, ws_broadcast_fn=manager.broadcast)
camera_service = SecurityCameraSimulator(storage=storage, ws_broadcast_fn=manager.broadcast)
engine = ExecutionEngine(storage=storage, mqtt=mqtt, check_interval=check_interval, camera_service=camera_service)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    camera_service.bind_loop(asyncio.get_running_loop())
    camera_service.ensure_registered()
    mqtt_host = os.getenv("MQTT_BROKER_HOST", "localhost")
    mqtt_port = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    mqtt.connect(host=mqtt_host, port=mqtt_port)
    asyncio.create_task(engine.run())
    yield
    # Shutdown
    camera_service.stop()
    mqtt.disconnect()


app = FastAPI(lifespan=lifespan, title="iotClaw API")

frontend_origins_env = os.getenv("FRONTEND_ORIGINS", "")
frontend_origins = [o.strip() for o in frontend_origins_env.split(",") if o.strip()]
if not frontend_origins:
    frontend_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/chat")
async def chat(body: dict):
    """Accept a chat message and return AI reply."""
    user_message = body.get("message", "")
    history = body.get("history", [])
    result = await run_chat(user_message, history, mqtt, storage, engine=engine)
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return result


@app.get("/state")
async def get_state():
    """Return current device state for all registered devices."""
    return storage.get_all_devices()


@app.post("/devices")
async def register_device(body: dict):
    """Register a new MQTT device."""
    storage.register_device(body)
    mqtt.subscribe(body["topic_base"] + "/state")
    storage.add_log(
        "success",
        "api",
        f"Registered device: {body['name']}",
        {"device": body["name"], "topic_base": body["topic_base"], "type": body.get("type", "generic")},
    )
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return {"status": "registered", "device": body}


@app.delete("/devices/{name}")
async def delete_device(name: str):
    """Delete a registered MQTT device."""
    ok = storage.delete_device(name)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Device '{name}' not found")
    storage.add_log("warning", "api", f"Deleted device: {name}", {"device": name})
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return {"status": "deleted", "device": name}


@app.post("/devices/{name}/command")
async def command_device(name: str, body: dict):
    """Send an ON/OFF command to a device, including simulated devices."""
    command = str(body.get("command", "")).upper()
    if command not in {"ON", "OFF"}:
        raise HTTPException(status_code=400, detail="command must be ON or OFF")
    result = engine.execute_device_action(name, command, source="api")
    if not result:
        raise HTTPException(status_code=404, detail=f"Device '{name}' not found")
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return {"status": "sent", "device": name, "command": command, "result": result}


@app.get("/devices/{name}/preview")
async def device_preview(name: str):
    """Return latest camera preview frame as JPEG."""
    device = storage.get_all_devices().get(name)
    if not device:
        raise HTTPException(status_code=404, detail=f"Device '{name}' not found")
    if device.get("type") != "security_camera" or name != camera_service.device_name:
        raise HTTPException(status_code=400, detail="Preview is only available for security camera devices")
    if str(device.get("status", "")).upper() != "ON":
        raise HTTPException(status_code=409, detail="Camera is OFF")

    frame = camera_service.get_latest_preview()
    if not frame:
        raise HTTPException(status_code=404, detail="Camera preview not ready")

    return Response(content=frame, media_type="image/jpeg", headers={"Cache-Control": "no-store, no-cache"})


@app.get("/devices/{name}/telemetry")
async def get_telemetry(name: str):
    """Return buffered sensor readings (last 60) for sparkline charts."""
    if name not in storage.get_all_devices():
        raise HTTPException(status_code=404, detail=f"Device '{name}' not found")
    return storage.get_telemetry(name)


@app.get("/devices/{name}/telemetry/export")
async def export_telemetry_csv(name: str):
    """Download buffered telemetry readings as a CSV file."""
    if name not in storage.get_all_devices():
        raise HTTPException(status_code=404, detail=f"Device '{name}' not found")
    readings = storage.get_telemetry(name)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["timestamp", "value"])
    for r in readings:
        writer.writerow([r["ts"], r["v"]])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{name}_telemetry.csv"'},
    )


@app.get("/devices/{name}/scripts")
async def get_script_history(name: str):
    """Return the last 10 scripts pushed to an edge device."""
    if name not in storage.get_all_devices():
        raise HTTPException(status_code=404, detail=f"Device '{name}' not found")
    return storage.get_script_history(name)


@app.post("/devices/{name}/scripts/{index}/rollback")
async def rollback_script(name: str, index: int):
    """Re-push a previous script version to an edge device."""
    device = storage.get_all_devices().get(name)
    if not device:
        raise HTTPException(status_code=404, detail=f"Device '{name}' not found")
    history = storage.get_script_history(name)
    if index >= len(history):
        raise HTTPException(status_code=404, detail=f"Script version {index} not found (history has {len(history)} entries)")
    entry = history[index]
    topic = device["topic_base"] + "/script"
    ok = mqtt.publish(topic, entry["script"])
    if ok:
        storage.add_script_history(name, {**entry, "description": f"[rollback] {entry['description']}"})
        storage.add_log("info", "api", f"Rolled back script on {name}: {entry['description']}", {"device": name, "version": index})
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return {"status": "rolled_back" if ok else "mqtt_failed", "device": name, "entry": entry}


@app.get("/logs")
async def get_logs(limit: int = Query(100, ge=1, le=500)):
    """Return recent activity logs."""
    return storage.get_logs(limit=limit)


@app.get("/workflows")
async def list_workflows():
    """Return all saved workflows."""
    return storage.get_workflows()


@app.post("/workflows")
async def create_workflow(body: dict):
    """Create a new automation workflow."""
    workflow = storage.save_workflow(body)
    engine._rebuild_chat_triggers()
    storage.add_log(
        "success",
        "api",
        f"Created workflow: {workflow.get('name', workflow['id'])}",
        {"workflow_id": workflow["id"], "trigger_type": workflow.get("trigger", {}).get("type", "sensor")},
    )
    return workflow


@app.patch("/workflows/{workflow_id}/toggle")
async def toggle_workflow(workflow_id: str):
    """Enable or disable a workflow by ID."""
    workflow = storage.toggle_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    state = "enabled" if workflow.get("enabled", True) else "disabled"
    engine._rebuild_chat_triggers()
    storage.add_log("info", "api", f"{state.title()} workflow: {workflow.get('name')}", {"workflow_id": workflow_id})
    return workflow


@app.post("/workflows/{workflow_id}/run")
async def run_workflow(workflow_id: str):
    """Run a saved workflow's actions manually."""
    workflow = next((w for w in storage.get_workflows() if w.get("id") == workflow_id), None)
    if not workflow:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    result = engine._execute_workflow_actions(workflow)
    storage.increment_workflow_run(workflow_id)
    storage.add_log("success", "api", f"Manually ran workflow: {workflow.get('name')}", {"workflow_id": workflow_id})
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return {"status": "ran", "workflow_id": workflow_id, "result": result}


@app.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str):
    """Delete a workflow by ID."""
    workflow = next((w for w in storage.get_workflows() if w.get("id") == workflow_id), None)
    storage.delete_workflow(workflow_id)
    engine._rebuild_chat_triggers()
    storage.add_log(
        "warning",
        "api",
        f"Deleted workflow: {workflow.get('name') if workflow else workflow_id}",
        {"workflow_id": workflow_id},
    )
    return {"status": "deleted"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send current state immediately on connect
        await websocket.send_json({"type": "state", "data": storage.get_all_devices()})
        while True:
            # Keep connection alive; updates are pushed by broadcast
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/")
async def root():
    return {"message": "iotClaw API is running", "docs": "/docs"}
