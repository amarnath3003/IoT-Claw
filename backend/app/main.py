import csv
import io
from fastapi import FastAPI, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import asyncio
import json
import os
from dotenv import load_dotenv

load_dotenv(override=True)

from app.integrations import IntegrationRegistry
from app.services.ai_agent import run_chat, run_chat_stream
from app.services.mqtt_client import MQTTClient
from app.core.storage import Storage
from app.services.execution_engine import ExecutionEngine
from app.services.security_camera import SecurityCameraSimulator
from app.services.rtsp_camera import RTSPCameraManager
from app.services.edge_compiler import EdgeCompiler
from app.services.mcp_client import MCPClient
from app.services.telegram_bot import run_bot as run_telegram_bot
from app.services.zigbee_adapter import ZigbeeAdapter
from app.services.ha_adapter import HomeAssistantAdapter
from app.services.autonomous_agent import (
    AutonomousAgent,
    get_recent_cycles,
    get_all_settings,
    update_settings,
)

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

# Laptop webcam simulator (gated by SECURITY_CAMERA_ENABLED env flag)
_webcam_enabled = os.getenv("SECURITY_CAMERA_ENABLED", "true").lower() == "true"
camera_service = SecurityCameraSimulator(storage=storage, ws_broadcast_fn=manager.broadcast) if _webcam_enabled else None

# RTSP IP camera manager (no-op if RTSP_CAMERA_URL not set)
rtsp_manager = RTSPCameraManager(storage=storage, ws_broadcast_fn=manager.broadcast)

engine = ExecutionEngine(storage=storage, mqtt=mqtt, check_interval=check_interval, camera_service=camera_service, ws_broadcast_fn=manager.broadcast)
autonomous = AutonomousAgent(
    storage=storage,
    mqtt=mqtt,
    engine=engine,
    ws_broadcast_fn=manager.broadcast,
)
edge_compiler = EdgeCompiler(storage=storage)
mcp = MCPClient(mqtt=mqtt, storage=storage)
# Link MCPClient's pending registry into the MQTT client for response routing
mqtt.set_mcp_response_registry(mcp.pending)

# ── Integration Registry ──────────────────────────────────────────────────────
# Populated during lifespan startup based on enabled env vars.
registry = IntegrationRegistry()

# Legacy direct references kept for Zigbee/HA-specific REST endpoints.
zigbee_adapter: ZigbeeAdapter | None = None
ha_adapter: HomeAssistantAdapter | None = None


async def telemetry_cleanup():
    while True:
        try:
            from app.core.db import get_connection
            conn = get_connection()
            conn.execute("DELETE FROM telemetry WHERE ts < datetime('now', '-30 days')")
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Telemetry cleanup error: {e}")
        await asyncio.sleep(86400)  # Run once a day


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    # Bind event loops for thread-safe async dispatching
    if camera_service:
        camera_service.bind_loop(asyncio.get_running_loop())
        camera_service.ensure_registered()
    rtsp_manager.bind_loop(asyncio.get_running_loop())
    rtsp_manager.start_all()
    engine.bind_loop(asyncio.get_running_loop())

    # Start MQTT transport (legacy synchronous connect path)
    mqtt_host = os.getenv("MQTT_BROKER_HOST", "localhost")
    mqtt_port = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    mqtt.connect(host=mqtt_host, port=mqtt_port)

    global zigbee_adapter, ha_adapter

    if os.getenv("ZIGBEE2MQTT_ENABLED", "false").lower() == "true":
        zigbee_adapter = ZigbeeAdapter(storage, manager.broadcast, mqtt_client=mqtt)
        mqtt.set_zigbee_adapter(zigbee_adapter)
        registry.register(zigbee_adapter)
        print("[Zigbee] ZigbeeAdapter registered")

    if os.getenv("HA_ENABLED", "false").lower() == "true":
        ha_adapter = HomeAssistantAdapter(storage, manager.broadcast)
        registry.register(ha_adapter)
        print("[HA] HomeAssistantAdapter registered")

    # Start all registered integrations (Zigbee subscribes, HA launches WS loop)
    await registry.start_all()

    asyncio.create_task(engine.run())
    autonomous.bind_loop(asyncio.get_running_loop())
    asyncio.create_task(autonomous.run())
    asyncio.create_task(telemetry_cleanup())
    # Start Telegram bot (no-ops gracefully if token missing)
    asyncio.create_task(
        run_telegram_bot(run_chat, mqtt, storage, engine, manager.broadcast)
    )
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    await registry.stop_all()
    rtsp_manager.stop_all()
    if camera_service:
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

