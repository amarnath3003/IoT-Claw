import json
import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

_api_key = os.getenv("OPENAI_API_KEY")
_api_key_missing = not _api_key or _api_key.startswith("sk-proj-REPLACE")
client = None if _api_key_missing else AsyncOpenAI(api_key=_api_key)

SYSTEM_PROMPT = """You are iotClaw, an intelligent IoT automation assistant.
You control physical smart home devices through MQTT and manage automations.

RULES:
- When the user asks to control a device (turn on/off, set brightness), ALWAYS call the tool — never just describe it.
- When registering, deleting, or reading a device, ALWAYS call the tool.
- When creating a workflow/automation, use create_workflow. Workflows can be triggered by:
  * sensor: a device value crossing a threshold (e.g. temp > 30)
  * chat: a secret code the user types in chat (e.g. "activate night mode")
  * schedule: a daily time (e.g. "every day at 07:30")
- Workflows can have multiple chained actions.
- The laptop webcam is auto-registered as laptop_security_camera. For security camera monitoring, create a schedule/chat/sensor workflow with a camera_monitor action set to ON.
- When the user asks to run an existing workflow now, use execute_workflow.
- Always confirm what you did after tool execution. Be concise and friendly.
- If the user mentions a device by a casual name (e.g. "the light"), infer the closest registered device name.
- If a device is not found, list the known devices and ask the user to clarify."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "control_device",
            "description": "Turn a device ON or OFF via MQTT. Use whenever user says turn on/off/toggle a device.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string", "description": "Exact registered device name (snake_case)"},
                    "action": {"type": "string", "enum": ["ON", "OFF"]}
                },
                "required": ["device_name", "action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "set_device_brightness",
            "description": "Set brightness/level of a dimmable device (0-100).",
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
            "description": "List all registered devices and their current states.",
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
            "description": "Remove a device from the system. Use when user asks to delete, remove, or unregister a device.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {"type": "string", "description": "Exact name of the device to delete"}
                },
                "required": ["device_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_workflow",
            "description": """Create an automation workflow. Supports three trigger types:
1. sensor: fires when a device value meets a condition (e.g. temp > 30)
2. chat: fires when the user types a secret code/phrase in the chat
3. schedule: fires every day at a specific time (HH:MM format)
Actions can be: device control, brightness setting, camera monitoring, or log message.
Multiple actions can be chained in one workflow.""",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Short workflow name"},
                    "description": {"type": "string", "description": "What this workflow does"},
                    "trigger": {
                        "type": "object",
                        "description": "Trigger configuration",
                        "properties": {
                            "type": {"type": "string", "enum": ["sensor", "chat", "schedule"],
                                     "description": "sensor=threshold, chat=secret code, schedule=daily time"},
                            "device": {"type": "string", "description": "Device name (sensor triggers only)"},
                            "operator": {"type": "string", "enum": [">", "<", ">=", "<=", "==", "!="],
                                         "description": "Comparison operator (sensor triggers only)"},
                            "value": {
                                "type": "string",
                                "description": "Threshold value for sensor triggers (number or text, e.g. 30 or ON)"
                            },
                            "code": {"type": "string", "description": "Secret phrase to type in chat (chat triggers)"},
                            "time": {"type": "string", "description": "Time in HH:MM format (schedule triggers)"}
                        },
                        "required": ["type"]
                    },
                    "actions": {
                        "type": "array",
                        "description": "List of actions to perform when triggered",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {"type": "string", "enum": ["device", "brightness", "camera_monitor", "log"]},
                                "device": {"type": "string", "description": "Device to control"},
                                "command": {"type": "string", "enum": ["ON", "OFF"], "description": "For device type"},
                                "level": {"type": "integer", "description": "For brightness type (0-100)"},
                                "message": {"type": "string", "description": "For log type"}
                            },
                            "required": ["type"]
                        }
                    },
                    "cooldown_seconds": {
                        "type": "integer",
                        "description": "Seconds before this workflow can trigger again (default 60)"
                    },
                    "enabled": {"type": "boolean", "description": "Whether workflow is active (default true)"}
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
            "description": "Enable or disable a workflow by its ID or name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workflow_id": {"type": "string", "description": "The workflow ID to toggle"}
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
            "description": "Run a saved workflow immediately by ID or exact workflow name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "workflow_id": {"type": "string", "description": "Workflow ID or exact workflow name"}
                },
                "required": ["workflow_id"]
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
                    "limit": {"type": "integer", "description": "Number of recent logs to return (default 20)"}
                }
            }
        }
    }
]


def build_tool_dispatch(mqtt, storage, engine=None):

    def control_device(device_name: str, action: str) -> dict:
        devices = storage.get_all_devices()
        if device_name not in devices:
            # Fuzzy match attempt
            close = [d for d in devices if device_name.lower() in d.lower() or d.lower() in device_name.lower()]
            if len(close) == 1:
                device_name = close[0]
            else:
                return {"error": f"Device '{device_name}' not found.", "known_devices": list(devices.keys())}
        if engine:
            result = engine.execute_device_action(device_name, action, source="ai")
            if result.get("error"):
                return result
            return {"status": "success", "device": device_name, "action": action, "result": result}
        topic = devices[device_name]["topic_base"] + "/set"
        success = mqtt.publish(topic, action)
        if success:
            storage.update_device_field(device_name, "status", action)
            storage.add_log("success", "ai", f"AI turned {action} → {device_name}", {"device": device_name, "action": action})
            return {"status": "success", "device": device_name, "action": action}
        return {"error": f"MQTT publish failed for {topic}"}

    def set_device_brightness(device_name: str, level: int) -> dict:
        devices = storage.get_all_devices()
        if device_name not in devices:
            return {"error": f"Device '{device_name}' not found."}
        topic = devices[device_name]["topic_base"] + "/brightness/set"
        success = mqtt.publish(topic, str(level))
        if success:
            storage.update_device_field(device_name, "brightness", level)
            storage.add_log("success", "ai", f"AI set brightness {device_name} → {level}%", {"device": device_name, "level": level})
            return {"status": "success", "device": device_name, "brightness": level}
        return {"error": "MQTT publish failed"}

    def read_sensor(device_name: str) -> dict:
        devices = storage.get_all_devices()
        if device_name not in devices:
            return {"error": f"Device '{device_name}' not found."}
        d = devices[device_name]
        return {"device": device_name, "value": d.get("status", "unknown"),
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
        storage.add_log("success", "ai", f"AI registered device: {name}", {"device": name, "type": type, "topic": topic_base})
        return {"status": "registered", "device": name}

    def delete_device_fn(device_name: str) -> dict:
        ok = storage.delete_device(device_name)
        if ok:
            storage.add_log("warning", "ai", f"AI deleted device: {device_name}", {"device": device_name})
            return {"status": "deleted", "device": device_name}
        return {"error": f"Device '{device_name}' not found."}

    def create_workflow_fn(name: str, trigger: dict, actions: list,
                           description: str = "", cooldown_seconds: int = 60,
                           enabled: bool = True) -> dict:
        workflow = {
            "name": name,
            "description": description,
            "trigger": trigger,
            "actions": actions,
            "cooldown_seconds": cooldown_seconds,
            "enabled": enabled
        }
        saved = storage.save_workflow(workflow)
        if engine:
            engine._rebuild_chat_triggers()
        storage.add_log("success", "ai", f"AI created workflow: {name}", {"trigger_type": trigger.get("type")})
        return {"status": "created", "workflow_id": saved["id"], "name": name}

    def list_workflows_fn() -> dict:
        wfs = storage.get_workflows()
        return {"workflows": wfs, "count": len(wfs)}

    def toggle_workflow_fn(workflow_id: str) -> dict:
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

    def get_logs_fn(limit: int = 20) -> dict:
        logs = storage.get_logs(limit=limit)
        return {"logs": logs, "count": len(logs)}

    return {
        "control_device": control_device,
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
    }


async def run_chat(user_message: str, history: list, mqtt, storage, engine=None) -> dict:
    """Returns dict with reply and tool_calls list for frontend logging."""
    dispatch = build_tool_dispatch(mqtt, storage, engine)

    # Check chat-triggers before calling OpenAI
    fired = []
    if engine:
        fired = engine.check_chat_trigger(user_message)
        if fired:
            names = ", ".join(f["workflow"] for f in fired)
            storage.add_log("success", "engine", f"Chat trigger fired: {names}", {"message": user_message})

    if client is None:
        storage.add_log("warning", "ai", "AI chat is disabled because OPENAI_API_KEY is not configured")
        if fired:
            names = ", ".join(f["workflow"] for f in fired)
            return {"reply": f"Triggered workflow: {names}. AI chat is disabled until OPENAI_API_KEY is configured.", "tool_calls": []}
        return {
            "reply": "AI chat is disabled. Set OPENAI_API_KEY in backend/.env to enable natural-language control.",
            "tool_calls": [],
        }

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    tool_calls_log = []

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            max_tokens=1024,
        )

        choice = response.choices[0]

        if choice.finish_reason == "stop":
            storage.add_log("info", "ai", f"User: {user_message[:80]}")
            return {"reply": choice.message.content, "tool_calls": []}

        if choice.finish_reason == "tool_calls":
            assistant_message = choice.message
            messages.append(assistant_message)

            for tc in assistant_message.tool_calls:
                tool_name = tc.function.name
                tool_args = json.loads(tc.function.arguments)
                print(f"[AI] Tool: {tool_name} args={tool_args}")

                if tool_name in dispatch:
                    result = dispatch[tool_name](**tool_args)
                else:
                    result = {"error": f"Unknown tool: {tool_name}"}

                tool_calls_log.append({"tool": tool_name, "args": tool_args, "result": result})

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result)
                })

            final = await client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                max_tokens=1024,
            )
            reply = final.choices[0].message.content
            storage.add_log("info", "ai", f"User: {user_message[:80]} → {len(tool_calls_log)} tool(s) called")
            return {"reply": reply, "tool_calls": tool_calls_log}

        return {"reply": "I encountered an unexpected response format.", "tool_calls": []}

    except Exception as e:
        etype = type(e).__name__
        print(f"[AI] Error: {etype}: {e}")
        storage.add_log("error", "ai", f"AI error: {etype}: {str(e)[:100]}")
        if "RateLimitError" in etype:
            return {"reply": "I'm rate limited. Please wait a moment.", "tool_calls": []}
        elif "APIConnectionError" in etype:
            return {"reply": "Can't reach the AI service. Check your connection.", "tool_calls": []}
        return {"reply": f"AI error: {str(e)}", "tool_calls": []}
