import json

class EdgeCompiler:
    def __init__(self, storage):
        self.storage = storage

    def compile(self, workflow):
        """
        Compiles a workflow into a MicroPython script for an edge device.
        Returns: (target_device_name, compiled_script_string)
        """
        trigger = workflow.get("trigger", {})
        actions = workflow.get("actions", [])
        
        if trigger.get("type") != "sensor":
            raise ValueError("Only 'sensor' triggers can currently be compiled to edge logic.")
            
        target_device = trigger.get("device")
        devices = self.storage.get_all_devices()
        
        if not target_device or target_device not in devices:
            raise ValueError(f"Trigger device '{target_device}' not found.")
            
        device_type = devices[target_device].get("type")
        if device_type != "micropython_edge_agent":
            raise ValueError("Target device must be a 'micropython_edge_agent' to run edge logic.")

        operator = trigger.get("operator", ">")
        threshold = trigger.get("value", 0)
        cooldown = workflow.get("cooldown_seconds", 60)

        # Generate action commands
        action_lines = []
        for action in actions:
            action_type = action.get("type", "device")
            if action_type == "device":
                action_dev = action.get("device")
                command = action.get("command", "ON")
                if action_dev in devices:
                    topic = devices[action_dev]["topic_base"] + "/set"
                    action_lines.append(f'mqtt.publish("{topic}", "{command}")')
            elif action_type == "brightness":
                action_dev = action.get("device")
                level = action.get("level", 50)
                if action_dev in devices:
                    topic = devices[action_dev]["topic_base"] + "/brightness/set"
                    action_lines.append(f'mqtt.publish("{topic}", "{level}")')

        if not action_lines:
            raise ValueError("No valid actions to compile.")

        actions_str = "\n                ".join(action_lines)

        script = f"""import time

_edge_cooldown = {cooldown * 1000}  # milliseconds
_edge_last_fired = 0

def loop():
    global _edge_last_fired
    try:
        if not _has_adc:
            return
        val = _adc.read()
        if val {operator} {threshold}:
            now = time.ticks_ms()
            if time.ticks_diff(now, _edge_last_fired) > _edge_cooldown:
                # Execute compiled actions
                {actions_str}
                _edge_last_fired = now
                print(f"[Edge Compiled] Workflow '{workflow.get('name')}' fired locally.")
    except Exception as e:
        print("[Edge Loop Error]", e)
"""
        return target_device, script
