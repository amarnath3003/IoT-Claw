"""
IoT-Claw MicroPython Edge Agent
Flash this onto an ESP32 using MicroPython firmware.

Features:
  - Auto-publishes MCP capability manifest on boot (enables backend auto-discovery)
  - Executes dynamic Python scripts pushed from the AI agent over MQTT
  - Handles direct ON/OFF device control via /set topic
  - Runs a local edge loop (calls loop() from the last pushed script every 100ms)
  - Persists the last-received edge script to internal flash (survives power cycles)
  - Syncs real-world time from NTP on every WiFi connect

Setup:
  1. Flash MicroPython onto your ESP32: https://micropython.org/download/ESP32_GENERIC/
  2. Edit WIFI_SSID, WIFI_PASS, MQTT_BROKER, DEVICE_ID, TZ_OFFSET_HOURS below
  3. Upload this file as main.py using mpremote or Thonny
"""

import network
import time
import json
import ntptime
from umqtt.simple import MQTTClient
from machine import Pin

# ── Configuration ────────────────────────────────────────────────────────────

WIFI_SSID = "Students_Wifi"
WIFI_PASS = ""          # set your WiFi password
MQTT_BROKER = "10.10.24.24"
MQTT_PORT = 1883
DEVICE_ID = "esp32_edge_1"   # unique per device
TOPIC_BASE = "home/esp32/" + DEVICE_ID
DISCOVERY_TOPIC = "home/discovery/" + DEVICE_ID
TZ_OFFSET_HOURS = 5     # UTC+5:30 → use 5 (or 5.5). Adjust for your timezone.

# Built-in status LED (GPIO 2 on most ESP32 dev boards)
_status_led = Pin(2, Pin.OUT)

# ── MCP Capability Manifest ───────────────────────────────────────────────────
# This is published on boot so the backend auto-registers this device and
# the AI agent knows what hardware is available for scripting.

CAPABILITIES = {
    "device_id": DEVICE_ID,
    "topic_base": TOPIC_BASE,
    "type": "micropython_edge_agent",
    "description": f"MicroPython edge agent on ESP32 ({DEVICE_ID})",
    "location": "",          # edit to e.g. "living_room"
    "tools": [
        {
            "name": "set_led",
            "description": "Control the onboard LED on GPIO 2",
            "params": {"state": ["ON", "OFF"]}
        },
        {
            "name": "read_adc",
            "description": "Read ADC value (0-4095) from a GPIO pin",
            "params": {"pin": "int (e.g. 34, 35, 36, 39)"}
        },
        {
            "name": "set_pin",
            "description": "Set any GPIO pin high or low",
            "params": {"pin": "int", "state": ["ON", "OFF"]}
        },
        {
            "name": "exec_script",
            "description": "Execute arbitrary MicroPython via MQTT /script topic",
            "params": {"code": "str — MicroPython code, define loop() for repeating logic"}
        }
    ]
}

# ── Edge Script State ─────────────────────────────────────────────────────────

_edge_globals = {}   # namespace for the currently running edge script
_script_loaded = False

# ── WiFi ──────────────────────────────────────────────────────────────────────

def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if wlan.isconnected():
        return True
    print(f"[WiFi] Connecting to {WIFI_SSID}...")
    wlan.connect(WIFI_SSID, WIFI_PASS)
    for _ in range(40):
        if wlan.isconnected():
            print(f"[WiFi] Connected: {wlan.ifconfig()[0]}")
            # ── Sync time from NTP ────────────────────────────────────────────
            try:
                ntptime.settime()
                print(f"[NTP] Time synced (UTC). Local offset: {TZ_OFFSET_HOURS}h")
            except Exception as e:
                print(f"[NTP] Sync failed (no internet?): {e}")
            return True
        _status_led.value(not _status_led.value())
        time.sleep(0.25)
    print("[WiFi] Failed to connect")
    return False

# ── MQTT callbacks ────────────────────────────────────────────────────────────

def edge_print(*args, **kwargs):
    """Custom print function injected into edge scripts to route output over MQTT."""
    msg = " ".join(str(a) for a in args)
    print("[EdgePrint]", msg)
    try:
        mqtt.publish(TOPIC_BASE + "/console", msg)
    except Exception:
        pass

# ── MCP Tool Dispatcher ───────────────────────────────────────────────────────

