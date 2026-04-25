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
            self.client.connect(host, port, keepalive=60)
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
        print(f"[MQTT] Subscribed to {topic}")

    def publish(self, topic: str, payload: str) -> bool:
        result = self.client.publish(topic, payload)
        return result.rc == mqtt_lib.MQTT_ERR_SUCCESS

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print(f"[MQTT] Connected successfully")
            # Re-subscribe to all known device topics from storage
            devices = self.storage.get_all_devices()
            for device_name, device_data in devices.items():
                topic = device_data.get("topic_base", "") + "/state"
                client.subscribe(topic)
                print(f"[MQTT] Subscribed to {topic}")
        else:
            print(f"[MQTT] Connection failed with code {rc}")

    def _on_message(self, client, userdata, msg):
        topic = msg.topic
        payload = msg.payload.decode("utf-8")
        print(f"[MQTT] Received: {topic} = {payload}")

        # Try to parse payload as JSON or number
        try:
            value = json.loads(payload)
        except (json.JSONDecodeError, ValueError):
            try:
                value = float(payload)
            except ValueError:
                value = payload  # Keep as string (e.g., "ON", "OFF")

        # Update storage
        self.storage.update_device_state_from_topic(topic, value)

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

    def _on_disconnect(self, client, userdata, rc):
        if rc != 0:
            print(f"[MQTT] Unexpected disconnect (rc={rc}). Reconnecting...")
            # paho loop_start handles automatic reconnection