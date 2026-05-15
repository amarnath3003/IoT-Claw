"""
HomeAssistantAdapter
────────────────────
Bridges Home Assistant ↔ IoT-Claw via the HA WebSocket API.

Responsibilities:
  1. Connect to ws://HA_HOST:HA_PORT/api/websocket and authenticate
  2. Fetch all entity states on startup → auto-register as IoT-Claw devices
  3. Subscribe to state_changed events → real-time status sync
  4. Expose call_service() to control any HA entity
  5. Auto-reconnect with exponential back-off on disconnect
"""

import asyncio
import json
import logging
import os
from datetime import datetime

logger = logging.getLogger(__name__)

# ── Domain → IoT-Claw device type mapping ────────────────────────────────────

DOMAIN_TYPE_MAP = {
    "light":          "ha_light",
    "switch":         "ha_switch",
    "sensor":         "ha_sensor",
    "binary_sensor":  "ha_binary_sensor",
    "climate":        "ha_climate",
    "media_player":   "ha_media_player",
    "cover":          "ha_cover",
    "lock":           "ha_lock",
    "fan":            "ha_fan",
    "vacuum":         "ha_vacuum",
    "input_boolean":  "ha_switch",
    "automation":     "ha_automation",
    "scene":          "ha_scene",
    "script":         "ha_script",
    "camera":         "ha_camera",
    "alarm_control_panel": "ha_alarm",
    "water_heater":   "ha_climate",
    "humidifier":     "ha_switch",
}

# Domains that are controllable (not just read-only)
CONTROLLABLE_DOMAINS = {
    "light", "switch", "climate", "media_player", "cover",
    "lock", "fan", "vacuum", "input_boolean", "automation",
    "scene", "script", "water_heater", "humidifier",
}

# Domains to skip entirely (noisy/internal)
SKIP_DOMAINS = {
    "persistent_notification", "device_tracker", "zone",
    "sun", "weather", "person", "update", "number",
    "select", "button", "text", "date", "time", "datetime",
    "event", "todo", "conversation", "stt", "tts", "wake_word",
}


def _infer_unit(state_obj: dict) -> str:
    """Extract unit_of_measurement from HA state attributes."""
    attrs = state_obj.get("attributes", {})
    return attrs.get("unit_of_measurement", "")


def _ha_state_to_iotclaw_status(state_obj: dict) -> str:
    """Convert HA state string to IoT-Claw status."""
    state = state_obj.get("state", "unknown")
    # Normalize on/off to uppercase
    if state in ("on", "home", "open", "unlocked", "playing"):
        return "ON"
    if state in ("off", "not_home", "closed", "locked", "paused", "idle", "standby"):
        return "OFF"
    # Numeric sensor values pass through as-is
    return state


def _build_device_record(state_obj: dict, area_name: str = "") -> dict | None:
    """Convert a HA state object into an IoT-Claw device record."""
    entity_id: str = state_obj.get("entity_id", "")
    if not entity_id:
        return None

    domain = entity_id.split(".")[0]

    # Skip internal/noisy domains
    if domain in SKIP_DOMAINS:
        return None

    attrs = state_obj.get("attributes", {})
    friendly_name = attrs.get("friendly_name", entity_id)
    device_type = DOMAIN_TYPE_MAP.get(domain, "ha_generic")
    status = _ha_state_to_iotclaw_status(state_obj)
    unit = _infer_unit(state_obj)

    # Build a capabilities list from known attributes
    capabilities = []
    if domain == "light":
        supported = attrs.get("supported_color_modes", [])
        if "brightness" in supported or "color_temp" in supported or "hs" in supported or "rgb" in supported:
            capabilities.append({"name": "brightness", "type": "numeric", "access": 3})
        if "color_temp" in supported:
            capabilities.append({"name": "color_temp", "type": "numeric", "access": 3})
        if any(m in supported for m in ("hs", "rgb", "xy")):
            capabilities.append({"name": "color", "type": "color", "access": 3})
        capabilities.append({"name": "state", "type": "binary", "access": 3})
    elif domain == "climate":
        capabilities = [
            {"name": "temperature", "type": "numeric", "access": 3},
            {"name": "hvac_mode", "type": "enum", "access": 3},
            {"name": "current_temperature", "type": "numeric", "access": 1},
        ]
    elif domain in ("sensor", "binary_sensor"):
        capabilities = [{"name": "state", "type": "numeric", "access": 1}]

    # Extra metadata stored in the record
    description = friendly_name
    if area_name:
        description = f"{friendly_name} ({area_name})"

    return {
        "name":         entity_id,
        "topic_base":   f"ha/{entity_id}",    # virtual, not real MQTT
        "type":         device_type,
        "status":       status,
        "location":     area_name,
        "description":  description,
        "unit":         unit,
        "brightness":   attrs.get("brightness"),
        "capabilities": capabilities,
        "simulated":    False,
        "zigbee":       False,
        "ha_entity":    True,
        "ha_domain":    domain,
        "ieee_address": "",
        "vendor":       "Home Assistant",
        "model":        attrs.get("model", ""),
        "created_at":   datetime.now().isoformat(),
    }