def _mcp_respond(req_id, result=None, error=None):
    """Publish a JSON-RPC 2.0 response on the /mcp/response topic."""
    if error:
        resp = {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32000, "message": error}}
    else:
        resp = {"jsonrpc": "2.0", "id": req_id, "result": {"content": [{"type": "text", "text": str(result)}]}}
    mqtt.publish(TOPIC_BASE + "/mcp/response", json.dumps(resp))

def handle_mcp_request(raw):
    """Parse and dispatch an MCP JSON-RPC 2.0 request."""
    from machine import Pin, ADC
    try:
        req = json.loads(raw)
    except Exception:
        return  # malformed JSON — silently drop

    req_id = req.get("id", "0")
    method = req.get("method", "")
    params = req.get("params", {})

    if method == "tools/list":
        _mcp_respond(req_id, json.dumps(CAPABILITIES))
        return

    if method != "tools/call":
        _mcp_respond(req_id, error=f"Unknown method: {method}")
        return

    tool_name = params.get("name", "")
    args      = params.get("arguments", {})

    try:
        if tool_name == "set_led":
            state = str(args.get("state", "OFF")).upper()
            _status_led.value(1 if state == "ON" else 0)
            _mcp_respond(req_id, f"LED set to {state}")

        elif tool_name == "set_pin":
            pin_num = int(args.get("pin", 2))
            state   = str(args.get("state", "OFF")).upper()
            pin = Pin(pin_num, Pin.OUT)
            pin.value(1 if state == "ON" else 0)
            _mcp_respond(req_id, f"Pin {pin_num} set to {state}")

        elif tool_name == "read_adc":
            pin_num = int(args.get("pin", 34))
            adc = ADC(Pin(pin_num))
            adc.atten(ADC.ATTN_11DB)
            val = adc.read()
            _mcp_respond(req_id, json.dumps({"pin": pin_num, "value": val, "voltage_mv": int(val * 3300 / 4095)}))

        elif tool_name == "exec_script":
            global _edge_globals, _script_loaded
            code = args.get("code", "")
            _edge_globals = {"print": edge_print}
            exec(code, _edge_globals)
            _script_loaded = "loop" in _edge_globals
            with open("edge_logic.py", "w") as f:
                f.write(code)
            _mcp_respond(req_id, json.dumps({"ok": True, "has_loop": _script_loaded}))

        else:
            _mcp_respond(req_id, error=f"Unknown tool: {tool_name}")

    except Exception as e:
        _mcp_respond(req_id, error=str(e))


def on_message(topic, msg):
    global _edge_globals, _script_loaded
    topic = topic.decode()
    msg = msg.decode().strip()
    print(f"[MQTT] {topic} = {msg[:80]}")

    # ── MCP tool-call protocol ────────────────────────────────────────────────
    if topic == TOPIC_BASE + "/mcp/request":
        handle_mcp_request(msg)
        return

    if topic == TOPIC_BASE + "/script":
        # Dynamic code injection — run the script and capture loop() if defined
        _edge_globals = {"print": edge_print}
        try:
            # ── Persist to flash so script survives power cycle ───────────────
            with open("edge_logic.py", "w") as f:
                f.write(msg)
            exec(msg, _edge_globals)
            _script_loaded = "loop" in _edge_globals
            status = {"status": "script_loaded", "has_loop": _script_loaded, "ok": True}
            mqtt.publish(TOPIC_BASE + "/state", json.dumps(status))
            print(f"[Edge] Script loaded & saved to flash (loop={'yes' if _script_loaded else 'no'})")
        except Exception as e:
            _script_loaded = False
            err = {"status": "script_error", "error": str(e), "ok": False}
            mqtt.publish(TOPIC_BASE + "/state", json.dumps(err))
            print(f"[Edge] Script error: {e}")

    elif topic == TOPIC_BASE + "/set":
        # Direct ON/OFF control of the status LED
        if msg == "ON":
            _status_led.on()
        elif msg == "OFF":
            _status_led.off()
        mqtt.publish(TOPIC_BASE + "/state", msg)

# ── Main ──────────────────────────────────────────────────────────────────────

if not connect_wifi():
    # Rapid blink = WiFi failure, halt
    while True:
        _status_led.value(not _status_led.value())
        time.sleep(0.1)

