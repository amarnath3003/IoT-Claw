from fastapi import FastAPI, WebSocket, WebSocketDisconnect
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
engine = ExecutionEngine(storage=storage, mqtt=mqtt, check_interval=check_interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    mqtt_host = os.getenv("MQTT_BROKER_HOST", "localhost")
    mqtt_port = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    mqtt.connect(host=mqtt_host, port=mqtt_port)
    asyncio.create_task(engine.run())
    yield
    # Shutdown
    mqtt.disconnect()


app = FastAPI(lifespan=lifespan, title="iotClaw API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/chat")
async def chat(body: dict):
    """Accept a chat message and return AI reply."""
    user_message = body.get("message", "")
    history = body.get("history", [])
    reply = await run_chat(user_message, history, mqtt, storage)
    return {"reply": reply}


@app.get("/state")
async def get_state():
    """Return current device state for all registered devices."""
    return storage.get_all_devices()


@app.post("/devices")
async def register_device(body: dict):
    """Register a new MQTT device."""
    storage.register_device(body)
    mqtt.subscribe(body["topic_base"] + "/state")
    return {"status": "registered", "device": body}


@app.get("/workflows")
async def list_workflows():
    """Return all saved workflows."""
    return storage.get_workflows()


@app.post("/workflows")
async def create_workflow(body: dict):
    """Create a new automation workflow."""
    workflow = storage.save_workflow(body)
    return workflow


@app.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str):
    """Delete a workflow by ID."""
    storage.delete_workflow(workflow_id)
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