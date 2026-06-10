"""
ZigbeeAdapter
─────────────
Bridges Zigbee2MQTT ↔ IoT-Claw.

Implements BaseIntegration so the IntegrationRegistry can manage it uniformly.

Integration ID: "zigbee"

Responsibilities:
  1. Subscribe to zigbee2mqtt/bridge/devices  → auto-register all devices
  2. Subscribe to zigbee2mqtt/+               → real-time state updates
  3. Subscribe to zigbee2mqtt/bridge/event    → handle join/leave events
  4. send_command()  → publish SET payloads to individual devices
  5. permit_join()   → open/close pairing mode
  6. remove_device() → unpair a device
  7. rename_device() → update friendly_name in Zigbee2MQTT
  8. set_group()     → control a named group of devices
"""

import asyncio
import json
import os
from datetime import datetime

from app.integrations.base import BaseIntegration

Z2M_BASE = os.getenv("ZIGBEE2MQTT_BASE_TOPIC", "zigbee2mqtt")


# ── Helper functions ──────────────────────────────────────────────────────────

def _infer_iotclaw_type(definition: dict) -> str:
    """Map a Zigbee2MQTT device definition to an IoT-Claw device type."""
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

    definition  = z2m_device.get("definition") or {}
    features    = definition.get("features", [])
    vendor      = definition.get("vendor", "")
    model_desc  = definition.get("description", "")
    device_type = _infer_iotclaw_type(definition)

    capabilities = [
        {"name": f["name"], "type": f["type"], "access": f.get("access", 1)}
        for f in features
    ]

    unit = ""
    feature_names = {f["name"] for f in features}
    if "temperature" in feature_names:
        unit = "°C"
    elif "humidity" in feature_names:
        unit = "%"
    elif "illuminance_lux" in feature_names:
        unit = "lux"
    elif "power" in feature_names:
        unit = "W"

    return {
        "name":               name,
        "topic_base":         f"{Z2M_BASE}/{name}",
        "type":               device_type,
        "status":             "unknown",
        "location":           "",
        "description":        f"{vendor} {model_desc}".strip() if vendor else model_desc,
        "unit":               unit,
        "brightness":         None,
        "capabilities":       capabilities,
        "simulated":          False,
        "zigbee":             True,
        "ieee_address":       z2m_device.get("ieee_address", ""),
        "vendor":             vendor,
        "model":              definition.get("model", ""),
        "created_at":         datetime.now().isoformat(),
        # ── canonical ownership field ──
        "integration_source": "zigbee",
    }


# ── Adapter class ─────────────────────────────────────────────────────────────

