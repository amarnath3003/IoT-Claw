import asyncio
import json
import os
import threading
import time

import litellm
from litellm import acompletion
from dotenv import load_dotenv

load_dotenv(override=True)

litellm.drop_params = True

# Read Multi-LLM config
_model = os.getenv("LLM_MODEL", os.getenv("OPENAI_MODEL", "openai/gpt-4o-mini"))
_api_base = os.getenv("LLM_API_BASE")

_openai_key = os.getenv("OPENAI_API_KEY", "")
_anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
_gemini_key = os.getenv("GEMINI_API_KEY", "")
_is_local = _model.startswith("ollama/") or bool(_api_base)

# Flag to indicate if AI chat is enabled globally
client = True 
if not _is_local and not any(k and not k.startswith("sk-proj-REPLACE") for k in [_openai_key, _anthropic_key, _gemini_key]):
    client = None # Mark as disabled if no keys and not local

SYSTEM_PROMPT = """You are iotClaw — a highly intelligent IoT automation assistant controlling real physical devices.

=== CORE INTELLIGENCE RULES ===
1. ALWAYS infer intent from natural language. Never ask unnecessary questions if you can reason from context.
2. For EVERY action request, call the appropriate tool. Never just describe what you WOULD do.
3. If a device name is ambiguous, use list_devices first, then pick the closest match by name/location.
4. Chain multiple tool calls in one response when the user's intent requires it.
5. Use blink_device for "blink", "flash", "pulse", "signal" commands.
6. Use sequence_actions for multi-step patterns like "turn on, wait 5 seconds, turn off".
7. After all tool calls, give a concise confirmation. Never just say "I'll do that" without calling a tool.

=== INTENT EXAMPLES ===
- "turn on the light" → control_device(nearest light device, ON)
- "blink the LED 5 times" → blink_device(led_device, times=5, on_seconds=0.5, off_seconds=0.5)
- "flash red light twice slowly" → blink_device(red_led, times=2, on_seconds=1.5, off_seconds=1.0)
- "turn on the fan then off after 10 seconds" → sequence_actions([{ON}, {delay:10}, {OFF}])
- "what devices do I have?" → list_devices()
- "read temp sensor" → read_sensor(temperature_device)
- "make a workflow: if temp > 30 turn on fan" → create_workflow(sensor trigger, device action)
- "good night" → infer night mode: turn off all devices or activate a night mode workflow
- "morning routine" → trigger any schedule/chat workflow named morning, or turn on relevant devices
- "status of everything" → list_devices() then summarize clearly
- "dim the lights to 40%" → control_device(light, ON, brightness_pct=40)
- "is the light on?" → read_sensor(light_device), report status conversationally
- "schedule fan to turn on at 8am" → create_workflow(schedule trigger 08:00, device ON)

=== DEVICE MATCHING ===
- "the light" / "light" / "LED" → match any switch/dimmable_switch device
- "the fan" → match device with "fan" in name
- "cam" / "camera" / "eye" → laptop_security_camera
- If multiple matches, pick the one in context (e.g. "living room light" → living_room_*)
- Never fail if you can make a reasonable inference

=== UNIFIED control_device TOOL ===
control_device works for ALL device types — MQTT, Zigbee, and Home Assistant.
It automatically routes to the correct protocol based on the device's integration.

For MQTT devices: ON/OFF only (no extra params needed)
For Zigbee lights/plugs:
  - brightness (1-254), color_temp (150-500 Mireds), color {"r":255,"g":100,"b":0}
  - effect: "blink" | "breathe" | "colorloop" | "finish_effect"
  - transition (seconds)
  - Color mapping: "warm white" → color_temp=370, "cool white" → color_temp=153
  - Brightness: "dim" → brightness=50, "half" → brightness=127, "full/max" → brightness=254
For Home Assistant entities:
  - brightness_pct (0-100), color_temp_kelvin (2700=warm, 6500=cool), rgb_color [r,g,b]
  - temperature (number, for climate), hvac_mode (cool/heat/off/auto/heat_cool)
  - media_content_id (for media_player)

=== WORKFLOW INTELLIGENCE ===
- Trigger types: sensor (threshold), chat (secret phrase), schedule (daily HH:MM), device_event (offline/online)
- Always set a meaningful cooldown_seconds based on the use case
- For "blink when motion detected" → sensor trigger on camera device + blink action using sequence
- For "alert me at 9pm" → schedule trigger + log action
- For "if my ESP32 goes offline, turn on the backup light" → device_event trigger (event: "offline") + device ON action
- For "when edge device comes back online, log it" → device_event trigger (event: "online") + log action
- device_event cooldown should be ≥300s to avoid re-firing on each engine tick

=== EDGE SCRIPTING (MicroPython) ===
Some devices are MicroPython edge agents (type: micropython_edge_agent). These support dynamic code injection:
- Use get_device_capabilities(device) to inspect what hardware pins/tools it exposes.
- Use push_script(device, script, description) to push MicroPython code that runs LOCALLY on the ESP32.
- Always write valid MicroPython. Available modules: machine, time, ujson, math.
- For repeating logic (sensor polling, blink patterns), define a loop() function — the firmware calls it every 100ms.
- For one-shot setup, write top-level code (no loop() needed).
- MicroPython example for "blink LED on pin 2 when ADC pin 34 > 2000":
  from machine import Pin, ADC
  led = Pin(2, Pin.OUT)
  adc = ADC(Pin(34))
  adc.atten(ADC.ATTN_11DB)
  def loop():
      led.value(1 if adc.read() > 2000 else 0)
- Prefer push_script over control_device for complex automations on edge devices.
- After pushing, confirm what logic the device will run locally.

=== ZIGBEE MANAGEMENT ===
Zigbee devices are auto-discovered from Zigbee2MQTT. Use control_device for all on/off/brightness/color commands.
- For pairing:
  → "pair", "add a new device", "put in pairing mode" → zigbee_permit_join(enable=true, duration=120)
  → Tell user to power on device within 2 minutes
  → "stop pairing", "close pairing", "done pairing" → zigbee_permit_join(enable=false)
- For removal: "remove [device]", "unpair [device]" → zigbee_remove_device(device_name)
- For groups: "all bedroom lights" → zigbee_group_set(group_name="bedroom", ...)

=== HOME ASSISTANT DEVICE INTELLIGENCE ===
Home Assistant entities appear as ha_* type devices. They are named with dot notation:
e.g. "light.kitchen_ceiling", "switch.bedroom_fan", "climate.living_room".
- Use control_device for all basic on/off/brightness/color/temperature commands
- For scenes: use ha_call_service(domain="scene", service="turn_on", entity_id="scene.movie_night", data={})
- For scripts: use ha_call_service(domain="script", service="turn_on", entity_id="script.good_morning", data={})
- "movie mode", "good night", "morning routine" → look for matching HA scene/script names first
- Use ha_list_entities to discover what HA entities exist before controlling by guessed name

=== TONE ===
Be concise, friendly, and confident. Confirm what you did in 1-2 sentences. Use emojis sparingly for warmth."""

