import json
import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

_api_key = os.getenv("OPENAI_API_KEY")
if not _api_key or _api_key.startswith("sk-proj-REPLACE"):
    raise RuntimeError(
        "[ai_agent] OPENAI_API_KEY is not set or is still the placeholder value. "
        "Please edit backend/.env and set your real OpenAI API key."
    )

client = AsyncOpenAI(api_key=_api_key)
MODEL_NAME = os.getenv("OPENAI_MODEL", "gpt-4.1")

# ─────────────────────────────────────────
# SYSTEM PROMPT
# ─────────────────────────────────────────
SYSTEM_PROMPT = """You are iotClaw, an intelligent IoT automation assistant.
You control physical smart home devices through MQTT. You have access to tools that
let you read sensor data and control devices. When a user asks you to control a device
or read a sensor, always use the appropriate tool — do not just describe what you would do.
Be concise and friendly. Confirm actions after executing them.
If the user asks you to create an automation (e.g., "if temp > 30, turn on the fan"),
use the create_workflow tool to save it. Always reference the current device state
when answering questions about device status."""

# ─────────────────────────────────────────
# TOOL DEFINITIONS (OpenAI function calling schema)
# ─────────────────────────────────────────
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "control_device",
            "description": "Send an ON or OFF command to a physical IoT device via MQTT. Use this whenever the user wants to turn something on or off.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {
                        "type": "string",
                        "description": "The exact name of the device as registered in the system (e.g., 'living_room_fan', 'kitchen_light', 'water_pump')"
                    },
                    "action": {
                        "type": "string",
                        "enum": ["ON", "OFF"],
                        "description": "The action to perform on the device"
                    }
                },
                "required": ["device_name", "action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_sensor",
            "description": "Read the latest value from a sensor or check the current state of a device. Use this when the user asks 'what is the temperature', 'is the light on', etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {
                        "type": "string",
                        "description": "The exact name of the device or sensor to read (e.g., 'greenhouse_temp', 'living_room_light')"
                    }
                },
                "required": ["device_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_devices",
            "description": "Get a list of all registered devices and their current states. Use this when the user asks what devices are available or wants an overview.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_workflow",
            "description": "Create and save a new automation workflow. Use when user describes an if/then automation rule like 'if temperature goes above 30, turn on the fan'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "A short descriptive name for this workflow (e.g., 'Auto Fan Cooling')"
                    },
                    "trigger_device": {
                        "type": "string",
                        "description": "The sensor/device name that triggers this workflow"
                    },
                    "trigger_operator": {
                        "type": "string",
                        "enum": [">", "<", ">=", "<=", "==", "!="],
                        "description": "The comparison operator"
                    },
                    "trigger_value": {
                        "type": "number",
                        "description": "The threshold value to compare against"
                    },
                    "action_device": {
                        "type": "string",
                        "description": "The device to control when the trigger fires"
                    },
                    "action_command": {
                        "type": "string",
                        "enum": ["ON", "OFF"],
                        "description": "The command to send to the action device"
                    }
                },
                "required": ["name", "trigger_device", "trigger_operator", "trigger_value", "action_device", "action_command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "set_device_brightness",
            "description": "Set a dimmable light or variable-speed device to a specific level (0-100%). Only use if the device supports dimming.",
            "parameters": {
                "type": "object",
                "properties": {
                    "device_name": {
                        "type": "string",
                        "description": "The name of the dimmable device"
                    },
                    "level": {
                        "type": "integer",
                        "description": "Brightness/speed level as a percentage (0=off, 100=full)"
                    }
                },
                "required": ["device_name", "level"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "register_device",
            "description": "Register a new IoT device in the system. Use when user says they want to add a device, register a sensor, or set up a new device.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Unique name for the device, snake_case (e.g., 'greenhouse_temp', 'living_room_fan')"
                    },
                    "topic_base": {
                        "type": "string",
                        "description": "The MQTT topic base for this device (e.g., 'home/greenhouse/temperature')"
                    },
                    "type": {
                        "type": "string",
                        "enum": ["switch", "sensor", "dimmable_switch", "generic"],
                        "description": "The type of device"
                    },
                    "unit": {
                        "type": "string",
                        "description": "Optional unit for sensor readings (e.g., '°C', '%', 'lux')"
                    }
                },
                "required": ["name", "topic_base", "type"]
            }
        }
    }
]

