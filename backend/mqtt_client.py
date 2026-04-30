import paho.mqtt.client as mqtt_lib
import asyncio
import json

class MQTTClient:
    def __init__(self, storage, ws_broadcast_fn):
        self.storage = storage
        self.ws_broadcast_fn = ws_broadcast_fn  # async function

        self.client = mqtt_lib.Client(client_id="iotclaw_backend")
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect
        self._loop = None  # Will be set to the asyncio event loop

    def connect(self, host="localhost", port=1883):
        self._loop = asyncio.get_event_loop()
        try:
            self.client.connect_async(host, port, keepalive=60)
            # Run paho's network loop in a daemon thread
            self.client.loop_start()
        except Exception as e:
            print(f"[MQTT] WARNING: Could not connect to broker at {host}:{port} — {e}")
            print("[MQTT] Server will still start. Retry is automatic via loop_start.")

    def disconnect(self):
        self.client.loop_stop()
        self.client.disconnect()

    def subscribe(self, topic: str):
        self.client.subscribe(topic)
        self.storage.add_log("info", "mqtt", f"Subscribed to {topic}", {"topic": topic})
        print(f"[MQTT] Subscribed to {topic}")

    def publish(self, topic: str, payload: str) -> bool:
        result = self.client.publish(topic, payload)
        ok = result.rc == mqtt_lib.MQTT_ERR_SUCCESS
        self.storage.add_log(
            "success" if ok else "error",
            "mqtt",
            f"Published {payload} to {topic}" if ok else f"Failed to publish {payload} to {topic}",
            {"topic": topic, "payload": payload},
        )
        return ok

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print(f"[MQTT] Connected successfully")
            # Re-subscribe to all known device topics from storage
            devices = self.storage.get_all_devices()
            for device_name, device_data in devices.items():
                topic = device_data.get("topic_base", "") + "/state"
                client.subscribe(topic)
                print(f"[MQTT] Subscribed to {topic}")
            # MCP discovery: auto-register edge devices that announce their capabilities
            client.subscribe("home/discovery/#")
            print("[MQTT] Subscribed to home/discovery/#")
        else:
            print(f"[MQTT] Connection failed with code {rc}")

    def _on_message(self, client, userdata, msg):
        topic = msg.topic
        payload = msg.payload.decode("utf-8")
        print(f"[MQTT] Received: {topic} = {payload}")

        # MCP discovery: ESP32 devices announce capabilities on boot
        if topic.startswith("home/discovery/"):
            self._handle_discovery(topic, payload)
            return

        # Try to parse payload as JSON or number
        try:
            value = json.loads(payload)
        except (json.JSONDecodeError, ValueError):
            try:
                value = float(payload)
            except ValueError:
                value = payload  # Keep as string (e.g., "ON", "OFF")

        # Update storage
        device_name = self.storage.update_device_state_from_topic(topic, value)
        self.storage.add_log(
            "info",
            "mqtt",
            f"Received {topic} = {value}",
            {"topic": topic, "value": value, "device": device_name},
        )

        # Broadcast to WebSocket clients (must be scheduled on asyncio loop)
        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self.ws_broadcast_fn({
                    "type": "device_update",
                    "topic": topic,
                    "value": value
                }),
                self._loop
            )

    def _handle_discovery(self, topic: str, payload: str):
        """Auto-register an edge device from its MCP capability manifest."""
        try:
            manifest = json.loads(payload)
        except json.JSONDecodeError:
            print(f"[MQTT] Discovery: invalid JSON from {topic}")
            return

        device_id = manifest.get("device_id") or topic.split("/")[-1]
        topic_base = manifest.get("topic_base", f"home/esp32/{device_id}")
        device_type = manifest.get("type", "micropython_edge_agent")
        location = manifest.get("location", "")
        description = manifest.get("description", f"MicroPython edge agent ({device_id})")

        device = {
            "name": device_id,
            "topic_base": topic_base,
            "type": device_type,
            "location": location,
            "description": description,
            "capabilities": manifest.get("tools", []),
        }
        self.storage.ensure_device(device)
        self.client.subscribe(topic_base + "/state")

        self.storage.add_log(
            "success", "mqtt",
            f"Edge device discovered: {device_id} ({len(manifest.get('tools', []))} tools)",
            {"device_id": device_id, "topic_base": topic_base, "tools": manifest.get("tools", [])}
        )
        print(f"[MQTT] Discovery: registered edge device '{device_id}' with {len(manifest.get('tools', []))} MCP tools")

    def _on_disconnect(self, client, userdata, rc):
        if rc != 0:
            print(f"[MQTT] Unexpected disconnect (rc={rc}). Reconnecting...")
            # paho loop_start handles automatic reconnection