# Serve HLS segments for browser-native video playback
import pathlib as _pathlib
_hls_dir = _pathlib.Path("hls")
_hls_dir.mkdir(exist_ok=True)
app.mount("/hls", StaticFiles(directory=str(_hls_dir)), name="hls")


@app.post("/chat")
async def chat(body: dict):
    """Accept a chat message and return AI reply."""
    user_message = body.get("message", "")
    history = body.get("history", [])
    result = await run_chat(user_message, history, mqtt, storage, engine=engine, registry=registry)
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return result


@app.post("/chat/stream")
async def chat_stream(body: dict):
    """Streaming SSE endpoint — yields tokens as they arrive."""
    user_message = body.get("message", "")
    history = body.get("history", [])

    async def generate():
        async for chunk in run_chat_stream(user_message, history, mqtt, storage, engine=engine, registry=registry):
            yield chunk
        await manager.broadcast({"type": "state", "data": storage.get_all_devices()})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/state")
async def get_state():
    """Return current device state for all registered devices."""
    return storage.get_all_devices()


@app.post("/devices")
async def register_device(body: dict):
    """Register a new device (MQTT, Zigbee, or HA)."""
    storage.register_device(body)
    # Only subscribe to MQTT for protocols that actually use it.
    # HA devices use a virtual topic_base (ha/<entity_id>) — subscribing
    # to that on MQTT would silently receive nothing and is misleading.
    src = body.get("integration_source", "mqtt")
    if src != "ha":
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
    """Delete a registered device."""
    ok = storage.delete_device(name)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Device '{name}' not found")
    storage.add_log("warning", "api", f"Deleted device: {name}", {"device": name})
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return {"status": "deleted", "device": name}


@app.post("/devices/{name}/command")
async def command_device(name: str, body: dict):
    """Send a command to a device, routing to the correct integration automatically."""
    command = str(body.get("command", "")).upper()
    device = storage.get_all_devices().get(name)
    if not device:
        raise HTTPException(status_code=404, detail=f"Device '{name}' not found")

    src = device.get("integration_source") or "mqtt"

    if src in ("zigbee", "ha"):
        # Route through IntegrationRegistry — adapter handles param translation
        params = {k: v for k, v in body.items() if k != "command"}
        result = await registry.send_command(device, command, params)
    else:
        # MQTT path — use ExecutionEngine for full feature support
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


@app.get("/ha/diagnose")
async def ha_diagnose():
    """Diagnostic endpoint to troubleshoot Home Assistant connectivity."""
    import socket
    import aiohttp

    enabled = os.getenv("HA_ENABLED", "false").lower() == "true"
    ha_host = os.getenv("HA_HOST", "localhost")
    ha_port = int(os.getenv("HA_PORT", "8123"))
    ha_token = os.getenv("HA_TOKEN", "")

    diagnostics = {
        "enabled": enabled,
        "config": {
            "host": ha_host,
            "port": ha_port,
            "token_present": bool(ha_token and not ha_token.startswith("eyJ")),
        },
        "checks": {}
    }

    if not enabled:
        return {"status": "disabled", "diagnostics": diagnostics}

    # Check 1: DNS resolution
    try:
        socket.gethostbyname(ha_host)
        diagnostics["checks"]["dns"] = {"status": "pass", "message": f"{ha_host} resolves"}
    except socket.gaierror as e:
        diagnostics["checks"]["dns"] = {"status": "fail", "message": f"Cannot resolve {ha_host}: {e}"}

    # Check 2: TCP connectivity
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex((ha_host, ha_port))
        sock.close()
        if result == 0:
            diagnostics["checks"]["tcp"] = {"status": "pass", "message": f"Port {ha_port} is open"}
        else:
            diagnostics["checks"]["tcp"] = {"status": "fail", "message": f"Port {ha_port} is closed/unreachable"}
    except Exception as e:
        diagnostics["checks"]["tcp"] = {"status": "fail", "message": f"TCP check failed: {e}"}

    # Check 3: WebSocket connectivity
    try:
        url = f"ws://{ha_host}:{ha_port}/api/websocket"
        timeout = aiohttp.ClientTimeout(total=10)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            try:
                async with session.ws_connect(url) as ws:
                    await asyncio.wait_for(ws.receive(), timeout=5)
                    diagnostics["checks"]["websocket"] = {"status": "pass", "message": "WebSocket connects and receives"}
            except asyncio.TimeoutError:
                diagnostics["checks"]["websocket"] = {"status": "fail", "message": "WebSocket timeout (HA might be down)"}
            except Exception as e:
                diagnostics["checks"]["websocket"] = {"status": "fail", "message": f"WebSocket error: {type(e).__name__}"}
    except Exception as e:
        diagnostics["checks"]["websocket"] = {"status": "fail", "message": f"Cannot test WebSocket: {e}"}

    # Check 4: Token presence
    if not ha_token or ha_token.startswith("eyJ"):
        diagnostics["checks"]["token"] = {"status": "fail", "message": "No valid token or using example token"}
    else:
        diagnostics["checks"]["token"] = {"status": "pass", "message": "Token is set"}

    if ha_adapter:
        diagnostics["adapter_status"] = ha_adapter.get_status()

    return diagnostics


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

    domain    = body.get("domain")
    service   = body.get("service")
    entity_id = body.get("entity_id", "")
    data      = body.get("data", {})

    if not domain or not service:
        raise HTTPException(400, "'domain' and 'service' are required")

    result = {"ok": False, "error": "HA WebSocket not available"}
    if ha_adapter._connected and ha_adapter._ws:
        import json as _json
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


