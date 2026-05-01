import asyncio
import json
import os
import threading
import time

from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

_api_key = os.getenv("OPENAI_API_KEY")
_api_key_missing = not _api_key or _api_key.startswith("sk-proj-REPLACE")
client = None if _api_key_missing else AsyncOpenAI(api_key=_api_key)

SYSTEM_PROMPT = """You are iotClaw — a highly intelligent IoT automation assistant controlling real physical devices.

═══ CORE INTELLIGENCE RULES ═══
1. ALWAYS infer intent from natural language. Never ask unnecessary questions if you can reason from context.
2. For EVERY action request, call the appropriate tool. Never just describe what you WOULD do.
3. If a device name is ambiguous, use list_devices first, then pick the closest match by name/location.
4. Chain multiple tool calls in one response when the user's intent requires it.
5. Use blink_device for "blink", "flash", "pulse", "signal" commands.
6. Use sequence_actions for multi-step patterns like "turn on, wait 5 seconds, turn off".
7. After all tool calls, give a concise confirmation. Never just say "I'll do that" without calling a tool.

═══ INTENT EXAMPLES ═══
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
- "dim the lights to 40%" → set_device_brightness(light, 40)
- "is the light on?" → read_sensor(light_device), report status conversationally
- "schedule fan to turn on at 8am" → create_workflow(schedule trigger 08:00, device ON)

═══ DEVICE MATCHING ═══
- "the light" / "light" / "LED" → match any switch/dimmable_switch device
- "the fan" → match device with "fan" in name
- "cam" / "camera" / "eye" → laptop_security_camera
- If multiple matches, pick the one in context (e.g. "living room light" → living_room_*)
- Never fail if you can make a reasonable inference

═══ WORKFLOW INTELLIGENCE ═══
- Trigger types: sensor (threshold), chat (secret phrase), schedule (daily HH:MM), device_event (offline/online)
- Always set a meaningful cooldown_seconds based on the use case
- For "blink when motion detected" → sensor trigger on camera device + blink action using sequence
- For "alert me at 9pm" → schedule trigger + log action
- For "if my ESP32 goes offline, turn on the backup light" → device_event trigger (event: "offline") + device ON action
- For "when edge device comes back online, log it" → device_event trigger (event: "online") + log action
- device_event cooldown should be ≥300s to avoid re-firing on each engine tick

═══ EDGE SCRIPTING (MicroPython) ═══
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

═══ TONE ═══
Be concise, friendly, and confident. Confirm what you did in 1-2 sentences. Use emojis sparingly for warmth."""


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "control_device",
            "description": "Turn a device ON or OFF. Use for any on/off/toggle request.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string", "description": "Registered device name (snake_case)"},
                    "action": {"type": "string", "enum": ["ON", "OFF"]}
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
                    "times": {"type": "integer", "description": "Number of blink cycles (default 3)", "default": 3},
                    "on_seconds": {"type": "number", "description": "Seconds ON per cycle (default 0.5)", "default": 0.5},
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
                                "type": {"type": "string", "enum": ["device", "delay"], "description": "'device' to control a device, 'delay' to wait"},
                                "device_name": {"type": "string", "description": "Device name (for device steps)"},
                                "action": {"type": "string", "enum": ["ON", "OFF"], "description": "Action (for device steps)"},
                                "seconds": {"type": "number", "description": "Seconds to wait (for delay steps)"}
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
            "description": "Set brightness/level of a dimmable device (0-100). Use for 'dim', 'brighten', 'set level', '50%' etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string"},
                    "level": {"type": "integer", "minimum": 0, "maximum": 100}
                },
                "required": ["device_name", "level"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_sensor",
            "description": "Read the current value/status of a device or sensor.",
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
                    "name": {"type": "string", "description": "Unique snake_case device name"},
                    "topic_base": {"type": "string", "description": "MQTT topic base e.g. home/room/device"},
                    "type": {"type": "string", "enum": ["switch", "sensor", "dimmable_switch", "security_camera", "generic"]},
                    "unit": {"type": "string", "description": "Unit for sensor (e.g. °C, %, lux)"},
                    "location": {"type": "string", "description": "Room or location name"},
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
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "trigger": {
                        "type": "object",
                        "properties": {
                            "type": {"type": "string", "enum": ["sensor", "chat", "schedule", "device_event"]},
                            "device": {"type": "string"},
                            "operator": {"type": "string", "enum": [">", "<", ">=", "<=", "==", "!="]},
                            "value": {"type": "string"},
                            "code": {"type": "string"},
                            "time": {"type": "string", "description": "HH:MM"},
                            "event": {"type": "string", "enum": ["offline", "online"], "description": "For device_event trigger: which event to react to"}
                        },
                        "required": ["type"]
                    },
                    "actions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {"type": "string", "enum": ["device", "brightness", "camera_monitor", "log"]},
                                "device": {"type": "string"},
                                "command": {"type": "string", "enum": ["ON", "OFF"]},
                                "level": {"type": "integer"},
                                "message": {"type": "string"}
                            },
                            "required": ["type"]
                        }
                    },
                    "cooldown_seconds": {"type": "integer", "description": "Default 60"},
                    "enabled": {"type": "boolean"}
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
                        "description": "Valid MicroPython code. For repeating logic define a loop() function. Example: 'from machine import Pin\\nled=Pin(2,Pin.OUT)\\ndef loop():\\n  led.toggle()'"
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
            "description": "Push the same MicroPython script to ALL edge devices in a given location simultaneously. Use for synchronized effects: room-wide lighting patterns, coordinated sensor polling, etc. Pass an empty string for location to target all edge devices.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "Room/location name to target (e.g. 'living_room'). Empty string = all edge devices."},
                    "script": {"type": "string", "description": "Valid MicroPython code to push to all matched devices."},
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
                    "version": {"type": "integer", "description": "History index: 0 = last pushed, 1 = second-last, etc. (default 1 to undo the latest)", "default": 1}
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
                    "tool_name": {"type": "string", "description": "MCP tool name, e.g. set_led, set_pin, read_adc"},
                    "arguments": {"type": "object", "description": "Tool arguments as a JSON object, e.g. {\"pin\": 5, \"state\": \"ON\"}"}
                },
                "required": ["device_name", "tool_name"]
            }
        }
    }
]