COMPACT_SYSTEM_PROMPT = """You are iotClaw — an IoT automation assistant.

=== CORE RULES ===
1. Infer intent from natural language.
2. For device actions, call the correct tool. Do not just describe actions.
3. If device name is ambiguous, call list_devices and pick the best match by name/location.
4. Keep replies concise and confirm what you did.

=== QUICK EXAMPLES ===
- "turn on the light" -> control_device(nearest light device, ON)
- "blink the LED 3 times" -> blink_device(led_device, times=3)
- "what devices do I have?" -> list_devices()
- "read temp sensor" -> read_sensor(temperature_device)
- "dim kitchen light to 60%" -> control_device(light.kitchen, ON, brightness_pct=60)
"""

BIG_TASK_KEYWORDS = {
    "esp32", "micropython", "arduino", "firmware", "script", "code", "workflow",
    "automation", "sequence", "yaml", "json", "regex", "integration", "mqtt",
    "zigbee", "home assistant", "ha_", "device_event", "websocket",
}

DEVICE_INTENT_KEYWORDS = {
    "turn on", "turn off", "toggle", "switch", "dim", "brightness", "set ",
    "blink", "flash", "pulse", "read", "status", "devices", "list devices",
    "sensor", "temperature", "humidity", "lock", "unlock", "open", "close",
    "play", "pause", "volume", "scene",
}


def _is_big_task(message: str) -> bool:
    msg = (message or "").lower()
    if len(msg) >= 200:
        return True
    return any(k in msg for k in BIG_TASK_KEYWORDS)