@app.get("/autonomous/status")
async def autonomous_status():
    """Return autonomous agent status and current settings."""
    return autonomous.get_status()


@app.get("/autonomous/cycles")
async def autonomous_cycles(limit: int = Query(30, ge=1, le=200)):
    """Return recent autonomous reasoning cycles."""
    return get_recent_cycles(limit=limit)


@app.post("/autonomous/trigger")
async def autonomous_trigger():
    """Manually trigger one autonomous reasoning cycle immediately."""
    cycle = await autonomous.run_cycle()
    return {"status": "triggered", "cycle": cycle}


@app.patch("/autonomous/settings")
async def autonomous_update_settings(body: dict):
    """Update autonomous agent settings (enabled, interval, aggression, etc.)."""
    allowed_keys = {"enabled", "interval", "aggression", "max_actions", "paused_until"}
    filtered = {k: v for k, v in body.items() if k in allowed_keys}
    if not filtered:
        raise HTTPException(status_code=400, detail="No valid settings provided")
    update_settings(filtered)
    return {"status": "updated", "settings": get_all_settings()}


@app.get("/autonomous/settings")
async def autonomous_get_settings():
    """Get all autonomous agent settings."""
    return get_all_settings()


@app.post("/ha/refresh")
async def ha_refresh():
    """Force re-import of all HA entities."""
    if not ha_adapter:
        raise HTTPException(503, "Home Assistant adapter not running")
    count = await ha_adapter.force_refresh()
    return {"status": "refreshed", "entity_count": count}


@app.get("/devices/{name}/preview")
async def device_preview(name: str):
    """Return latest camera preview frame as JPEG (supports webcam + RTSP ip_camera)."""
    device = storage.get_all_devices().get(name)
    if not device:
        raise HTTPException(status_code=404, detail=f"Device '{name}' not found")

    dtype = device.get("type", "")

    # RTSP IP camera path
    if dtype == "ip_camera":
        if str(device.get("status", "")).upper() != "ON":
            raise HTTPException(status_code=409, detail="Camera is OFF")
        frame = rtsp_manager.get_preview(name)
        if not frame:
            raise HTTPException(status_code=404, detail="Camera preview not ready")
        return Response(content=frame, media_type="image/jpeg",
                        headers={"Cache-Control": "no-store, no-cache"})

    # Laptop webcam path
    if dtype == "security_camera" and camera_service and name == camera_service.device_name:
        if str(device.get("status", "")).upper() != "ON":
            raise HTTPException(status_code=409, detail="Camera is OFF")
        frame = camera_service.get_latest_preview()
        if not frame:
            raise HTTPException(status_code=404, detail="Camera preview not ready")
        return Response(content=frame, media_type="image/jpeg",
                        headers={"Cache-Control": "no-store, no-cache"})

    raise HTTPException(status_code=400, detail="Preview not available for this device type")


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


# ── RTSP Camera Endpoints ──────────────────────────────────────────────────────