def _fuzzy_match(name: str, devices: dict) -> str | None:
    """Return best matching device name or None."""
    if name in devices:
        return name
    name_l = name.lower().replace(" ", "_")
    # Exact key match ignoring case
    for k in devices:
        if k.lower() == name_l:
            return k
    # Substring match
    candidates = [k for k in devices if name_l in k.lower() or k.lower() in name_l]
    if len(candidates) == 1:
        return candidates[0]
    # Word overlap
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


def build_tool_dispatch(mqtt, storage, engine=None):

    def _resolve(device_name: str) -> tuple[str | None, dict]:
        devices = storage.get_all_devices()
        matched = _fuzzy_match(device_name, devices)
        return matched, devices

    def control_device(device_name: str, action: str) -> dict:
        matched, devices = _resolve(device_name)
        if not matched:
            return {"error": f"Device '{device_name}' not found.", "known_devices": list(devices.keys())}
        if engine:
            result = engine.execute_device_action(matched, action, source="ai")
            if result.get("error"):
                return result
            return {"status": "success", "device": matched, "action": action}
        topic = devices[matched]["topic_base"] + "/set"
        success = mqtt.publish(topic, action)
        if success:
            storage.update_device_field(matched, "status", action)
            storage.add_log("success", "ai", f"AI turned {action} → {matched}", {"device": matched, "action": action})
            return {"status": "success", "device": matched, "action": action}
        return {"error": f"MQTT publish failed for {topic}"}

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
        """Execute a timed sequence of device steps with optional delays."""
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
        matched, devices = _resolve(device_name)
        if not matched:
            return {"error": f"Device '{device_name}' not found."}
        d = devices[matched]
        return {"device": matched, "value": d.get("status", "unknown"),
                "unit": d.get("unit", ""), "last_updated": d.get("last_updated", "never")}

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
        # Try match by name if ID not found
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
        """Call a native MCP tool on an edge device and return the result."""
        # Import here to avoid circular dependency; mcp is already wired in main.py
        # We call the REST endpoint logic directly via the mcp_client module
        from mcp_client import MCPClient
        _mcp = MCPClient(mqtt=mqtt, storage=storage)
        mqtt.set_mcp_response_registry(_mcp.pending)
        result = await _mcp.call_tool(device_name, tool_name, arguments or {})
        return result

    return {
        "control_device": control_device,
        "blink_device": blink_device,
        "sequence_actions": sequence_actions,
        "set_device_brightness": set_device_brightness,
        "read_sensor": read_sensor,
        "list_devices": list_devices,
        "register_device": register_device_fn,
        "delete_device": delete_device_fn,
        "create_workflow": create_workflow_fn,
        "list_workflows": list_workflows_fn,
        "toggle_workflow": toggle_workflow_fn,
        "delete_workflow": delete_workflow_fn,
        "execute_workflow": execute_workflow_fn,
        "get_logs": get_logs_fn,
        "push_script": push_script_fn,
        "push_script_group": push_script_group_fn,
        "rollback_script": rollback_script_fn,
        "get_device_capabilities": get_device_capabilities_fn,
        "call_hardware_tool": call_hardware_tool_fn,
    }