def _needs_device_context(message: str) -> bool:
    msg = (message or "").lower()
    return any(k in msg for k in DEVICE_INTENT_KEYWORDS)


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "control_device",
            "description": (
                "Control any device — MQTT switch/sensor, Zigbee light/plug, or Home Assistant entity. "
                "Automatically routes to the correct protocol. "
                "Use for all on/off/toggle and brightness/color commands.\n"
                "For Zigbee: brightness (1-254), color_temp (150-500 Mireds), color {r,g,b}, effect, transition.\n"
                "For HA: brightness_pct (0-100), color_temp_kelvin, rgb_color [r,g,b], temperature, hvac_mode."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name":        {"type": "string", "description": "Registered device name or HA entity ID"},
                    "action":             {"type": "string", "enum": ["ON", "OFF", "TOGGLE"]},
                    "brightness":         {"type": "integer", "minimum": 1, "maximum": 254, "description": "Zigbee brightness 1-254"},
                    "brightness_pct":     {"type": "integer", "minimum": 0, "maximum": 100, "description": "HA light brightness 0-100%"},
                    "color_temp":         {"type": "integer", "minimum": 150, "maximum": 500, "description": "Zigbee color temperature in Mireds"},
                    "color_temp_kelvin":  {"type": "integer", "description": "HA color temperature in Kelvin (2700=warm, 6500=cool)"},
                    "color":              {"type": "object", "description": "Zigbee RGB color as {\"r\":255,\"g\":100,\"b\":0}"},
                    "rgb_color":          {"type": "array", "items": {"type": "integer"}, "description": "HA RGB color as [r,g,b]"},
                    "effect":             {"type": "string", "enum": ["blink", "breathe", "okay", "channel_change", "colorloop", "finish_effect", "stop_effect"], "description": "Zigbee lighting effect"},
                    "transition":         {"type": "number", "description": "Transition time in seconds (Zigbee)"},
                    "temperature":        {"type": "number", "description": "Target temperature for HA climate devices"},
                    "hvac_mode":          {"type": "string", "enum": ["cool", "heat", "off", "auto", "heat_cool", "fan_only", "dry"], "description": "HA HVAC mode"},
                    "media_content_id":   {"type": "string", "description": "Media content ID for HA media_player"}
                },
                "required": ["device_name", "action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "blink_device",
            "description": "Blink/flash/pulse a device ON and OFF repeatedly. Use for 'blink', 'flash', 'signal', 'strobe', 'pulse' commands.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string", "description": "Device to blink"},
                    "times":       {"type": "integer", "description": "Number of blink cycles (default 3)", "default": 3},
                    "on_seconds":  {"type": "number", "description": "Seconds ON per cycle (default 0.5)", "default": 0.5},
                    "off_seconds": {"type": "number", "description": "Seconds OFF per cycle (default 0.5)", "default": 0.5}
                },
                "required": ["device_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "sequence_actions",
            "description": "Execute a timed sequence of device actions with delays between them. Use for 'turn on then off after X seconds', 'on for 5 seconds', 'wait then turn off', etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "steps": {
                        "type": "array",
                        "description": "List of steps to execute in order",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type":        {"type": "string", "enum": ["device", "delay"]},
                                "device_name": {"type": "string"},
                                "action":      {"type": "string", "enum": ["ON", "OFF"]},
                                "seconds":     {"type": "number"}
                            }
                        }
                    },
                    "description": {"type": "string", "description": "Human-readable summary of this sequence"}
                },
                "required": ["steps"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "set_device_brightness",
            "description": "Set brightness/level of a dimmable MQTT device (0-100%). For Zigbee or HA lights, use control_device with brightness or brightness_pct instead.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string"},
                    "level":       {"type": "integer", "minimum": 0, "maximum": 100}
                },
                "required": ["device_name", "level"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_sensor",
            "description": "Read the current value/status of any device or sensor — MQTT, Zigbee, or Home Assistant.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string"}
                },
                "required": ["device_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_devices",
            "description": "List all registered devices and their current states. Use when user asks what devices exist, or to resolve an ambiguous device name.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "register_device",
            "description": "Register a new IoT device in the system.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name":        {"type": "string", "description": "Unique snake_case device name"},
                    "topic_base":  {"type": "string", "description": "MQTT topic base e.g. home/room/device"},
                    "type":        {"type": "string", "enum": ["switch", "sensor", "dimmable_switch", "security_camera", "generic"]},
                    "unit":        {"type": "string", "description": "Unit for sensor (e.g. °C, %, lux)"},
                    "location":    {"type": "string", "description": "Room or location name"},
                    "description": {"type": "string", "description": "Short description of the device"}
                },
                "required": ["name", "topic_base", "type"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_device",
            "description": "Remove a device from the system.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string"}
                },
                "required": ["device_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_workflow",
            "description": """Create an automation workflow. Trigger types:
1. sensor: fires when device value meets condition (e.g. temp > 30)
2. chat: fires when user types a secret phrase
3. schedule: fires every day at HH:MM
4. device_event: fires when a device goes offline or comes back online (event: "offline" | "online")
Actions: device (ON/OFF), brightness, camera_monitor, log.""",
            "parameters": {
                "type": "object",
                "properties": {
                    "name":        {"type": "string"},
                    "description": {"type": "string"},
                    "trigger": {
                        "type": "object",
                        "properties": {
                            "type":     {"type": "string", "enum": ["sensor", "chat", "schedule", "device_event"]},
                            "device":   {"type": "string"},
                            "operator": {"type": "string", "enum": [">", "<", ">=", "<=", "==", "!="]},
                            "value":    {"type": "string"},
                            "code":     {"type": "string"},
                            "time":     {"type": "string", "description": "HH:MM"},
                            "event":    {"type": "string", "enum": ["offline", "online"]}
                        },
                        "required": ["type"]
                    },
                    "actions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type":    {"type": "string", "enum": ["device", "brightness", "camera_monitor", "log"]},
                                "device":  {"type": "string"},
                                "command": {"type": "string", "enum": ["ON", "OFF"]},
                                "level":   {"type": "integer"},
                                "message": {"type": "string"}
                            },
                            "required": ["type"]
                        }
                    },
                    "cooldown_seconds": {"type": "integer", "description": "Default 60"},
                    "enabled":          {"type": "boolean"}
                },
                "required": ["name", "trigger", "actions"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_workflows",
            "description": "List all saved workflows and their status.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "toggle_workflow",
            "description": "Enable or disable a workflow by ID or name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workflow_id": {"type": "string"}
                },
                "required": ["workflow_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_workflow",
            "description": "Delete a workflow permanently.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workflow_id": {"type": "string"}
                },
                "required": ["workflow_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "execute_workflow",
            "description": "Run a saved workflow immediately by ID or exact name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workflow_id": {"type": "string"}
                },
                "required": ["workflow_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "push_script",
            "description": """Push a MicroPython script to an ESP32 edge device for local execution.
Use for complex automations that need millisecond response (sensor thresholds, blink patterns, ADC-driven logic).
The script runs directly on the ESP32 — no round-trips to the backend.
Define a loop() function for repeating logic (called every 100ms by the firmware).
Available MicroPython modules: machine (Pin, ADC, PWM, I2C), time, ujson, math.
Only use on devices with type 'micropython_edge_agent'.""",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string", "description": "Target edge device name"},
                    "script": {
                        "type": "string",
                        "description": "Valid MicroPython code. For repeating logic define a loop() function."
                    },
                    "description": {"type": "string", "description": "Human-readable description of what the script does"}
                },
                "required": ["device_name", "script", "description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "push_script_group",
            "description": "Push the same MicroPython script to ALL edge devices in a given location simultaneously. Pass an empty string for location to target all edge devices.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location":    {"type": "string", "description": "Room/location name to target. Empty string = all edge devices."},
                    "script":      {"type": "string", "description": "Valid MicroPython code to push to all matched devices."},
                    "description": {"type": "string", "description": "Human-readable description of what the script does"}
                },
                "required": ["location", "script", "description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "rollback_script",
            "description": "Re-push a previous script version to an edge device. Use version=0 for the most recently pushed script, version=1 for the one before that, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string"},
                    "version":     {"type": "integer", "description": "History index: 0=last pushed, 1=second-last, etc. (default 1)", "default": 1}
                },
                "required": ["device_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_device_capabilities",
            "description": "Get the MCP capabilities manifest of an edge device — lists its native hardware tools (pins, sensors, actuators). Call this before push_script to know what hardware is available.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string"}
                },
                "required": ["device_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_logs",
            "description": "Retrieve recent activity logs. Use when user asks for history, recent actions, or what happened.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Number of logs to return (default 20)"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "call_hardware_tool",
            "description": """Invoke a native MCP hardware tool directly on an edge device. Use this instead of push_script for simple, discrete hardware actions like reading a sensor or toggling a pin.
Available built-in tools: set_led (state: ON|OFF), set_pin (pin: int, state: ON|OFF), read_adc (pin: int), exec_script (code: str).
Always call get_device_capabilities first to discover the device's tools.""",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string", "description": "Target edge device name"},
                    "tool_name":   {"type": "string", "description": "MCP tool name, e.g. set_led, set_pin, read_adc"},
                    "arguments":   {"type": "object", "description": "Tool arguments as a JSON object"}
                },
                "required": ["device_name", "tool_name"]
            }
        }
    },
    # ── Zigbee management (pairing, removal, groups) ─────────────────────────
    {
        "type": "function",
        "function": {
            "name": "zigbee_permit_join",
            "description": "Open or close Zigbee pairing mode. Use when user says 'pair a new device', 'add a Zigbee device', 'put in pairing mode', 'stop pairing'. When opening, default duration is 120 seconds.",
            "parameters": {
                "type": "object",
                "properties": {
                    "enable":   {"type": "boolean", "description": "true to open pairing, false to close"},
                    "duration": {"type": "integer", "description": "How long to keep pairing open in seconds (default 120, max 254)"}
                },
                "required": ["enable"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "zigbee_remove_device",
            "description": "Unpair and remove a Zigbee device from the network. Use when user says 'remove', 'unpair', 'delete' a Zigbee device.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string"},
                    "force":       {"type": "boolean", "description": "Force remove even if device is unreachable (default false)"}
                },
                "required": ["device_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "zigbee_group_set",
            "description": "Control all Zigbee devices in a named group simultaneously (e.g. all bedroom lights). Use for 'turn off all bedroom lights' or 'set living room to warm white'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "group_name": {"type": "string", "description": "Group friendly name (e.g. 'bedroom', 'living_room')"},
                    "state":      {"type": "string", "enum": ["ON", "OFF", "TOGGLE"]},
                    "brightness": {"type": "integer", "minimum": 1, "maximum": 254},
                    "color_temp": {"type": "integer", "minimum": 150, "maximum": 500},
                    "color":      {"type": "object"},
                    "effect":     {"type": "string"}
                },
                "required": ["group_name"]
            }
        }
    },
    # ── Home Assistant advanced tools ─────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "ha_list_entities",
            "description": "List Home Assistant entities, optionally filtered by domain. Use when user asks what HA devices exist or you need to discover entity IDs before controlling them.",
            "parameters": {
                "type": "object",
                "properties": {
                    "domain": {"type": "string", "description": "Optional HA domain to filter by: 'light', 'switch', 'sensor', 'climate', 'lock', 'cover', 'media_player'. Leave empty for all."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "ha_call_service",
            "description": "Call any Home Assistant service directly. Use for scenes, scripts, or advanced control not covered by control_device.",
            "parameters": {
                "type": "object",
                "properties": {
                    "domain":    {"type": "string", "description": "HA domain e.g. 'scene', 'script', 'homeassistant', 'notify'"},
                    "service":   {"type": "string", "description": "Service name e.g. 'turn_on', 'turn_off', 'reload'"},
                    "entity_id": {"type": "string", "description": "Target entity ID (optional for some services)"},
                    "data":      {"type": "object", "description": "Additional service data as JSON object"}
                },
                "required": ["domain", "service"]
            }
        }
    }
]

