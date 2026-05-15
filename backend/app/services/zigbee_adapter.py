"""
ZigbeeAdapter
─────────────
Bridges Zigbee2MQTT ↔ IoT-Claw.

Responsibilities:
  1. Subscribe to zigbee2mqtt/bridge/devices → auto-register all devices
  2. Subscribe to zigbee2mqtt/+ → update device states in real-time
  3. Subscribe to zigbee2mqtt/bridge/event → handle join/leave events
  4. Expose publish_command() to send SET payloads
  5. Expose permit_join() / remove_device() for AI pairing tools
"""

import json
import os
from datetime import datetime


Z2M_BASE = os.getenv("ZIGBEE2MQTT_BASE_TOPIC", "zigbee2mqtt")


def _infer_iotclaw_type(definition: dict) -> str:
    """Map Zigbee2MQTT device definition to an IoT-Claw device type."""
    if not definition:
        return "generic"
    features = {f["name"] for f in definition.get("features", [])}
    if "color" in features or "color_xy" in features or "color_hs" in features:
        return "zigbee_color_light"
    if "brightness" in features and "state" in features:
        return "zigbee_light"
    if "state" in features and "power" in features:
        return "zigbee_plug"
    if "state" in features:
        return "zigbee_switch"
    if "temperature" in features or "humidity" in features:
        return "zigbee_climate_sensor"
    if "occupancy" in features or "motion" in features:
        return "zigbee_motion_sensor"
    if "contact" in features:
        return "zigbee_contact_sensor"
    if "action" in features:
        return "zigbee_remote"
    return "zigbee_sensor"


def _build_device_record(z2m_device: dict) -> dict | None:
    """Convert a Zigbee2MQTT device dict into an IoT-Claw device record."""
    name = z2m_device.get("friendly_name", "")
    if not name or name == "Coordinator":
        return None

    definition = z2m_device.get("definition") or {}
    features   = definition.get("features", [])
    vendor     = definition.get("vendor", "")
    model_desc = definition.get("description", "")

    device_type = _infer_iotclaw_type(definition)

    # Build capabilities list similar to MCP edge agent format
    capabilities = [
        {"name": f["name"], "type": f["type"], "access": f.get("access", 1)}
        for f in features
    ]

    # Determine unit for numeric sensors
    unit = ""
    if "temperature" in {f["name"] for f in features}:
        unit = "°C"
    elif "humidity" in {f["name"] for f in features}:
        unit = "%"
    elif "illuminance_lux" in {f["name"] for f in features}:
        unit = "lux"
    elif "power" in {f["name"] for f in features}:
        unit = "W"

    return {
        "name":         name,
        "topic_base":   f"{Z2M_BASE}/{name}",
        "type":         device_type,
        "status":       "unknown",
        "location":     "",
        "description":  f"{vendor} {model_desc}".strip() if vendor else model_desc,
        "unit":         unit,
        "brightness":   None,
        "capabilities": capabilities,
        "simulated":    False,
        "zigbee":       True,
        "ieee_address": z2m_device.get("ieee_address", ""),
        "vendor":       vendor,
        "model":        definition.get("model", ""),
        "created_at":   datetime.now().isoformat(),
    }


