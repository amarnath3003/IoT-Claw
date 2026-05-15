import csv
import io
from fastapi import FastAPI, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import json
import os
from dotenv import load_dotenv

load_dotenv(override=True)

from app.services.ai_agent import run_chat
from app.services.mqtt_client import MQTTClient
from app.core.storage import Storage
from app.services.execution_engine import ExecutionEngine
from app.services.security_camera import SecurityCameraSimulator
from app.services.edge_compiler import EdgeCompiler
from app.services.mcp_client import MCPClient
from app.services.telegram_bot import run_bot as run_telegram_bot
from app.services.zigbee_adapter import ZigbeeAdapter
from app.services.ha_adapter import HomeAssistantAdapter

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


check_interval = float(os.getenv("EXECUTION_ENGINE_INTERVAL", "5"))

manager = ConnectionManager()
storage = Storage()
mqtt = MQTTClient(storage=storage, ws_broadcast_fn=manager.broadcast)
camera_service = SecurityCameraSimulator(storage=storage, ws_broadcast_fn=manager.broadcast)
engine = ExecutionEngine(storage=storage, mqtt=mqtt, check_interval=check_interval, camera_service=camera_service, ws_broadcast_fn=manager.broadcast)
edge_compiler = EdgeCompiler(storage=storage)
mcp = MCPClient(mqtt=mqtt, storage=storage)
# Link MCPClient's pending registry into the MQTT client for response routing
mqtt.set_mcp_response_registry(mcp.pending)

zigbee_adapter = None
ha_adapter = None

async def telemetry_cleanup():
    while True:
        try:
            from db import get_connection
            conn = get_connection()
            conn.execute("DELETE FROM telemetry WHERE ts < datetime('now', '-30 days')")
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Telemetry cleanup error: {e}")
        await asyncio.sleep(86400) # Run once a day

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    camera_service.bind_loop(asyncio.get_running_loop())
    engine.bind_loop(asyncio.get_running_loop())
    camera_service.ensure_registered()
    mqtt_host = os.getenv("MQTT_BROKER_HOST", "localhost")
    mqtt_port = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    mqtt.connect(host=mqtt_host, port=mqtt_port)

    global zigbee_adapter, ha_adapter
    if os.getenv("ZIGBEE2MQTT_ENABLED", "false").lower() == "true":
        zigbee_adapter = ZigbeeAdapter(
            mqtt_client=mqtt,
            storage=storage,
            ws_broadcast_fn=manager.broadcast
        )
        mqtt.set_zigbee_adapter(zigbee_adapter)
        zigbee_adapter.start()
        print("[Zigbee] ZigbeeAdapter started")
        # Store a ref for AI agent to access
        storage._zigbee_ref = zigbee_adapter

    if os.getenv("HA_ENABLED", "false").lower() == "true":
        ha_adapter = HomeAssistantAdapter(
            storage=storage,
            ws_broadcast_fn=manager.broadcast
        )
        asyncio.create_task(ha_adapter.run())
        storage._ha_ref = ha_adapter
        print("[HA] HomeAssistantAdapter started")

    asyncio.create_task(engine.run())
    asyncio.create_task(telemetry_cleanup())
    # Start Telegram bot (runs in background; no-ops gracefully if token missing)
    asyncio.create_task(
        run_telegram_bot(run_chat, mqtt, storage, engine, manager.broadcast)
    )
    yield
    # Shutdown
    if ha_adapter:
        ha_adapter.stop()
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
    device = storage.get_all_devices().get(name)
    is_zigbee = device and device.get("zigbee")
    is_ha = device and device.get("ha_entity")

    if is_ha and ha_adapter:
        # Route to Home Assistant service call
        data = {"state": command}
        if "brightness_pct" in body:
            data["brightness_pct"] = int(body["brightness_pct"])
        if "brightness" in body:
            # HA brightness is 0-255; accept either raw or pct
            data["brightness"] = int(body["brightness"])
        if "color_temp" in body:
            data["color_temp"] = int(body["color_temp"])
        if "color_temp_kelvin" in body:
            data["color_temp_kelvin"] = int(body["color_temp_kelvin"])
        if "color" in body:
            data["rgb_color"] = body["color"]
        if "temperature" in body:
            data["temperature"] = body["temperature"]
        if "hvac_mode" in body:
            data["hvac_mode"] = body["hvac_mode"]
        result = await ha_adapter.call_service(name, data=data)
        result["status"] = "ha_service_call"
    elif is_zigbee and zigbee_adapter:
        # Build SET payload from command
        payload = {}
        if command in {"ON", "OFF", "TOGGLE"}:
            payload["state"] = command
        if "brightness" in body:
            payload["brightness"] = int(body["brightness"])
        if "color_temp" in body:
            payload["color_temp"] = int(body["color_temp"])
        if "color" in body:
            payload["color"] = body["color"]
        ok = zigbee_adapter.publish_command(name, payload)
        result = {"status": "zigbee_set", "ok": ok}
    else:
        if command not in {"ON", "OFF"}:
            raise HTTPException(status_code=400, detail="command must be ON or OFF")
        result = engine.execute_device_action(name, command, source="api")
        if not result:
            raise HTTPException(status_code=404, detail=f"Device '{name}' not found")
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])

    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return {"status": "sent", "device": name, "command": command, "result": result}