# ── Camera tools ───────────────────────────────────────────────────────────────
_CAMERA_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_cameras",
            "description": "List all configured RTSP IP cameras with stream status and last detection result.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_camera_detections",
            "description": (
                "Return the latest OpenCV detection results for a specific camera "
                "(motion, person, face). Use when the user asks 'is anyone at the door?', "
                "'what was detected?', or 'check the front door camera'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "camera_name": {"type": "string", "description": "Camera device name, e.g. front_door"}
                },
                "required": ["camera_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "start_camera",
            "description": "Start an RTSP IP camera stream by name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "camera_name": {"type": "string"}
                },
                "required": ["camera_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "stop_camera",
            "description": "Stop an RTSP IP camera stream by name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "camera_name": {"type": "string"}
                },
                "required": ["camera_name"]
            }
        }
    },
]

TOOLS = TOOLS + _CAMERA_TOOLS


# ── Tool subsets for selective injection ──────────────────────────────────────
_TOOL_NAMES_BASIC    = {"control_device", "blink_device", "sequence_actions", "set_device_brightness", "read_sensor", "list_devices", "get_logs"}
_TOOL_NAMES_MGMT     = {"register_device", "delete_device"}
_TOOL_NAMES_WORKFLOW = {"create_workflow", "list_workflows", "toggle_workflow", "delete_workflow", "execute_workflow"}
_TOOL_NAMES_EDGE     = {"push_script", "push_script_group", "rollback_script", "get_device_capabilities", "call_hardware_tool"}
_TOOL_NAMES_ZIGBEE   = {"zigbee_permit_join", "zigbee_remove_device", "zigbee_group_set"}
_TOOL_NAMES_HA       = {"ha_list_entities", "ha_call_service"}
_TOOL_NAMES_CAMERA   = {"list_cameras", "get_camera_detections", "start_camera", "stop_camera"}

_TOOLS_BY_NAME = {t["function"]["name"]: t for t in TOOLS}


def _select_tools(message: str) -> list:
    """Return minimal tool subset needed for this message. Reduces input tokens → faster TTFT."""
    msg = message.lower()
    names = set(_TOOL_NAMES_BASIC)
    if any(k in msg for k in {"register", "add device", "new device", "delete device", "remove device"}):
        names |= _TOOL_NAMES_MGMT
    if any(k in msg for k in {"workflow", "automation", "trigger", "schedule", "when ", "if temp", "secret code", "if motion"}):
        names |= _TOOL_NAMES_WORKFLOW
    if any(k in msg for k in {"esp32", "micropython", "script", "firmware", "push script", "edge", "pin ", "adc", "rollback"}):
        names |= _TOOL_NAMES_EDGE
    if any(k in msg for k in {"zigbee", "pair", "pairing", "z2m", "colorloop", "breathe", "color temp"}):
        names |= _TOOL_NAMES_ZIGBEE
    if any(k in msg for k in {"home assistant", "ha_", "entity", "climate", "thermostat", "scene", "hvac", "blind", "cover"}):
        names |= _TOOL_NAMES_HA
    if any(k in msg for k in {"camera", "rtsp", "detect", "detection", "motion", "door cam", "who is", "is anyone", "is there"}):
        names |= _TOOL_NAMES_CAMERA
    if _is_big_task(message):
        return TOOLS
    return [_TOOLS_BY_NAME[n] for n in names if n in _TOOLS_BY_NAME]


async def _exec_tool(tc_id: str, tool_name: str, tool_args: dict, dispatch: dict) -> tuple:
    """Execute a single tool call and return (tc_id, tool_name, tool_args, result)."""
    import inspect
    if tool_name in dispatch:
        fn = dispatch[tool_name]
        if inspect.iscoroutinefunction(fn):
            result = await fn(**tool_args)
        else:
            result = fn(**tool_args)
    else:
        result = {"error": f"Unknown tool: {tool_name}"}
    return tc_id, tool_name, tool_args, result


def _fuzzy_match(name: str, devices: dict) -> str | None:
    """Return best matching device name or None."""
    if name in devices:
        return name
    name_l = name.lower().replace(" ", "_")
    for k in devices:
        if k.lower() == name_l:
            return k
    candidates = [k for k in devices if name_l in k.lower() or k.lower() in name_l]
    if len(candidates) == 1:
        return candidates[0]
    words = set(name_l.replace("_", " ").split())
    scored = []
    for k in devices:
        k_words = set(k.lower().replace("_", " ").split())
        overlap = len(words & k_words)
        if overlap:
            scored.append((overlap, k))
    if scored:
        return max(scored, key=lambda x: x[0])[1]
    return None