async def run_chat(user_message: str, history: list, mqtt, storage, engine=None) -> dict:
    """Agentic loop: keep calling tools until the model returns a final text reply."""
    dispatch = build_tool_dispatch(mqtt, storage, engine)

    # Check chat-triggers before OpenAI
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

    dynamic_prompt = SYSTEM_PROMPT
    if mqtt and hasattr(mqtt, 'is_connected'):
        state = "ONLINE" if mqtt.is_connected else "OFFLINE"
        dynamic_prompt += f"\n\n[SYSTEM CONTEXT: The internal MQTT Broker is currently {state}. If it is OFFLINE, your device commands will be queued but they will not execute immediately. Make sure to politely inform the user if this happens.]"

    messages = [{"role": "system", "content": dynamic_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    tool_calls_log = []
    MAX_ROUNDS = 8  # prevent infinite loops

    try:
        for _ in range(MAX_ROUNDS):
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                max_tokens=1024,
            )

            choice = response.choices[0]

            # Model gave a text reply — done
            if choice.finish_reason == "stop":
                storage.add_log("info", "ai", f"User: {user_message[:80]} → {len(tool_calls_log)} tool(s)")
                return {"reply": choice.message.content, "tool_calls": tool_calls_log}

            # Model wants to call tools
            if choice.finish_reason == "tool_calls":
                assistant_message = choice.message
                messages.append(assistant_message)

                for tc in assistant_message.tool_calls:
                    tool_name = tc.function.name
                    try:
                        tool_args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        tool_args = {}

                    print(f"[AI] Tool: {tool_name} args={tool_args}")

                    if tool_name in dispatch:
                        fn = dispatch[tool_name]
                        import inspect
                        if inspect.iscoroutinefunction(fn):
                            result = await fn(**tool_args)
                        else:
                            result = fn(**tool_args)
                    else:
                        result = {"error": f"Unknown tool: {tool_name}"}

                    tool_calls_log.append({"tool": tool_name, "args": tool_args, "result": result})

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result)
                    })

                # Continue the loop — let the model decide if more tools are needed
                continue

            # Unexpected finish reason
            break

        return {"reply": "I ran into an issue processing your request.", "tool_calls": tool_calls_log}

    except Exception as e:
        etype = type(e).__name__
        print(f"[AI] Error: {etype}: {e}")
        storage.add_log("error", "ai", f"AI error: {etype}: {str(e)[:100]}")
        if "RateLimitError" in etype:
            return {"reply": "I'm rate limited. Please wait a moment.", "tool_calls": []}
        elif "APIConnectionError" in etype:
            return {"reply": "Can't reach the AI service. Check your connection.", "tool_calls": []}
        return {"reply": f"AI error: {str(e)}", "tool_calls": []}
