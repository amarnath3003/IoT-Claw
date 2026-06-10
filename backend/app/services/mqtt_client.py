"""
MQTTClient
──────────
MQTT transport layer + IoT-Claw integration for ESP32/generic MQTT devices.

Implements BaseIntegration so the IntegrationRegistry can manage its lifecycle
and route commands to it exactly like any other adapter.

Integration ID: "mqtt"
"""

import os
import json
import asyncio
import paho.mqtt.client as mqtt_lib

from app.integrations.base import BaseIntegration

Z2M_BASE = os.getenv("ZIGBEE2MQTT_BASE_TOPIC", "zigbee2mqtt")


class MQTTClient(BaseIntegration):
    """
    Wraps paho-mqtt with:
      - BaseIntegration lifecycle (start / stop / send_command)
      - Device discovery via retained home/discovery/# messages
      - Heartbeat monitoring
      - Edge console forwarding
      - MCP response routing
      - Offline command queue (TTL=60 s)
    """

    integration_id = "mqtt"

    def __init__(self, storage, ws_broadcast_fn):
        # BaseIntegration stores storage + _broadcast
        super().__init__(storage, ws_broadcast_fn)

        # Keep ws_broadcast_fn as an alias so legacy internal callers still work
        self.ws_broadcast_fn = ws_broadcast_fn

        self.client = mqtt_lib.Client(client_id="iotclaw_backend")
        self.client.on_connect    = self._on_connect
        self.client.on_message    = self._on_message
        self.client.on_disconnect = self._on_disconnect

        self._loop: asyncio.AbstractEventLoop | None = None
        self.is_connected = False
        self._queue: list[dict] = []   # {"topic", "payload", "ts"}
        self.queue_ttl = 60            # seconds
        self._mcp_pending: dict = {}   # req_id -> asyncio.Future
        self._zigbee_adapter = None    # set by main.py for message routing

    # ── BaseIntegration lifecycle ─────────────────────────────────────────────

    async def start(self) -> None:
        """Read host/port from env and connect."""
        host = os.getenv("MQTT_BROKER_HOST", "localhost")
        port = int(os.getenv("MQTT_BROKER_PORT", "1883"))
        self.connect(host=host, port=port)

    async def stop(self) -> None:
        """Gracefully disconnect paho."""
        self.disconnect()

    # ── BaseIntegration command dispatch ─────────────────────────────────────

    async def send_command(self, device: dict, command: str, params: dict) -> dict:
        """
        Publish a command to an MQTT device's /set topic.

        For simple ON/OFF the payload is the bare command string.
        If ``params`` carries extra fields (brightness, etc.) the payload
        is sent as a JSON object so the device firmware can parse it.
        """
        topic = device["topic_base"] + "/set"
        name  = device["name"]

        if params:
            payload_dict = {"state": command}
            payload_dict.update(params)
            payload = json.dumps(payload_dict)
        else:
            payload = command

        ok = self.publish(topic, payload)
        if ok:
            self.storage.update_device_field(name, "status", command)
        return {"ok": ok, "device": name, "command": command}

    # ── Low-level connection helpers (kept for legacy callers) ────────────────

    def connect(self, host: str = "localhost", port: int = 1883):
        self._loop = asyncio.get_running_loop()
        try:
            self.client.connect_async(host, port, keepalive=60)
            self.client.loop_start()
        except Exception as e:
            print(f"[MQTT] WARNING: Could not connect to broker at {host}:{port} — {e}")
            print("[MQTT] Server will still start. Retry is automatic via loop_start.")

    def disconnect(self):
        self.client.loop_stop()
        self.client.disconnect()

    def set_mcp_response_registry(self, pending: dict):
        """Inject the MCPClient's pending-futures dict for response routing."""
        self._mcp_pending = pending

    def set_zigbee_adapter(self, adapter):
        """Wire in the ZigbeeAdapter so Zigbee2MQTT messages are forwarded."""
        self._zigbee_adapter = adapter

    def subscribe(self, topic: str):
        self.client.subscribe(topic)
        self.storage.add_log("info", "mqtt", f"Subscribed to {topic}", {"topic": topic})
        print(f"[MQTT] Subscribed to {topic}")

    def publish(self, topic: str, payload: str) -> bool:
        if not self.is_connected:
            import datetime
            self._queue.append({
                "topic":   topic,
                "payload": payload,
                "ts":      datetime.datetime.now(),
            })
            self.storage.add_log(
                "warning", "mqtt",
                f"Broker offline. Queued command for {topic}",
                {"topic": topic, "payload": payload},
            )
            print(f"[MQTT] Broker offline. Queued: {topic} = {payload}")
            return True  # pretend OK so UI doesn't hard-fail

        result = self.client.publish(topic, payload)
        ok = result.rc == mqtt_lib.MQTT_ERR_SUCCESS
        self.storage.add_log(
            "success" if ok else "error",
            "mqtt",
            f"Published {payload} to {topic}" if ok else f"Failed to publish {payload} to {topic}",
            {"topic": topic, "payload": payload},
        )
        return ok

    # ── paho callbacks ────────────────────────────────────────────────────────

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.is_connected = True
            print("[MQTT] Connected successfully")

            if self._loop and self._loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self.ws_broadcast_fn({"type": "broker_status", "connected": True}),
                    self._loop,
                )

            # Flush offline queue
            import datetime
            now     = datetime.datetime.now()
            sent    = 0
            dropped = 0
            for item in self._queue:
                if (now - item["ts"]).total_seconds() <= self.queue_ttl:
                    client.publish(item["topic"], item["payload"])
                    sent += 1
                else:
                    dropped += 1
            self._queue.clear()
            if sent > 0 or dropped > 0:
                print(f"[MQTT] Flushed offline queue: {sent} sent, {dropped} dropped (TTL expired)")
                self.storage.add_log(
                    "info", "mqtt",
                    f"Flushed offline queue: {sent} sent, {dropped} dropped", {},
                )

            # Re-subscribe to all known device state topics
            devices = self.storage.get_all_devices()
            for device_data in devices.values():
                topic = device_data.get("topic_base", "") + "/state"
                client.subscribe(topic)
                print(f"[MQTT] Subscribed to {topic}")

            # Core system topics
            client.subscribe("home/discovery/#")
            print("[MQTT] Subscribed to home/discovery/#")
            client.subscribe("home/+/heartbeat")
            print("[MQTT] Subscribed to home/+/heartbeat")
            client.subscribe("home/+/console")
            print("[MQTT] Subscribed to home/+/console")
            client.subscribe("home/+/mcp/response")
            print("[MQTT] Subscribed to home/+/mcp/response")

            if os.getenv("ZIGBEE2MQTT_ENABLED", "false").lower() == "true":
                z2m = os.getenv("ZIGBEE2MQTT_BASE_TOPIC", "zigbee2mqtt")
                client.subscribe(f"{z2m}/#")
                print(f"[MQTT] Subscribed to {z2m}/#")
        else:
            print(f"[MQTT] Connection failed with code {rc}")

    def _on_message(self, client, userdata, msg):
        topic   = msg.topic
        payload = msg.payload.decode("utf-8")
        print(f"[MQTT] Received: {topic} = {payload}")

        if topic.startswith("home/discovery/"):
            self._handle_discovery(topic, payload)
            return

        if topic.endswith("/heartbeat"):
            self._handle_heartbeat(topic)
            return

        if topic.endswith("/console"):
            self._handle_console(topic, payload)
            return

        if topic.endswith("/mcp/response"):
            self._handle_mcp_response(payload)
            return

        # Zigbee2MQTT messages — delegate to the Zigbee adapter
        if topic.startswith(Z2M_BASE + "/"):
            if self._zigbee_adapter:
                self._zigbee_adapter.handle_message(topic, payload)
            return

        # General MQTT state update
        try:
            value = json.loads(payload)
        except (json.JSONDecodeError, ValueError):
            try:
                value = float(payload)
            except ValueError:
                value = payload

        device_name = self.storage.update_device_state_from_topic(topic, value)

        if device_name and isinstance(value, (int, float)):
            self.storage.add_telemetry(device_name, value)

        self.storage.add_log(
            "info", "mqtt",
            f"Received {topic} = {value}",
            {"topic": topic, "value": value, "device": device_name},
        )

        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self.ws_broadcast_fn({
                    "type":  "device_update",
                    "topic": topic,
                    "value": value,
                }),
                self._loop,
            )

    def _handle_discovery(self, topic: str, payload: str):
        """Auto-register an edge device from its MCP capability manifest."""
        try:
            manifest = json.loads(payload)
        except json.JSONDecodeError:
            print(f"[MQTT] Discovery: invalid JSON from {topic}")
            return

        device_id  = manifest.get("device_id") or topic.split("/")[-1]
        topic_base = manifest.get("topic_base", f"home/esp32/{device_id}")
        device_type = manifest.get("type", "micropython_edge_agent")

        device = {
            "name":               device_id,
            "topic_base":         topic_base,
            "type":               device_type,
            "location":           manifest.get("location", ""),
            "description":        manifest.get("description", f"MicroPython edge agent ({device_id})"),
            "capabilities":       manifest.get("tools", []),
            "integration_source": "mqtt",
        }
        self.storage.ensure_device(device)
        self.client.subscribe(topic_base + "/state")

        self.storage.add_log(
            "success", "mqtt",
            f"Edge device discovered: {device_id} ({len(manifest.get('tools', []))} tools)",
            {"device_id": device_id, "topic_base": topic_base, "tools": manifest.get("tools", [])},
        )
        print(f"[MQTT] Discovery: registered edge device '{device_id}' with {len(manifest.get('tools', []))} MCP tools")

    def _handle_heartbeat(self, topic: str):
        topic_base = topic[: -len("/heartbeat")]
        devices    = self.storage.get_all_devices()
        for name, data in devices.items():
            if data.get("topic_base") == topic_base:
                self.storage.update_device_heartbeat(name)
                if str(data.get("status", "")).lower() == "offline":
                    self.storage.update_device_field(name, "status", "online")
                    self.storage.add_log("success", "mqtt", f"Device '{name}' came back online", {"device": name})
                return

    def _handle_console(self, topic: str, payload: str):
        topic_base  = topic[: -len("/console")]
        devices     = self.storage.get_all_devices()
        device_name = None
        for name, data in devices.items():
            if data.get("topic_base") == topic_base:
                device_name = name
                break

        if device_name and self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self.ws_broadcast_fn({
                    "type":   "edge_console",
                    "device": device_name,
                    "text":   payload,
                }),
                self._loop,
            )

    def _handle_mcp_response(self, payload: str):
        try:
            data = json.loads(payload)
        except Exception:
            return
        req_id = data.get("id")
        if req_id and req_id in self._mcp_pending:
            fut = self._mcp_pending.get(req_id)
            if fut and not fut.done() and self._loop and self._loop.is_running():
                result = data.get("result") or data.get("error", {})
                self._loop.call_soon_threadsafe(fut.set_result, result)

    def _on_disconnect(self, client, userdata, rc):
        self.is_connected = False
        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self.ws_broadcast_fn({"type": "broker_status", "connected": False}),
                self._loop,
            )
        if rc != 0:
            print(f"[MQTT] Unexpected disconnect (rc={rc}). Reconnecting...")