def build_tool_dispatch(mqtt, storage, engine=None, registry=None):

    def _resolve(device_name: str) -> tuple[str | None, dict]:
        devices = storage.get_all_devices()
        matched = _fuzzy_match(device_name, devices)
        return matched, devices

    # ── Unified control_device ────────────────────────────────────────────────

    async def control_device(
        device_name: str,
        action: str,
        # Zigbee params
        brightness: int = None,
        color_temp: int = None,
        color: dict = None,
        effect: str = None,
        transition: float = None,
        # HA params
        brightness_pct: int = None,
        color_temp_kelvin: int = None,
        rgb_color: list = None,
        temperature: float = None,
        hvac_mode: str = None,
        media_content_id: str = None,
    ) -> dict:
        """Route a device command to MQTT, Zigbee, or HA — based on integration_source."""
        matched, devices = _resolve(device_name)
        if not matched:
            return {"error": f"Device '{device_name}' not found.", "known_devices": list(devices.keys())}

        device = devices[matched]
        src = device.get("integration_source", "mqtt")

        if src in ("zigbee", "ha") and registry:
            # Build params dict (exclude None values)
            params = {k: v for k, v in {
                "brightness":        brightness,
                "color_temp":        color_temp,
                "color":             color,
                "effect":            effect,
                "transition":        transition,
                "brightness_pct":    brightness_pct,
                "color_temp_kelvin": color_temp_kelvin,
                "rgb_color":         rgb_color,
                "temperature":       temperature,
                "hvac_mode":         hvac_mode,
                "media_content_id":  media_content_id,
            }.items() if v is not None}
            result = await registry.send_command(device, action.upper(), params)
            storage.add_log(
                "success" if result.get("ok") else "error", "ai",
                f"AI {src.upper()} control: {matched} → {action.upper()}",
                {"device": matched, "src": src, "action": action, **params}
            )
            return result

        # ── MQTT / legacy path ─────────────────────────────────────────────
        if engine:
            result = engine.execute_device_action(matched, action, source="ai")
            if result and result.get("error"):
                return result
            return {"status": "success", "device": matched, "action": action}
        topic = devices[matched]["topic_base"] + "/set"
        success = mqtt.publish(topic, action)
        if success:
            storage.update_device_field(matched, "status", action)
            storage.add_log("success", "ai", f"AI turned {action} → {matched}", {"device": matched, "action": action})
            return {"status": "success", "device": matched, "action": action}
        return {"error": f"MQTT publish failed for {topic}"}

    # ── blink / sequence (MQTT-only; threading model) ─────────────────────────

    def blink_device(device_name: str, times: int = 3, on_seconds: float = 0.5, off_seconds: float = 0.5) -> dict:
        matched, devices = _resolve(device_name)
        if not matched:
            return {"error": f"Device '{device_name}' not found.", "known_devices": list(devices.keys())}

        def _blink():
            for i in range(times):
                _do_control(matched, "ON", devices)
                time.sleep(on_seconds)
                _do_control(matched, "OFF", devices)
                if i < times - 1:
                    time.sleep(off_seconds)
            storage.add_log("success", "ai", f"AI blinked {matched} × {times}", {"device": matched, "times": times})

        threading.Thread(target=_blink, daemon=True).start()
        return {"status": "blinking", "device": matched, "times": times, "on_s": on_seconds, "off_s": off_seconds}

    def _do_control(device_name: str, action: str, devices: dict):
        if engine:
            engine.execute_device_action(device_name, action, source="ai")
        else:
            topic = devices[device_name]["topic_base"] + "/set"
            if mqtt.publish(topic, action):
                storage.update_device_field(device_name, "status", action)

    def sequence_actions(steps: list, description: str = "") -> dict:
        devices = storage.get_all_devices()

        def _run():
            executed = []
            for step in steps:
                step_type = step.get("type", "device")
                if step_type == "delay":
                    secs = float(step.get("seconds", 1))
                    time.sleep(secs)
                    executed.append({"waited": secs})
                elif step_type == "device":
                    dev = step.get("device_name") or step.get("device")
                    act = str(step.get("action", "ON")).upper()
                    matched = _fuzzy_match(dev, devices) if dev else None
                    if matched:
                        _do_control(matched, act, devices)
                        executed.append({"device": matched, "action": act})
                    else:
                        executed.append({"error": f"Device '{dev}' not found"})
            if description:
                storage.add_log("success", "ai", f"Sequence: {description}", {"steps": len(steps)})

        threading.Thread(target=_run, daemon=True).start()
        return {"status": "sequence_started", "steps": len(steps), "description": description or "Custom sequence"}

    # ── Other basic tools ──────────────────────────────────────────────────────

    def set_device_brightness(device_name: str, level: int) -> dict:
        matched, devices = _resolve(device_name)
        if not matched:
            return {"error": f"Device '{device_name}' not found."}
        topic = devices[matched]["topic_base"] + "/brightness/set"
        success = mqtt.publish(topic, str(level))
        if success:
            storage.update_device_field(matched, "brightness", level)
            storage.add_log("success", "ai", f"AI set brightness {matched} → {level}%", {"device": matched, "level": level})
            return {"status": "success", "device": matched, "brightness": level}
        return {"error": "MQTT publish failed"}

    def read_sensor(device_name: str) -> dict:
        """Read the current value/status of any device (MQTT, Zigbee, or HA)."""
        matched, devices = _resolve(device_name)
        if not matched:
            return {"error": f"Device '{device_name}' not found."}
        d = devices[matched]
        return {
            "device":             matched,
            "type":               d.get("type"),
            "value":              d.get("status", "unknown"),
            "unit":               d.get("unit", ""),
            "brightness":         d.get("brightness"),
            "last_updated":       d.get("last_updated", "never"),
            "integration_source": d.get("integration_source", "mqtt"),
        }

    def list_devices() -> dict:
        devices = storage.get_all_devices()
        storage.add_log("info", "ai", f"AI listed {len(devices)} devices")
        return {"devices": devices, "count": len(devices)}

    def register_device_fn(name: str, topic_base: str, type: str, unit: str = "",
                            location: str = "", description: str = "") -> dict:
        device = {"name": name, "topic_base": topic_base, "type": type,
                  "unit": unit, "location": location, "description": description}
        storage.register_device(device)
        mqtt.subscribe(topic_base + "/state")
        storage.add_log("success", "ai", f"AI registered device: {name}", {"device": name, "type": type})
        return {"status": "registered", "device": name}

    def delete_device_fn(device_name: str) -> dict:
        matched, _ = _resolve(device_name)
        if not matched:
            return {"error": f"Device '{device_name}' not found."}
        storage.delete_device(matched)
        storage.add_log("warning", "ai", f"AI deleted device: {matched}", {"device": matched})
        return {"status": "deleted", "device": matched}

    def create_workflow_fn(name: str, trigger: dict, actions: list,
                           description: str = "", cooldown_seconds: int = 60,
                           enabled: bool = True) -> dict:
        workflow = {"name": name, "description": description, "trigger": trigger,
                    "actions": actions, "cooldown_seconds": cooldown_seconds, "enabled": enabled}
        saved = storage.save_workflow(workflow)
        if engine:
            engine._rebuild_chat_triggers()
        storage.add_log("success", "ai", f"AI created workflow: {name}", {"trigger_type": trigger.get("type")})
        return {"status": "created", "workflow_id": saved["id"], "name": name}

    def list_workflows_fn() -> dict:
        wfs = storage.get_workflows()
        return {"workflows": wfs, "count": len(wfs)}

    def toggle_workflow_fn(workflow_id: str) -> dict:
        wfs = storage.get_workflows()
        if not any(w["id"] == workflow_id for w in wfs):
            match = next((w for w in wfs if w.get("name", "").lower() == workflow_id.lower()), None)
            if match:
                workflow_id = match["id"]
        result = storage.toggle_workflow(workflow_id)
        if result:
            state = "enabled" if result["enabled"] else "disabled"
            storage.add_log("info", "ai", f"AI {state} workflow: {result['name']}")
            return {"status": state, "workflow": result["name"]}
        return {"error": f"Workflow '{workflow_id}' not found."}

    def delete_workflow_fn(workflow_id: str) -> dict:
        workflows = storage.get_workflows()
        name = next((w["name"] for w in workflows if w["id"] == workflow_id), workflow_id)
        storage.delete_workflow(workflow_id)
        storage.add_log("warning", "ai", f"AI deleted workflow: {name}")
        return {"status": "deleted", "workflow_id": workflow_id}

    def execute_workflow_fn(workflow_id: str) -> dict:
        if not engine:
            return {"error": "Execution engine is not available."}
        workflows = storage.get_workflows()
        workflow = next(
            (w for w in workflows if w.get("id") == workflow_id or w.get("name", "").lower() == workflow_id.lower()),
            None
        )
        if not workflow:
            return {"error": f"Workflow '{workflow_id}' not found."}
        result = engine._execute_workflow_actions(workflow)
        storage.increment_workflow_run(workflow["id"])
        storage.add_log("success", "ai", f"AI ran workflow: {workflow.get('name')}", {"workflow_id": workflow["id"]})
        return {"status": "ran", "workflow": workflow.get("name"), "result": result}

    def push_script_group_fn(location: str, script: str, description: str = "") -> dict:
        devices = storage.get_all_devices()
        targets = [
            name for name, d in devices.items()
            if d.get("type") == "micropython_edge_agent"
            and (not location or d.get("location", "").lower() == location.lower())
        ]
        if not targets:
            return {"error": f"No edge devices found for location '{location}'.", "known_devices": list(devices.keys())}
        results = []
        for name in targets:
            topic = devices[name]["topic_base"] + "/script"
            ok = mqtt.publish(topic, script)
            if ok:
                storage.add_script_history(name, {
                    "ts": __import__("datetime").datetime.now().isoformat(),
                    "script": script,
                    "description": description
                })
            results.append({"device": name, "ok": ok})
        storage.add_log(
            "success", "ai",
            f"AI broadcast script to {len(targets)} edge device(s) in '{location or 'all'}': {description}",
            {"targets": targets, "bytes": len(script)}
        )
        return {"pushed_to": len([r for r in results if r["ok"]]), "devices": targets, "results": results}

    def rollback_script_fn(device_name: str, version: int = 1) -> dict:
        matched, devices = _resolve(device_name)
        if not matched:
            return {"error": f"Device '{device_name}' not found.", "known_devices": list(devices.keys())}
        history = storage.get_script_history(matched)
        if not history:
            return {"error": f"No script history for '{matched}'. Push a script first."}
        if version >= len(history):
            return {"error": f"Version {version} doesn't exist. History has {len(history)} entries (0–{len(history)-1})."}
        entry = history[version]
        topic = devices[matched]["topic_base"] + "/script"
        success = mqtt.publish(topic, entry["script"])
        if success:
            storage.add_script_history(matched, {**entry, "description": f"[rollback v{version}] {entry['description']}"})
            storage.add_log(
                "info", "ai",
                f"AI rolled back script on {matched} to v{version}: {entry['description']}",
                {"device": matched, "version": version}
            )
            return {"status": "rolled_back", "device": matched, "version": version, "description": entry["description"]}
        return {"error": "MQTT publish failed"}

    def push_script_fn(device_name: str, script: str, description: str = "") -> dict:
        matched, devices = _resolve(device_name)
        if not matched:
            return {"error": f"Device '{device_name}' not found.", "known_devices": list(devices.keys())}
        device = devices[matched]
        topic = device["topic_base"] + "/script"
        success = mqtt.publish(topic, script)
        if success:
            storage.update_device_field(matched, "last_script", description)
            storage.add_script_history(matched, {
                "ts": __import__("datetime").datetime.now().isoformat(),
                "script": script,
                "description": description,
            })
            storage.add_log(
                "success", "ai",
                f"AI pushed edge script to {matched}: {description}",
                {"device": matched, "bytes": len(script), "description": description}
            )
            return {"status": "script_pushed", "device": matched, "topic": topic,
                    "bytes": len(script), "description": description}
        return {"error": f"MQTT publish failed for {topic}"}

    def get_device_capabilities_fn(device_name: str) -> dict:
        matched, devices = _resolve(device_name)
        if not matched:
            return {"error": f"Device '{device_name}' not found.", "known_devices": list(devices.keys())}
        device = devices[matched]
        capabilities = device.get("capabilities")
        if not capabilities:
            return {
                "device": matched,
                "type": device.get("type"),
                "capabilities": None,
                "note": "No MCP manifest received yet. Device may not be a MicroPython edge agent, or hasn't booted yet."
            }
        return {"device": matched, "type": device.get("type"), "capabilities": capabilities}

    def get_logs_fn(limit: int = 20) -> dict:
        logs = storage.get_logs(limit=limit)
        return {"logs": logs, "count": len(logs)}

    async def call_hardware_tool_fn(device_name: str, tool_name: str, arguments: dict = None) -> dict:
        from app.services.mcp_client import MCPClient
        _mcp = MCPClient(mqtt=mqtt, storage=storage)
        mqtt.set_mcp_response_registry(_mcp.pending)
        result = await _mcp.call_tool(device_name, tool_name, arguments or {})
        return result

    # ── Zigbee management helpers ─────────────────────────────────────────────

    def _get_zigbee():
        """Return ZigbeeAdapter from registry (preferred) or legacy storage ref."""
        if registry:
            za = registry.get("zigbee")
            if za:
                return za
        # Fallback for Telegram bot path (no registry)
        return getattr(storage, '_zigbee_ref', None)

    def zigbee_permit_join_fn(enable: bool, duration: int = 120) -> dict:
        za = _get_zigbee()
        if not za:
            return {"error": "Zigbee adapter not running. Is ZIGBEE2MQTT_ENABLED=true in .env?"}
        result = za.permit_join(enable, duration)
        action = "opened" if enable else "closed"
        return {"pairing_mode": action, "duration": duration if enable else 0, "ok": result["ok"]}

    def zigbee_remove_device_fn(device_name: str, force: bool = False) -> dict:
        matched, devices = _resolve(device_name)
        if not matched:
            return {"error": f"Device '{device_name}' not found"}
        za = _get_zigbee()
        if not za:
            return {"error": "Zigbee adapter not running"}
        return za.remove_device(matched, force)

    def zigbee_group_set_fn(group_name: str, state: str = None, brightness: int = None,
                             color_temp: int = None, color: dict = None, effect: str = None) -> dict:
        za = _get_zigbee()
        if not za:
            return {"error": "Zigbee adapter not running"}
        payload = {}
        if state:      payload["state"]      = state.upper()
        if brightness: payload["brightness"] = brightness
        if color_temp: payload["color_temp"] = color_temp
        if color:      payload["color"]      = color
        if effect:     payload["effect"]     = effect
        ok = za.mqtt.publish(
            f"{os.getenv('ZIGBEE2MQTT_BASE_TOPIC', 'zigbee2mqtt')}/{group_name}/set",
            json.dumps(payload)
        )
        return {"group": group_name, "payload": payload, "ok": ok}

    # ── Home Assistant helpers ────────────────────────────────────────────────

    def _get_ha():
        """Return HomeAssistantAdapter from registry (preferred) or legacy storage ref."""
        if registry:
            ha = registry.get("ha")
            if ha:
                return ha
        return getattr(storage, '_ha_ref', None)

    def ha_list_entities_fn(domain: str = "") -> dict:
        devices = storage.get_all_devices()
        ha_devices = {k: v for k, v in devices.items() if v.get("ha_entity")}
        if domain:
            ha_devices = {k: v for k, v in ha_devices.items() if v.get("ha_domain") == domain.lower()}
        summary = [
            {
                "entity_id":   k,
                "type":        v.get("type"),
                "status":      v.get("status"),
                "description": v.get("description"),
                "location":    v.get("location"),
                "unit":        v.get("unit", ""),
            }
            for k, v in ha_devices.items()
        ]
        return {"entities": summary, "count": len(summary), "domain_filter": domain or "all"}

    async def ha_call_service_fn(domain: str, service: str,
                                  entity_id: str = "", data: dict = None) -> dict:
        ha = _get_ha()
        if not ha:
            return {"error": "Home Assistant adapter not running. Set HA_ENABLED=true in .env."}
        if not ha._connected:
            return {"error": "Home Assistant is not connected. Check HA_HOST and HA_TOKEN."}

        import json as _json
        if ha._ws:
            payload = {
                "id":           ha._next_id(),
                "type":         "call_service",
                "domain":       domain,
                "service":      service,
                "service_data": data or {},
            }
            if entity_id:
                payload["target"] = {"entity_id": entity_id}
            await ha._ws.send_str(_json.dumps(payload))
            storage.add_log(
                "success", "ai",
                f"AI raw HA service: {domain}.{service} → {entity_id or '(global)'}",
                {"domain": domain, "service": service, "entity_id": entity_id, "data": data}
            )
            return {"ok": True, "domain": domain, "service": service, "entity_id": entity_id}
        return {"error": "HA WebSocket not available"}

    return {
        "control_device":         control_device,
        "blink_device":           blink_device,
        "sequence_actions":       sequence_actions,
        "set_device_brightness":  set_device_brightness,
        "read_sensor":            read_sensor,
        "list_devices":           list_devices,
        "register_device":        register_device_fn,
        "delete_device":          delete_device_fn,
        "create_workflow":        create_workflow_fn,
        "list_workflows":         list_workflows_fn,
        "toggle_workflow":        toggle_workflow_fn,
        "delete_workflow":        delete_workflow_fn,
        "execute_workflow":       execute_workflow_fn,
        "get_logs":               get_logs_fn,
        "push_script":            push_script_fn,
        "push_script_group":      push_script_group_fn,
        "rollback_script":        rollback_script_fn,
        "get_device_capabilities": get_device_capabilities_fn,
        "call_hardware_tool":     call_hardware_tool_fn,
        # Zigbee management
        "zigbee_permit_join":     zigbee_permit_join_fn,
        "zigbee_remove_device":   zigbee_remove_device_fn,
        "zigbee_group_set":       zigbee_group_set_fn,
        # Home Assistant
        "ha_list_entities":       ha_list_entities_fn,
        "ha_call_service":        ha_call_service_fn,
        # RTSP cameras
        "list_cameras":           _list_cameras_fn,
        "get_camera_detections":  _get_camera_detections_fn,
        "start_camera":           _start_camera_fn,
        "stop_camera":            _stop_camera_fn,
    }