@app.post("/devices/{name}/zigbee/set")
async def zigbee_set(name: str, body: dict):
    """
    Send an arbitrary Zigbee SET payload to a device.
    body examples:
      {"state": "ON", "brightness": 200}
      {"color": {"r": 255, "g": 50, "b": 0}}
      {"color_temp": 300}
      {"effect": "colorloop"}
    """
    device = storage.get_all_devices().get(name)
    if not device:
        raise HTTPException(404, f"Device '{name}' not found")
    if not device.get("zigbee"):
        raise HTTPException(400, "This endpoint is only for Zigbee devices")
    if not zigbee_adapter:
        raise HTTPException(503, "Zigbee adapter not running")

    ok = zigbee_adapter.publish_command(name, body)
    storage.add_log("success" if ok else "error", "api",
                    f"Zigbee SET on {name}: {body}", {"device": name, "payload": body})
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return {"device": name, "payload": body, "ok": ok}


@app.post("/zigbee/permit_join")
async def permit_join(body: dict):
    """Open/close Zigbee pairing mode."""
    if not zigbee_adapter:
        raise HTTPException(503, "Zigbee adapter not running")
    enable   = body.get("enable", True)
    duration = body.get("duration", 254)
    result   = zigbee_adapter.permit_join(enable, duration)
    await manager.broadcast({"type": "zigbee_pairing", "active": enable, "duration": duration})
    return result


@app.delete("/zigbee/devices/{name}")
async def zigbee_remove(name: str, force: bool = False):
    """Remove a Zigbee device from the network."""
    if not zigbee_adapter:
        raise HTTPException(503, "Zigbee adapter not running")
    result = zigbee_adapter.remove_device(name, force)
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return result


@app.put("/zigbee/devices/{name}/rename")
async def zigbee_rename(name: str, body: dict):
    """Rename a Zigbee device."""
    if not zigbee_adapter:
        raise HTTPException(503, "Zigbee adapter not running")
    new_name = body.get("newName")
    if not new_name:
        raise HTTPException(400, "newName is required")
        
    result = zigbee_adapter.rename_device(name, new_name)
    
    # Update local storage explicitly
    devices = storage.get_all_devices()
    if name in devices:
        # Re-register under new name and delete old
        device = devices[name]
        device["name"] = new_name
        device["topic_base"] = device["topic_base"].replace(name, new_name)
        storage.register_device(device)
        storage.delete_device(name)
        
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return result


@app.get("/zigbee/status")
async def zigbee_status():
    """Return Zigbee2MQTT connection status."""
    enabled = os.getenv("ZIGBEE2MQTT_ENABLED", "false").lower() == "true"
    devices = storage.get_all_devices()
    zigbee_count = sum(1 for d in devices.values() if d.get("zigbee"))
    return {
        "enabled": enabled,
        "adapter_running": zigbee_adapter is not None,
        "zigbee_device_count": zigbee_count,
        "base_topic": os.getenv("ZIGBEE2MQTT_BASE_TOPIC", "zigbee2mqtt"),
    }


# ── Home Assistant Endpoints ──────────────────────────────────────────────────

@app.get("/ha/status")
async def ha_status():
    """Return Home Assistant adapter status and entity count."""
    enabled = os.getenv("HA_ENABLED", "false").lower() == "true"
    if not enabled:
        return {"enabled": False, "connected": False, "entity_count": 0}
    if not ha_adapter:
        return {"enabled": True, "connected": False, "entity_count": 0, "error": "Adapter not initialised"}
    return ha_adapter.get_status()


@app.post("/ha/entities/{entity_id:path}/set")
async def ha_entity_set(entity_id: str, body: dict):
    """
    Send an arbitrary service call to a Home Assistant entity.
    body examples:
      {"state": "ON", "brightness_pct": 80}
      {"state": "ON", "color_temp_kelvin": 4000}
      {"temperature": 22, "hvac_mode": "cool"}
      {"state": "OFF"}
    """
    device = storage.get_all_devices().get(entity_id)
    if not device:
        raise HTTPException(404, f"Entity '{entity_id}' not found")
    if not device.get("ha_entity"):
        raise HTTPException(400, "This endpoint is only for Home Assistant entities")
    if not ha_adapter:
        raise HTTPException(503, "Home Assistant adapter not running")

    result = await ha_adapter.call_service(entity_id, data=body)
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return {"entity_id": entity_id, "payload": body, "result": result}


