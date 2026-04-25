import asyncio
from datetime import datetime, timedelta

class ExecutionEngine:
    def __init__(self, storage, mqtt, check_interval: float = 5.0):
        self.storage = storage
        self.mqtt = mqtt
        self.check_interval = check_interval  # seconds between evaluation cycles
        self._last_triggered: dict = {}  # workflow_id -> datetime of last trigger
        self.cooldown_seconds = 60  # minimum seconds between re-triggers per workflow

    async def run(self):
        print("[Engine] Execution engine started.")
        while True:
            try:
                await self._evaluate_all()
            except Exception as e:
                print(f"[Engine] Error during evaluation: {e}")
            await asyncio.sleep(self.check_interval)

    async def _evaluate_all(self):
        workflows = self.storage.get_workflows()
        devices = self.storage.get_all_devices()

        for workflow in workflows:
            if not workflow.get("enabled", True):
                continue
            try:
                self._evaluate_one(workflow, devices)
            except Exception as e:
                print(f"[Engine] Error evaluating workflow '{workflow.get('name')}': {e}")

    def _evaluate_one(self, workflow: dict, devices: dict):
        trigger = workflow["trigger"]
        trigger_device = trigger["device"]
        operator = trigger["operator"]
        threshold = float(trigger["value"])

        if trigger_device not in devices:
            return

        raw_value = devices[trigger_device].get("status", None)
        if raw_value is None or raw_value == "unknown":
            return

        try:
            current_value = float(raw_value)
        except (ValueError, TypeError):
            return  # Can't compare non-numeric values with >, <, etc.

        # Evaluate condition
        condition_met = False
        if operator == ">" and current_value > threshold:
            condition_met = True
        elif operator == "<" and current_value < threshold:
            condition_met = True
        elif operator == ">=" and current_value >= threshold:
            condition_met = True
        elif operator == "<=" and current_value <= threshold:
            condition_met = True
        elif operator == "==" and current_value == threshold:
            condition_met = True
        elif operator == "!=" and current_value != threshold:
            condition_met = True

        if not condition_met:
            return

        # Check cooldown
        wid = workflow.get("id", workflow.get("name"))
        last = self._last_triggered.get(wid)
        if last and (datetime.utcnow() - last).total_seconds() < self.cooldown_seconds:
            return  # Still in cooldown

        # Execute action
        action = workflow["action"]
        action_device = action["device"]
        action_command = action["command"]

        all_devices = self.storage.get_all_devices()
        if action_device not in all_devices:
            print(f"[Engine] Action device '{action_device}' not found.")
            return

        topic_base = all_devices[action_device]["topic_base"]
        command_topic = f"{topic_base}/set"

        print(f"[Engine] Workflow '{workflow.get('name')}' triggered: "
              f"{trigger_device}={current_value} {operator} {threshold}. "
              f"Sending {action_command} to {command_topic}")

        self.mqtt.publish(command_topic, action_command)
        self.storage.update_device_field(action_device, "status", action_command)
        self._last_triggered[wid] = datetime.utcnow()