# ── Camera dispatch helpers (module-level, access rtsp_manager lazily) ────────────

def _get_rtsp_manager():
    """Lazily import rtsp_manager from main to avoid circular imports."""
    try:
        from app.main import rtsp_manager as _rm
        return _rm
    except Exception:
        return None


def _list_cameras_fn() -> dict:
    rm = _get_rtsp_manager()
    if not rm:
        return {"error": "RTSP camera manager not available."}
    cams = rm.list_cameras()
    return {"cameras": cams, "count": len(cams)}


def _get_camera_detections_fn(camera_name: str) -> dict:
    rm = _get_rtsp_manager()
    if not rm:
        return {"error": "RTSP camera manager not available."}
    cam = rm.get_camera(camera_name)
    if not cam:
        known = rm.worker_names
        return {"error": f"Camera '{camera_name}' not found.", "known_cameras": known}
    det = cam.get("last_detection", {})
    if not det:
        return {"camera": camera_name, "status": cam.get("running"), "last_detection": None,
                "message": "No detections recorded yet."}
    return {"camera": camera_name, "location": cam.get("location"), **det}


def _start_camera_fn(camera_name: str) -> dict:
    rm = _get_rtsp_manager()
    if not rm:
        return {"error": "RTSP camera manager not available."}
    return rm.start_camera(camera_name)