class HomeAssistantAdapter:
    """
    Async adapter that connects IoT-Claw to Home Assistant via the WebSocket API.
    Designed to be started as an asyncio.Task from main.py lifespan.
    """

    def __init__(self, storage, ws_broadcast_fn=None):
        self.storage = storage
        self.ws_broadcast_fn = ws_broadcast_fn

        self._host: str = os.getenv("HA_HOST", "localhost")
        self._port: int = int(os.getenv("HA_PORT", "8123"))
        self._token: str = os.getenv("HA_TOKEN", "")
        self._domain_filter: set[str] = self._parse_domain_filter()

        self._ws = None
        self._msg_id: int = 1
        self._connected: bool = False
        self._entity_count: int = 0
        self._reconnect_delay: float = 5.0   # seconds, grows on failure
        self._max_reconnect_delay: float = 60.0
        self._running: bool = True

        # Track pending calls: msg_id → asyncio.Future
        self._pending: dict[int, asyncio.Future] = {}

    def _parse_domain_filter(self) -> set[str]:
        raw = os.getenv("HA_DOMAIN_FILTER", "")
        if not raw.strip():
            return set()  # empty = import all
        return {d.strip().lower() for d in raw.split(",") if d.strip()}

    # ── Public API ────────────────────────────────────────────────────────────

    def get_status(self) -> dict:
        devices = self.storage.get_all_devices()
        ha_count = sum(1 for d in devices.values() if d.get("ha_entity"))
        return {
            "enabled":       True,
            "connected":     self._connected,
            "host":          self._host,
            "port":          self._port,
            "entity_count":  ha_count,
            "domain_filter": list(self._domain_filter) if self._domain_filter else "all",
        }

    async def call_service(
        self,
        entity_id: str,
        service: str | None = None,
        data: dict | None = None,
    ) -> dict:
        """
        Call a HA service for the given entity_id.
        If service is None, we auto-derive it from domain + action in data.
        """
        if not self._connected or self._ws is None:
            return {"ok": False, "error": "Home Assistant not connected"}

        domain = entity_id.split(".")[0]
        if service is None:
            action = (data or {}).get("state", "ON").upper()
            service = "turn_on" if action in ("ON", "TOGGLE") else "turn_off"

        # Build payload
        payload: dict = {
            "id":      self._next_id(),
            "type":    "call_service",
            "domain":  domain,
            "service": service,
            "target":  {"entity_id": entity_id},
        }
        # Strip internal key from data before sending
        send_data = {k: v for k, v in (data or {}).items() if k != "state"}
        if send_data:
            payload["service_data"] = send_data

        try:
            await self._ws.send_str(json.dumps(payload))
            self.storage.add_log(
                "success", "ha",
                f"HA service call: {domain}.{service} → {entity_id}",
                {"entity_id": entity_id, "service": service, "data": send_data}
            )
            return {"ok": True, "entity_id": entity_id, "service": f"{domain}.{service}"}
        except Exception as e:
            logger.error(f"[HA] call_service failed: {e}")
            return {"ok": False, "error": str(e)}

    async def force_refresh(self) -> int:
        """Re-fetch all states from HA and re-register them. Returns entity count."""
        if not self._connected or self._ws is None:
            return 0
        await self._fetch_and_register_states()
        return self._entity_count

    def stop(self):
        self._running = False

    # ── Main async loop ───────────────────────────────────────────────────────

    async def run(self):
        """Entry point — runs forever, reconnecting on failure."""
        print(f"[HA] Adapter starting — targeting {self._host}:{self._port}")
        while self._running:
            try:
                await self._connect_and_listen()
            except Exception as e:
                logger.warning(f"[HA] Connection error: {e}")
            finally:
                self._connected = False
                await self._broadcast({"type": "ha_status", "connected": False})

            if not self._running:
                break

            print(f"[HA] Reconnecting in {self._reconnect_delay:.0f}s…")
            await asyncio.sleep(self._reconnect_delay)
            self._reconnect_delay = min(self._reconnect_delay * 1.5, self._max_reconnect_delay)

    # ── Connection & auth ─────────────────────────────────────────────────────

    async def _connect_and_listen(self):
        import aiohttp
        url = f"ws://{self._host}:{self._port}/api/websocket"
        print(f"[HA] Connecting to {url}…")

        timeout = aiohttp.ClientTimeout(total=15)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.ws_connect(url) as ws:
                self._ws = ws
                print("[HA] WebSocket connected")

                # Auth handshake
                async for msg in ws:
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        data = json.loads(msg.data)
                        msg_type = data.get("type")

                        if msg_type == "auth_required":
                            await ws.send_str(json.dumps({"type": "auth", "access_token": self._token}))

                        elif msg_type == "auth_ok":
                            print("[HA] Authenticated ✓")
                            self._connected = True
                            self._reconnect_delay = 5.0   # reset back-off on success
                            await self._broadcast({"type": "ha_status", "connected": True})
                            # Initial state fetch + event subscription
                            await self._fetch_and_register_states()
                            await self._subscribe_events(ws)

                        elif msg_type == "auth_invalid":
                            logger.error("[HA] Authentication FAILED — check HA_TOKEN in .env")
                            self.storage.add_log("error", "ha", "Home Assistant authentication failed — invalid token", {})
                            return  # Don't retry on auth failure

                        elif msg_type == "event":
                            await self._handle_event(data)

                        elif msg_type == "result":
                            await self._handle_result(data)

                    elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSED):
                        logger.warning(f"[HA] WebSocket closed: {msg.type}")
                        break

                self._ws = None

    # ── Discovery ─────────────────────────────────────────────────────────────

    async def _fetch_and_register_states(self):
        """Fetch all entity states via get_states and register them."""
        if not self._ws:
            return

        msg_id = self._next_id()
        await self._ws.send_str(json.dumps({"id": msg_id, "type": "get_states"}))

        # Wait for the result
        fut: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[msg_id] = fut
        try:
            states: list = await asyncio.wait_for(fut, timeout=15)
        except asyncio.TimeoutError:
            logger.warning("[HA] get_states timed out")
            return
        finally:
            self._pending.pop(msg_id, None)

        registered = 0
        for state_obj in states:
            entity_id = state_obj.get("entity_id", "")
            domain = entity_id.split(".")[0] if entity_id else ""

            # Apply domain filter
            if self._domain_filter and domain not in self._domain_filter:
                continue
            if domain in SKIP_DOMAINS:
                continue

            record = _build_device_record(state_obj)
            if record:
                self.storage.ensure_device(record)
                registered += 1

        self._entity_count = registered
        self.storage.add_log(
            "success", "ha",
            f"Home Assistant discovery: imported {registered} entit{'y' if registered == 1 else 'ies'}",
            {"count": registered, "host": self._host}
        )
        print(f"[HA] Auto-registered {registered} Home Assistant entit{'y' if registered == 1 else 'ies'}")
        await self._broadcast({"type": "state", "data": self.storage.get_all_devices()})

    async def _subscribe_events(self, ws):
        """Subscribe to state_changed events for real-time sync."""
        msg_id = self._next_id()
        await ws.send_str(json.dumps({
            "id":         msg_id,
            "type":       "subscribe_events",
            "event_type": "state_changed",
        }))
        print("[HA] Subscribed to state_changed events")

    # ── Event handling ────────────────────────────────────────────────────────

    async def _handle_event(self, data: dict):
        """Process incoming HA events."""
        event = data.get("event", {})
        if event.get("event_type") != "state_changed":
            return

        event_data = event.get("data", {})
        entity_id: str = event_data.get("entity_id", "")
        new_state = event_data.get("new_state")

        if not entity_id or not new_state:
            return

        domain = entity_id.split(".")[0]
        if self._domain_filter and domain not in self._domain_filter:
            return
        if domain in SKIP_DOMAINS:
            return

        # Update status in storage
        status = _ha_state_to_iotclaw_status(new_state)
        devices = self.storage.get_all_devices()

        if entity_id in devices:
            self.storage.update_device_field(entity_id, "status", status)

            # Update brightness for lights
            attrs = new_state.get("attributes", {})
            brightness = attrs.get("brightness")
            if brightness is not None:
                self.storage.update_device_field(entity_id, "brightness", brightness)

            # Buffer numeric telemetry for sensors
            raw_state = new_state.get("state", "")
            try:
                numeric_val = float(raw_state)
                self.storage.add_telemetry(entity_id, numeric_val)
            except (ValueError, TypeError):
                pass

            self.storage.add_log("info", "ha", f"HA state update: {entity_id} → {status}", {"entity_id": entity_id, "state": status})

        else:
            # New entity appeared — register it
            record = _build_device_record(new_state)
            if record:
                self.storage.ensure_device(record)

        # Broadcast to all WebSocket clients
        await self._broadcast({"type": "state", "data": self.storage.get_all_devices()})

    async def _handle_result(self, data: dict):
        """Resolve a pending Future for a call that returned a result."""
        msg_id = data.get("id")
        if msg_id in self._pending:
            fut = self._pending[msg_id]
            if not fut.done():
                if data.get("success"):
                    fut.set_result(data.get("result", {}))
                else:
                    error = data.get("error", {}).get("message", "Unknown error")
                    fut.set_exception(Exception(error))

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _next_id(self) -> int:
        self._msg_id += 1
        return self._msg_id

    async def _broadcast(self, message: dict):
        if self.ws_broadcast_fn:
            try:
                await self.ws_broadcast_fn(message)
            except Exception:
                pass