class ZigbeeAdapter:
    def __init__(self, mqtt_client, storage, ws_broadcast_fn=None):
        self.mqtt    = mqtt_client
        self.storage = storage
        self.ws_broadcast_fn = ws_broadcast_fn
        self._known_names: set[str] = set()

        import asyncio
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            self._loop = None

    def start(self):
        """Subscribe to all Zigbee2MQTT topics."""
        base = Z2M_BASE
        self.mqtt.subscribe(f"{base}/bridge/devices")
        self.mqtt.subscribe(f"{base}/bridge/event")
        self.mqtt.subscribe(f"{base}/bridge/response/permit_join")
        self.mqtt.subscribe(f"{base}/+")          # all device state topics
        print(f"[Zigbee] Adapter started — subscribed to {base}/#")

    def handle_message(self, topic: str, payload: str):
        """Called by mqtt_client._on_message for zigbee2mqtt/* topics."""
        base = Z2M_BASE
        try:
            data = json.loads(payload)
        except Exception:
            data = payload

        # ── Bridge device list (auto-discovery) ──────────────────────────
        if topic == f"{base}/bridge/devices":
            self._handle_device_list(data)

        # ── Bridge events (new joins, leaves) ────────────────────────────
        elif topic == f"{base}/bridge/event":
            self._handle_bridge_event(data)

        # ── Device state update ──────────────────────────────────────────
        else:
            friendly_name = topic[len(base) + 1:]   # strip "zigbee2mqtt/"
            if "/" not in friendly_name:             # ignore sub-topics like /set
                self._handle_device_state(friendly_name, data)

    def _handle_device_list(self, devices: list):
        if not isinstance(devices, list):
            return
        registered = 0
        for z2m_dev in devices:
            record = _build_device_record(z2m_dev)
            if record:
                self.storage.ensure_device(record)
                self._known_names.add(record["name"])
                # Subscribe to state topic
                self.mqtt.subscribe(record["topic_base"])
                registered += 1
        self.storage.add_log(
            "success", "zigbee",
            f"Zigbee2MQTT discovery: registered {registered} device(s)",
            {"count": registered}
        )
        print(f"[Zigbee] Auto-registered {registered} Zigbee device(s)")

    def _handle_bridge_event(self, event: dict):
        if not isinstance(event, dict):
            return
        etype = event.get("type", "")
        data  = event.get("data", {})
        name  = data.get("friendly_name", "unknown")

        if etype == "device_joined":
            self.storage.add_log("success", "zigbee", f"Zigbee device joined: {name}", data)
            print(f"[Zigbee] New device joined: {name}")
            # Re-request device list to get full definition
            self.mqtt.publish(f"{Z2M_BASE}/bridge/request/devices", "")

        elif etype == "device_leave":
            self.storage.add_log("warning", "zigbee", f"Zigbee device left: {name}", data)
            print(f"[Zigbee] Device left network: {name}")

        elif etype == "device_announce":
            self.storage.add_log("info", "zigbee", f"Zigbee device announced: {name}", data)

    def _handle_device_state(self, name: str, state: dict):
        if not isinstance(state, dict):
            return
        devices = self.storage.get_all_devices()
        if name not in devices:
            return

        # Map common Zigbee state fields to IoT-Claw status
        if "state" in state:
            self.storage.update_device_field(name, "status", state["state"])
        elif "occupancy" in state:
            self.storage.update_device_field(name, "status", "ON" if state["occupancy"] else "OFF")
        elif "contact" in state:
            # contact=true means closed/secure
            self.storage.update_device_field(name, "status", "CLOSED" if state["contact"] else "OPEN")
        elif "temperature" in state:
            self.storage.update_device_field(name, "status", round(state["temperature"], 1))
        elif "humidity" in state:
            self.storage.update_device_field(name, "status", round(state["humidity"], 1))

        # Store brightness separately if present
        if "brightness" in state:
            self.storage.update_device_field(name, "brightness", state["brightness"])

        # Buffer numeric telemetry
        for key in ("temperature", "humidity", "illuminance_lux", "power", "energy"):
            if key in state and isinstance(state[key], (int, float)):
                self.storage.add_telemetry(name, state[key])
                break

        self.storage.add_log("info", "zigbee", f"State update: {name}", state)

    # ── Control Methods ───────────────────────────────────────────────────

    def publish_command(self, friendly_name: str, payload: dict) -> bool:
        """Send a SET command to a Zigbee device."""
        topic = f"{Z2M_BASE}/{friendly_name}/set"
        return self.mqtt.publish(topic, json.dumps(payload))

    def permit_join(self, enable: bool, duration_seconds: int = 254) -> dict:
        """Open or close the Zigbee network for new device pairing."""
        topic   = f"{Z2M_BASE}/bridge/request/permit_join"
        payload = {"value": enable}
        if enable:
            payload["time"] = duration_seconds
        ok = self.mqtt.publish(topic, json.dumps(payload))
        state_str = "OPEN" if enable else "CLOSED"
        self.storage.add_log(
            "success" if ok else "error",
            "zigbee",
            f"Zigbee pairing mode {state_str}",
            {"enabled": enable, "duration": duration_seconds if enable else 0}
        )
        if self.ws_broadcast_fn and self._loop and self._loop.is_running():
            import asyncio
            asyncio.run_coroutine_threadsafe(
                self.ws_broadcast_fn({
                    "type": "zigbee_pairing",
                    "active": enable,
                    "duration": duration_seconds if enable else 0
                }),
                self._loop
            )
        return {"pairing": enable, "duration": duration_seconds if enable else 0, "ok": ok}

    def remove_device(self, friendly_name: str, force: bool = False) -> dict:
        """Remove / unpair a Zigbee device from the network."""
        topic   = f"{Z2M_BASE}/bridge/request/device/remove"
        payload = {"id": friendly_name, "force": force}
        ok = self.mqtt.publish(topic, json.dumps(payload))
        if ok:
            self.storage.delete_device(friendly_name)
            self.storage.add_log("warning", "zigbee", f"Removed Zigbee device: {friendly_name}", {"force": force})
        return {"removed": friendly_name, "ok": ok}

    def rename_device(self, old_name: str, new_name: str) -> dict:
        """Rename a Zigbee device (updates friendly_name in Zigbee2MQTT)."""
        topic   = f"{Z2M_BASE}/bridge/request/device/rename"
        payload = {"from": old_name, "to": new_name}
        ok = self.mqtt.publish(topic, json.dumps(payload))
        return {"renamed": True, "from": old_name, "to": new_name, "ok": ok}

    def set_group(self, group_id: int, payload: dict) -> bool:
        """Send a command to a Zigbee group (all bulbs in a room at once)."""
        topic = f"{Z2M_BASE}/group_{group_id}/set"
        return self.mqtt.publish(topic, json.dumps(payload))