def _stop_camera_fn(camera_name: str) -> dict:
    rm = _get_rtsp_manager()
    if not rm:
        return {"error": "RTSP camera manager not available."}
    return rm.stop_camera(camera_name)


async def run_chat(user_message: str, history: list, mqtt, storage, engine=None, registry=None) -> dict:
    """Agentic loop: keep calling tools until the model returns a final text reply."""
    dispatch = build_tool_dispatch(mqtt, storage, engine, registry)

    fired = []
    if engine:
        fired = engine.check_chat_trigger(user_message)
        if fired:
            names = ", ".join(f["workflow"] for f in fired)
            storage.add_log("success", "engine", f"Chat trigger fired: {names}", {"message": user_message})

    if client is None:
        storage.add_log("warning", "ai", "AI chat disabled — OPENAI_API_KEY not configured")
        if fired:
            names = ", ".join(f["workflow"] for f in fired)
            return {"reply": f"Triggered workflow: {names}. Set OPENAI_API_KEY to enable full AI chat.", "tool_calls": []}
        return {"reply": "AI chat is disabled. Set OPENAI_API_KEY in backend/.env to enable natural-language control.", "tool_calls": []}

    is_big_task = _is_big_task(user_message)
    dynamic_prompt = SYSTEM_PROMPT if is_big_task else COMPACT_SYSTEM_PROMPT
    if mqtt and hasattr(mqtt, 'is_connected') and _needs_device_context(user_message):
        state = "ONLINE" if mqtt.is_connected else "OFFLINE"
        dynamic_prompt += (
            f"\n\n[SYSTEM CONTEXT: The internal MQTT Broker is currently {state}. "
            "If it is OFFLINE, device commands will be queued but not execute immediately. "
            "Politely inform the user if this happens.]"
        )

    storage.add_log(
        "info", "ai",
        f"AI prompt mode: {'full' if is_big_task else 'compact'}",
        {"message": user_message[:80]}
    )

    active_tools = _select_tools(user_message)
    trimmed_history = history[-12:] if len(history) > 12 else history
    messages = [{"role": "system", "content": dynamic_prompt}]
    messages.extend(trimmed_history)
    messages.append({"role": "user", "content": user_message})

    tool_calls_log = []
    MAX_ROUNDS = 15

    try:
        for _ in range(MAX_ROUNDS):
            kwargs: dict = {
                "model":    _model,
                "messages": messages,
                "tools":    active_tools,
                "tool_choice": "auto",
            }
            if not is_big_task:
                kwargs["max_completion_tokens"] = 3000
            response = await acompletion(api_base=_api_base, **kwargs)

            choice = response.choices[0]
            finish = choice.finish_reason

            if finish == "stop":
                storage.add_log("info", "ai", f"User: {user_message[:80]} → {len(tool_calls_log)} tool(s)")
                return {"reply": choice.message.content, "tool_calls": tool_calls_log}

            if finish == "length":
                content = (choice.message.content or "").strip()
                storage.add_log("warning", "ai", "AI hit token limit", {"message": user_message[:80], "is_big_task": is_big_task})
                if content:
                    return {"reply": content, "tool_calls": tool_calls_log}
                return {"reply": "Response was cut short due to length. Try a simpler request.", "tool_calls": tool_calls_log}

            if finish == "tool_calls":
                assistant_message = choice.message
                messages.append(assistant_message)

                parsed = []
                for tc in assistant_message.tool_calls:
                    try:
                        tool_args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        tool_args = {}
                    parsed.append((tc.id, tc.function.name, tool_args))

                results = await asyncio.gather(*[
                    _exec_tool(tc_id, name, args, dispatch)
                    for tc_id, name, args in parsed
                ])

                for tc_id, tool_name, tool_args, result in results:
                    tool_calls_log.append({"tool": tool_name, "args": tool_args, "result": result})
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc_id,
                        "content": json.dumps(result)
                    })
                continue

            storage.add_log("warning", "ai", f"Unexpected finish_reason: {finish}", {"message": user_message[:80]})
            break

        return {"reply": "I ran into an issue processing your request.", "tool_calls": tool_calls_log}

    except Exception as e:
        etype = type(e).__name__
        storage.add_log("error", "ai", f"AI error: {etype}: {str(e)[:100]}")
        if "RateLimitError" in etype:
            return {"reply": "I'm rate limited. Please wait a moment.", "tool_calls": []}
        elif "APIConnectionError" in etype:
            return {"reply": "Can't reach the AI service. Check your connection.", "tool_calls": []}
        return {"reply": f"AI error: {str(e)}", "tool_calls": []}