class ZigbeeAdapter(BaseIntegration):
    """
    Zigbee integration adapter.

    Constructor args
    ────────────────
    storage       : Storage instance (from BaseIntegration)
    ws_broadcast  : async broadcast function (from BaseIntegration)
    mqtt_client   : MQTTClient — shared MQTT transport (keyword-only)
    """

    integration_id = "zigbee"

    def __init__(self, storage, ws_broadcast, *, mqtt_client=None):
        super().__init__(storage, ws_broadcast)
        self.mqtt = mqtt_client
        self._known_names: set[str] = set()

        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            self._loop = None

    # ── BaseIntegration lifecycle ─────────────────────────────────────────────

    async def start(self) -> None:
        """Subscribe to all Zigbee2MQTT topics via the shared MQTT transport."""
        base = Z2M_BASE
        self.mqtt.subscribe(f"{base}/bridge/devices")
        self.mqtt.subscribe(f"{base}/bridge/event")
        self.mqtt.subscribe(f"{base}/bridge/response/permit_join")
        self.mqtt.subscribe(f"{base}/+")
        print(f"[Zigbee] Adapter started — subscribed to {base}/#")

    async def stop(self) -> None:
        """Best-effort unsubscribe from Zigbee2MQTT topics."""
        base = Z2M_BASE
        try:
            self.mqtt.client.unsubscribe(f"{base}/#")
        except Exception:
            pass
        print("[Zigbee] Adapter stopped")

    # ── BaseIntegration command dispatch ──────────────────────────────────────

    async def send_command(self, device: dict, command: str, params: dict) -> dict:
        """
        Build and publish a Zigbee SET payload to a single device.

        Supported params: brightness, color_temp, color, effect, transition.
        """
        payload: dict = {}
        if command in ("ON", "OFF", "TOGGLE"):
            payload["state"] = command
        for key in ("brightness", "color_temp", "color", "effect", "transition",
                    "color_temp_kelvin", "rgb_color"):
            if key in params:
                # Normalise HA-style keys to Zigbee style
                if key == "color_temp_kelvin":
                    # Convert kelvin → mireds (approx): 1 000 000 / K
                    payload["color_temp"] = round(1_000_000 / params[key])
                elif key == "rgb_color":
                    payload["color"] = {"r": params[key][0], "g": params[key][1], "b": params[key][2]}
                else:
                    payload[key] = params[key]

        ok = self.publish_command(device["name"], payload)
        self.storage.add_log(
            "success" if ok else "error", "zigbee",
            f"Zigbee SET on {device['name']}: {payload}",
            {"device": device["name"], "payload": payload},
        )
        return {"ok": ok, "device": device["name"], "payload": payload}

    # ── Message handling (called by MQTTClient._on_message) ──────────────────

    def handle_message(self, topic: str, payload: str):
        """Dispatches incoming Zigbee2MQTT messages."""
        base = Z2M_BASE
        try:
            data = json.loads(payload)
        except Exception:
            data = payload

        if topic == f"{base}/bridge/devices":
            self._handle_device_list(data)
        elif topic == f"{base}/bridge/event":
            self._handle_bridge_event(data)
        else:
            friendly_name = topic[len(base) + 1:]
            if "/" not in friendly_name:
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
                self.mqtt.subscribe(record["topic_base"])
                registered += 1
        self.storage.add_log(
            "success", "zigbee",
            f"Zigbee2MQTT discovery: registered {registered} device(s)",
            {"count": registered},
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
            # Re-request full device list to obtain the definition
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

        if "state" in state:
            self.storage.update_device_field(name, "status", state["state"])
        elif "occupancy" in state:
            self.storage.update_device_field(name, "status", "ON" if state["occupancy"] else "OFF")
        elif "contact" in state:
            self.storage.update_device_field(name, "status", "CLOSED" if state["contact"] else "OPEN")
        elif "temperature" in state:
            self.storage.update_device_field(name, "status", round(state["temperature"], 1))
        elif "humidity" in state:
            self.storage.update_device_field(name, "status", round(state["humidity"], 1))

        if "brightness" in state:
            self.storage.update_device_field(name, "brightness", state["brightness"])

        for key in ("temperature", "humidity", "illuminance_lux", "power", "energy"):
            if key in state and isinstance(state[key], (int, float)):
                self.storage.add_telemetry(name, state[key])
                break

        self.storage.add_log("info", "zigbee", f"State update: {name}", state)

    # ── Management commands ───────────────────────────────────────────────────

    def publish_command(self, friendly_name: str, payload: dict) -> bool:
        """Publish a SET payload directly (low-level, used by send_command and REST)."""
        topic = f"{Z2M_BASE}/{friendly_name}/set"
        return self.mqtt.publish(topic, json.dumps(payload))

    def permit_join(self, enable: bool, duration_seconds: int = 254) -> dict:
        """Open or close the Zigbee network for new device pairing."""
        topic   = f"{Z2M_BASE}/bridge/request/permit_join"
        payload = {"value": enable}
        if enable:
            payload["time"] = duration_seconds
        ok        = self.mqtt.publish(topic, json.dumps(payload))
        state_str = "OPEN" if enable else "CLOSED"
        self.storage.add_log(
            "success" if ok else "error", "zigbee",
            f"Zigbee pairing mode {state_str}",
            {"enabled": enable, "duration": duration_seconds if enable else 0},
        )
        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self._broadcast({
                    "type":     "zigbee_pairing",
                    "active":   enable,
                    "duration": duration_seconds if enable else 0,
                }),
                self._loop,
            )
        return {"pairing": enable, "duration": duration_seconds if enable else 0, "ok": ok}

    def remove_device(self, friendly_name: str, force: bool = False) -> dict:
        """Unpair and remove a Zigbee device from the network."""
        topic   = f"{Z2M_BASE}/bridge/request/device/remove"
        payload = {"id": friendly_name, "force": force}
        ok = self.mqtt.publish(topic, json.dumps(payload))
        if ok:
            self.storage.delete_device(friendly_name)
            self.storage.add_log(
                "warning", "zigbee",
                f"Removed Zigbee device: {friendly_name}",
                {"force": force},
            )
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