# ─────────────────────────────────────────
# TOOL DISPATCH — maps tool name to Python function
# ─────────────────────────────────────────
def build_tool_dispatch(mqtt, storage):
    """Returns a dict mapping tool names to callable functions."""

    def control_device(device_name: str, action: str) -> dict:
        devices = storage.get_all_devices()
        if device_name not in devices:
            return {"error": f"Device '{device_name}' not found. Known devices: {list(devices.keys())}"}
        topic_base = devices[device_name]["topic_base"]
        command_topic = f"{topic_base}/set"
        success = mqtt.publish(command_topic, action)
        if success:
            storage.update_device_field(device_name, "status", action)
            return {"status": "success", "device": device_name, "action": action, "topic": command_topic}
        return {"error": f"MQTT publish failed for {command_topic}"}

    def read_sensor(device_name: str) -> dict:
        devices = storage.get_all_devices()
        if device_name not in devices:
            return {"error": f"Device '{device_name}' not found."}
        device = devices[device_name]
        return {
            "device": device_name,
            "value": device.get("status", "unknown"),
            "unit": device.get("unit", ""),
            "last_updated": device.get("last_updated", "never")
        }

    def list_devices() -> dict:
        return {"devices": storage.get_all_devices()}

    def create_workflow(name, trigger_device, trigger_operator, trigger_value, action_device, action_command) -> dict:
        workflow = {
            "name": name,
            "trigger": {
                "device": trigger_device,
                "operator": trigger_operator,
                "value": trigger_value
            },
            "action": {
                "device": action_device,
                "command": action_command
            },
            "enabled": True
        }
        saved = storage.save_workflow(workflow)
        return {"status": "created", "workflow": saved}

    def set_device_brightness(device_name: str, level: int) -> dict:
        devices = storage.get_all_devices()
        if device_name not in devices:
            return {"error": f"Device '{device_name}' not found."}
        topic_base = devices[device_name]["topic_base"]
        command_topic = f"{topic_base}/brightness/set"
        success = mqtt.publish(command_topic, str(level))
        if success:
            storage.update_device_field(device_name, "brightness", level)
            return {"status": "success", "device": device_name, "brightness": level}
        return {"error": "MQTT publish failed"}

    def register_device_tool(name: str, topic_base: str, type: str, unit: str = "") -> dict:
        device = {"name": name, "topic_base": topic_base, "type": type, "unit": unit}
        storage.register_device(device)
        mqtt.subscribe(topic_base + "/state")
        return {"status": "registered", "device": name, "topic_base": topic_base, "type": type}

    return {
        "control_device": control_device,
        "read_sensor": read_sensor,
        "list_devices": list_devices,
        "create_workflow": create_workflow,
        "set_device_brightness": set_device_brightness,
        "register_device": register_device_tool,
    }

# ─────────────────────────────────────────
# MAIN CHAT FUNCTION — the tool-calling loop
# ─────────────────────────────────────────
async def run_chat(user_message: str, history: list, mqtt, storage) -> str:
    dispatch = build_tool_dispatch(mqtt, storage)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    try:
        # First API call — may return tool calls
        response = await client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            max_tokens=1024,
        )

        choice = response.choices[0]

        # If no tool calls, return the direct text response
        if choice.finish_reason == "stop":
            return choice.message.content

        # Process tool calls
        if choice.finish_reason == "tool_calls":
            assistant_message = choice.message

            # Append the assistant's message (including tool_calls) to history
            messages.append(assistant_message)

            # Execute each tool call and collect results
            for tool_call in assistant_message.tool_calls:
                tool_name = tool_call.function.name
                tool_args = json.loads(tool_call.function.arguments)

                print(f"[AI] Calling tool: {tool_name} with args: {tool_args}")

                if tool_name in dispatch:
                    tool_result = dispatch[tool_name](**tool_args)
                else:
                    tool_result = {"error": f"Unknown tool: {tool_name}"}

                # Append tool result to messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(tool_result)
                })

            # Second API call — with tool results, get final reply
            final_response = await client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                max_tokens=1024,
            )

            return final_response.choices[0].message.content

        return "I encountered an unexpected response format."

    except Exception as e:
        error_type = type(e).__name__
        print(f"[AI] Error: {error_type}: {e}")
        if "RateLimitError" in error_type:
            return "I'm temporarily rate limited. Please try again in a moment."
        elif "APIConnectionError" in error_type:
            return "Could not reach the AI service. Check your internet connection."
        else:
            return f"AI service error: {str(e)}"