async def run_chat_stream(user_message: str, history: list, mqtt, storage, engine=None, registry=None):
    """Streaming agentic loop. Yields SSE-encoded lines for token-by-token delivery."""
    dispatch = build_tool_dispatch(mqtt, storage, engine, registry)

    fired = []
    if engine:
        fired = engine.check_chat_trigger(user_message)
        if fired:
            names = ", ".join(f["workflow"] for f in fired)
            storage.add_log("success", "engine", f"Chat trigger fired: {names}", {"message": user_message})

    if client is None:
        if fired:
            names = ", ".join(f["workflow"] for f in fired)
            msg = f"Triggered workflow: {names}. Set OPENAI_API_KEY to enable full AI chat."
        else:
            msg = "AI chat is disabled. Set OPENAI_API_KEY in backend/.env to enable natural-language control."
        yield f"data: {json.dumps({'type': 'token', 'content': msg})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'tool_calls': []})}\n\n"
        return

    is_big_task = _is_big_task(user_message)
    dynamic_prompt = SYSTEM_PROMPT if is_big_task else COMPACT_SYSTEM_PROMPT
    if mqtt and hasattr(mqtt, 'is_connected') and _needs_device_context(user_message):
        state = "ONLINE" if mqtt.is_connected else "OFFLINE"
        dynamic_prompt += (
            f"\n\n[SYSTEM CONTEXT: The internal MQTT Broker is currently {state}. "
            "If it is OFFLINE, device commands will be queued but not execute immediately. "
            "Politely inform the user if this happens.]"
        )

    active_tools = _select_tools(user_message)
    trimmed_history = history[-12:] if len(history) > 12 else history
    messages = [{"role": "system", "content": dynamic_prompt}]
    messages.extend(trimmed_history)
    messages.append({"role": "user", "content": user_message})

    tool_calls_log = []
    MAX_ROUNDS = 15

    try:
        for _ in range(MAX_ROUNDS):
            kwargs: dict = {
                "model":       _model,
                "messages":    messages,
                "tools":       active_tools,
                "tool_choice": "auto",
                "stream":      True,
            }
            if not is_big_task:
                kwargs["max_completion_tokens"] = 3000

            stream = await acompletion(api_base=_api_base, **kwargs)

            content_parts = []
            tool_calls_acc: dict = {}
            finish_reason = None

            async for chunk in stream:
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                if choice.finish_reason:
                    finish_reason = choice.finish_reason
                delta = choice.delta

                if delta.content:
                    content_parts.append(delta.content)
                    yield f"data: {json.dumps({'type': 'token', 'content': delta.content})}\n\n"

                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_acc:
                            tool_calls_acc[idx] = {"id": "", "name": "", "arguments": ""}
                        if tc.id:
                            tool_calls_acc[idx]["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                tool_calls_acc[idx]["name"] += tc.function.name
                            if tc.function.arguments:
                                tool_calls_acc[idx]["arguments"] += tc.function.arguments

            if finish_reason == "stop":
                storage.add_log("info", "ai", f"User: {user_message[:80]} → {len(tool_calls_log)} tool(s)")
                yield f"data: {json.dumps({'type': 'done', 'tool_calls': tool_calls_log})}\n\n"
                return

            if finish_reason == "length":
                storage.add_log("warning", "ai", "AI hit token limit (stream)", {"message": user_message[:80]})
                if not content_parts:
                    yield f"data: {json.dumps({'type': 'token', 'content': 'Response cut short. Try a simpler request.'})}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'tool_calls': tool_calls_log})}\n\n"
                return

            if finish_reason == "tool_calls":
                tcs = [tool_calls_acc[i] for i in sorted(tool_calls_acc.keys())]

                for tc in tcs:
                    yield f"data: {json.dumps({'type': 'tool_call', 'tool': tc['name']})}\n\n"

                messages.append({
                    "role":    "assistant",
                    "content": "".join(content_parts) or None,
                    "tool_calls": [
                        {"id": tc["id"], "type": "function",
                         "function": {"name": tc["name"], "arguments": tc["arguments"]}}
                        for tc in tcs
                    ],
                })

                parsed = []
                for tc in tcs:
                    try:
                        args = json.loads(tc["arguments"])
                    except json.JSONDecodeError:
                        args = {}
                    parsed.append((tc["id"], tc["name"], args))

                results = await asyncio.gather(*[
                    _exec_tool(tc_id, name, args, dispatch)
                    for tc_id, name, args in parsed
                ])

                for tc_id, tool_name, tool_args, result in results:
                    tool_calls_log.append({"tool": tool_name, "args": tool_args, "result": result})
                    messages.append({
                        "role":         "tool",
                        "tool_call_id": tc_id,
                        "content":      json.dumps(result),
                    })
                continue

            storage.add_log("warning", "ai", f"Unexpected finish_reason: {finish_reason}", {"message": user_message[:80]})
            break

        yield f"data: {json.dumps({'type': 'error', 'content': 'I ran into an issue processing your request.'})}\n\n"

    except Exception as e:
        etype = type(e).__name__
        storage.add_log("error", "ai", f"AI stream error: {etype}: {str(e)[:100]}")
        if "RateLimitError" in etype:
            msg = "I'm rate limited. Please wait a moment."
        elif "APIConnectionError" in etype:
            msg = "Can't reach the AI service. Check your connection."
        else:
            msg = f"AI error: {str(e)}"
        yield f"data: {json.dumps({'type': 'error', 'content': msg})}\n\n"