@app.get("/cameras")
async def list_cameras():
    """List all configured RTSP IP cameras with stream status and last detection."""
    return rtsp_manager.list_cameras()


@app.get("/cameras/{name}")
async def get_camera(name: str):
    """Get status and last detection result for a specific camera."""
    cam = rtsp_manager.get_camera(name)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera '{name}' not found")
    return cam


@app.post("/cameras/{name}/start")
async def start_camera(name: str):
    """Start an RTSP camera stream."""
    result = rtsp_manager.start_camera(name)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return result


@app.post("/cameras/{name}/stop")
async def stop_camera(name: str):
    """Stop an RTSP camera stream."""
    result = rtsp_manager.stop_camera(name)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return result


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        await websocket.send_json({"type": "state", "data": storage.get_all_devices()})
        while True:
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


# ── Device Groups ─────────────────────────────────────────────────────────────

@app.get("/groups")
async def list_groups():
    """Return all device groups with their member device names."""
    return storage.get_all_groups()


@app.post("/groups")
async def create_group(body: dict):
    """Create a new device group."""
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required.")
    color = body.get("color", "#6b8cff")
    icon  = body.get("icon", "⬡")
    group = storage.create_group(name=name, color=color, icon=icon)
    storage.add_log("success", "api", f"Created group: {name}", {"group_id": group["id"]})
    return group


@app.put("/groups/{group_id}")
async def update_group(group_id: str, body: dict):
    """Update a group's name, color, and/or icon."""
    group = storage.update_group(
        group_id,
        name=body.get("name"),
        color=body.get("color"),
        icon=body.get("icon"),
    )
    if group is None:
        raise HTTPException(status_code=404, detail=f"Group '{group_id}' not found.")
    return group


@app.delete("/groups/{group_id}")
async def delete_group(group_id: str):
    """Delete a group (devices are NOT deleted, only the grouping)."""
    ok = storage.delete_group(group_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Group '{group_id}' not found.")
    storage.add_log("warning", "api", f"Deleted group: {group_id}", {"group_id": group_id})
    return {"status": "deleted", "group_id": group_id}


@app.post("/groups/{group_id}/devices")
async def add_device_to_group(group_id: str, body: dict):
    """Add a device to a group."""
    device_name = (body.get("device_name") or "").strip()
    if not device_name:
        raise HTTPException(status_code=400, detail="device_name is required.")
    ok = storage.add_device_to_group(group_id, device_name)
    if not ok:
        raise HTTPException(status_code=404, detail="Group or device not found.")
    return {"status": "added", "group_id": group_id, "device_name": device_name}


@app.delete("/groups/{group_id}/devices/{device_name}")
async def remove_device_from_group(group_id: str, device_name: str):
    """Remove a device from a group."""
    ok = storage.remove_device_from_group(group_id, device_name)
    if not ok:
        raise HTTPException(status_code=404, detail="Membership not found.")
    return {"status": "removed", "group_id": group_id, "device_name": device_name}


@app.post("/groups/{group_id}/command")
async def command_group(group_id: str, body: dict):
    """Send a command to all devices in a group."""
    command = str(body.get("command", "")).upper()
    if command not in {"ON", "OFF"}:
        raise HTTPException(status_code=400, detail="command must be ON or OFF")

    groups = storage.get_all_groups()
    group  = next((g for g in groups if g["id"] == group_id), None)
    if group is None:
        raise HTTPException(status_code=404, detail=f"Group '{group_id}' not found.")

    all_devices = storage.get_all_devices()
    results = []
    for device_name in group["devices"]:
        device = all_devices.get(device_name)
        if not device:
            results.append({"device": device_name, "status": "not_found"})
            continue
        src = device.get("integration_source") or "mqtt"
        try:
            if src in ("zigbee", "ha"):
                params = {k: v for k, v in body.items() if k != "command"}
                result = await registry.send_command(device, command, params)
            else:
                result = engine.execute_device_action(device_name, command, source="group_api")
            results.append({"device": device_name, "status": "sent", "result": result})
        except Exception as e:
            results.append({"device": device_name, "status": "error", "error": str(e)})

    storage.add_log(
        "info", "api",
        f"Group command: {command} → {group['name']} ({len(group['devices'])} devices)",
        {"group_id": group_id, "command": command},
    )
    await manager.broadcast({"type": "state", "data": storage.get_all_devices()})
    return {"status": "sent", "group_id": group_id, "command": command, "results": results}