@app.post("/ha/call_service")
async def ha_call_service(body: dict):
    """
    Raw Home Assistant service call. For advanced / AI use.
    body: {"domain": "light", "service": "turn_on", "entity_id": "light.kitchen", "data": {}}
    """
    if not ha_adapter:
        raise HTTPException(503, "Home Assistant adapter not running")

    domain     = body.get("domain")
    service    = body.get("service")
    entity_id  = body.get("entity_id", "")
    data       = body.get("data", {})

    if not domain or not service:
        raise HTTPException(400, "'domain' and 'service' are required")

    result = await ha_adapter.call_service(
        entity_id,
        service=f"{service}",   # pass as-is; adapter sends to HA
        data=data,
    )
    # Override domain in case it differs from entity domain
    import json as _json
    # Direct call to HA bypassing domain inference
    if ha_adapter._connected and ha_adapter._ws:
        payload = {
            "id":           ha_adapter._next_id(),
            "type":         "call_service",
            "domain":       domain,
            "service":      service,
            "service_data": data,
        }
        if entity_id:
            payload["target"] = {"entity_id": entity_id}
        await ha_adapter._ws.send_str(_json.dumps(payload))
        storage.add_log("success", "ha", f"Raw HA service: {domain}.{service}", body)
        result = {"ok": True, "domain": domain, "service": service}

    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return result


@app.post("/ha/refresh")
async def ha_refresh():
    """Force re-import of all HA entities."""
    if not ha_adapter:
        raise HTTPException(503, "Home Assistant adapter not running")
    count = await ha_adapter.force_refresh()
    return {"status": "refreshed", "entity_count": count}


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


@app.get("/devices/{name}/telemetry/history")
async def get_historical_telemetry(name: str, days: int = Query(7, ge=1, le=30)):
    """Return historical sensor readings for charting."""
    if name not in storage.get_all_devices():
        raise HTTPException(status_code=404, detail=f"Device '{name}' not found")
    return storage.get_historical_telemetry(name, days)


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


@app.post("/devices/{name}/mcp/call")
async def mcp_tool_call(name: str, body: dict):
    """Invoke a native MCP tool on an edge device and await the response."""
    device = storage.get_all_devices().get(name)
    if not device:
        raise HTTPException(status_code=404, detail=f"Device '{name}' not found")
    if device.get("type") != "micropython_edge_agent":
        raise HTTPException(status_code=400, detail="MCP tool calls are only supported on micropython_edge_agent devices")

    tool_name = body.get("tool")
    arguments = body.get("arguments", {})
    if not tool_name:
        raise HTTPException(status_code=400, detail="'tool' field is required")

    result = await mcp.call_tool(name, tool_name, arguments)
    storage.add_log(
        "info" if "error" not in result else "error",
        "mcp",
        f"MCP call {tool_name} on {name}",
        {"device": name, "tool": tool_name, "result": result}
    )
    return {"device": name, "tool": tool_name, "result": result}


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


@app.post("/workflows/{workflow_id}/deploy")
async def deploy_workflow(workflow_id: str):
    """Compile a workflow and deploy it to an edge device."""
    workflow = next((w for w in storage.get_workflows() if w.get("id") == workflow_id), None)
    if not workflow:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
        
    try:
        target_device, compiled_script = edge_compiler.compile(workflow)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    device_data = storage.get_all_devices().get(target_device)
    if not device_data:
        raise HTTPException(status_code=404, detail=f"Device '{target_device}' not found")

    topic = device_data["topic_base"] + "/script"
    ok = mqtt.publish(topic, compiled_script)
    
    if ok:
        # Save state to storage
        storage.update_workflow_deployed(workflow_id, target_device, True)
        storage.add_script_history(target_device, {
            "timestamp": __import__('datetime').datetime.now().isoformat(),
            "script": compiled_script,
            "description": f"[compiled] Workflow: {workflow.get('name')}"
        })
        storage.add_log("success", "api", f"Deployed workflow '{workflow.get('name')}' to {target_device}", {"workflow_id": workflow_id, "device": target_device})
        
    return {"status": "deployed" if ok else "mqtt_failed", "workflow_id": workflow_id, "device": target_device}


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


@app.get("/telegram/status")
async def telegram_status():
    """Return Telegram bot configuration status."""
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
    return {
        "telegram_bot_enabled": bool(token),
        "token_configured": bool(token),
        "allowed_chat_id": chat_id or "(all chats allowed)",
        "status": "running" if token else "disabled — set TELEGRAM_BOT_TOKEN in .env",
    }


@app.get("/")
async def root():
    return {"message": "iotClaw API is running", "docs": "/docs"}