mqtt = MQTTClient(
    client_id=DEVICE_ID,
    server=MQTT_BROKER,
    port=MQTT_PORT,
    keepalive=30
)
mqtt.set_callback(on_message)
mqtt.connect()

# Announce capabilities so backend auto-registers this device
mqtt.publish(DISCOVERY_TOPIC, json.dumps(CAPABILITIES), retain=True)
print(f"[MCP] Published capability manifest to {DISCOVERY_TOPIC}")

# Subscribe to control topics
mqtt.subscribe(TOPIC_BASE + "/set")
mqtt.subscribe(TOPIC_BASE + "/script")
mqtt.subscribe(TOPIC_BASE + "/mcp/request")
print(f"[MQTT] Subscribed to {TOPIC_BASE}/set, /script and /mcp/request")

# Slow heartbeat blink = ready
_status_led.on()
time.sleep(0.2)
_status_led.off()

# ── Main loop ─────────────────────────────────────────────────────────────────

_last_ping      = time.ticks_ms()
_last_heartbeat = time.ticks_ms()
_last_telemetry = time.ticks_ms()
PING_INTERVAL_MS      = 25_000   # MQTT keepalive
HEARTBEAT_INTERVAL_MS = 30_000   # backend offline detection threshold is 90s
TELEMETRY_INTERVAL_MS = 500      # sensor reading rate for sparkline charts

# ── Restore last edge script from flash (survives power cycle) ────────────────
try:
    with open("edge_logic.py", "r") as f:
        _saved_script = f.read()
    print("[Edge] Restoring saved script from flash...")
    _edge_globals = {"print": edge_print}
    exec(_saved_script, _edge_globals)
    _script_loaded = "loop" in _edge_globals
    mqtt.publish(TOPIC_BASE + "/state", json.dumps(
        {"status": "script_loaded_from_flash", "has_loop": _script_loaded, "ok": True}
    ))
    print(f"[Edge] Script restored (loop={'yes' if _script_loaded else 'no'})")
except OSError:
    print("[Edge] No saved script found — waiting for AI agent to push one.")
except Exception as e:
    print(f"[Edge] Error restoring script: {e}")

# ── Optional ADC telemetry (comment out if no sensor on pin 34) ──────────────
try:
    from machine import ADC
    _adc = ADC(Pin(34))
    _adc.atten(ADC.ATTN_11DB)   # 0–3.3V range → 0–4095
    _has_adc = True
except Exception:
    _has_adc = False

while True:
    try:
        mqtt.check_msg()   # non-blocking poll for incoming MQTT messages

        now = time.ticks_ms()

        # Run the edge loop function if a script defines one
        if _script_loaded and "loop" in _edge_globals:
            try:
                _edge_globals["loop"]()
            except Exception as e:
                print(f"[Edge] loop() error: {e}")
                _script_loaded = False

        # Publish heartbeat so backend knows device is alive
        if time.ticks_diff(now, _last_heartbeat) > HEARTBEAT_INTERVAL_MS:
            mqtt.publish(TOPIC_BASE + "/heartbeat", "alive")
            _last_heartbeat = now

        # Publish ADC telemetry reading for sparkline dashboard
        if _has_adc and time.ticks_diff(now, _last_telemetry) > TELEMETRY_INTERVAL_MS:
            reading = _adc.read()
            mqtt.publish(TOPIC_BASE + "/state", str(reading))
            _last_telemetry = now

        # MQTT keepalive ping to prevent broker disconnect
        if time.ticks_diff(now, _last_ping) > PING_INTERVAL_MS:
            mqtt.ping()
            _last_ping = now

        time.sleep_ms(100)

    except OSError as e:
        # Network drop — reconnect
        print(f"[MQTT] Lost connection: {e}. Reconnecting...")
        time.sleep(2)
        try:
            mqtt.connect()
            mqtt.subscribe(TOPIC_BASE + "/set")
            mqtt.subscribe(TOPIC_BASE + "/script")
            mqtt.subscribe(TOPIC_BASE + "/mcp/request")
            mqtt.publish(DISCOVERY_TOPIC, json.dumps(CAPABILITIES), retain=True)
        except Exception as re:
            print(f"[MQTT] Reconnect failed: {re}")
            time.sleep(5)
