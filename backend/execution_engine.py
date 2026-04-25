import asyncio
from datetime import datetime, timedelta
import re

class ExecutionEngine:
    def __init__(self, storage, mqtt, check_interval: float = 5.0):
        self.storage = storage
        self.mqtt = mqtt
        self.check_interval = check_interval
        self._last_triggered: dict = {}  # workflow_id -> datetime
        self.cooldown_seconds = 60
        # Chat-trigger queue: set of (workflow_id, secret_code) pairs
        self._chat_triggers: dict = {}   # secret_code -> workflow_id

    async def run(self):
        print("[Engine] Execution engine started.")
        self._rebuild_chat_triggers()
        while True:
            try:
                await self._evaluate_all()
            except Exception as e:
                print(f"[Engine] Error during evaluation: {e}")
            await asyncio.sleep(self.check_interval)

    def _rebuild_chat_triggers(self):
        """Index all chat-triggered workflows by their secret code."""
        self._chat_triggers = {}
        for w in self.storage.get_workflows():
            trigger = w.get("trigger", {})
            if trigger.get("type") == "chat" and trigger.get("code"):
                self._chat_triggers[trigger["code"].strip().lower()] = w["id"]

    def check_chat_trigger(self, message: str) -> list[dict]:
        """Call this from ai_agent when a user message comes in. Returns fired workflows."""
        self._rebuild_chat_triggers()
        fired = []
        msg_lower = message.strip().lower()
        for code, wid in self._chat_triggers.items():
            if code in msg_lower:
                workflows = self.storage.get_workflows()
                for w in workflows:
                    if w.get("id") == wid and w.get("enabled", True):
                        result = self._execute_workflow_actions(w)
                        if result:
                            self.storage.increment_workflow_run(wid)
                            fired.append({"workflow": w["name"], "result": result})
        return fired

    async def _evaluate_all(self):
        workflows = self.storage.get_workflows()
        devices = self.storage.get_all_devices()
        now = datetime.utcnow()

        for workflow in workflows:
            if not workflow.get("enabled", True):
                continue
            try:
                trigger = workflow.get("trigger", {})
                trigger_type = trigger.get("type", "sensor")

                if trigger_type == "sensor":
                    self._evaluate_sensor_trigger(workflow, trigger, devices, now)
                elif trigger_type == "schedule":
                    self._evaluate_schedule_trigger(workflow, trigger, now)
                elif trigger_type == "chat":
                    pass  # handled by check_chat_trigger()
                elif trigger_type == "always":
                    self._execute_workflow_actions(workflow)

            except Exception as e:
                print(f"[Engine] Error evaluating workflow '{workflow.get('name')}': {e}")

    def _evaluate_sensor_trigger(self, workflow, trigger, devices, now):
        device_name = trigger.get("device")
        operator = trigger.get("operator", ">")
        threshold = float(trigger.get("value", 0))

        if not device_name or device_name not in devices:
            return

        raw = devices[device_name].get("status")
        if raw is None or raw == "unknown":
            return

        try:
            current = float(raw)
        except (ValueError, TypeError):
            # String equality check (e.g. status == "ON")
            current = str(raw).strip().upper()
            threshold_str = str(trigger.get("value", "")).strip().upper()
            condition = (operator == "==" and current == threshold_str) or \
                        (operator == "!=" and current != threshold_str)
            if condition:
                self._fire_if_ready(workflow, now)
            return

        ops = {">": current > threshold, "<": current < threshold,
               ">=": current >= threshold, "<=": current <= threshold,
               "==": current == threshold, "!=": current != threshold}
        if ops.get(operator, False):
            self._fire_if_ready(workflow, now)

    def _evaluate_schedule_trigger(self, workflow, trigger, now):
        """Simple schedule: fire at a specific time-of-day (HH:MM) every day."""
        time_str = trigger.get("time", "")  # e.g. "07:30"
        if not time_str:
            return
        try:
            h, m = map(int, time_str.split(":"))
        except Exception:
            return
        # Fire if within the current check window
        target = now.replace(hour=h, minute=m, second=0, microsecond=0)
        diff = abs((now - target).total_seconds())
        if diff <= self.check_interval:
            self._fire_if_ready(workflow, now)

    def _fire_if_ready(self, workflow, now):
        wid = workflow.get("id")
        last = self._last_triggered.get(wid)
        cooldown = workflow.get("cooldown_seconds", self.cooldown_seconds)
        if last and (now - last).total_seconds() < cooldown:
            return
        result = self._execute_workflow_actions(workflow)
        if result:
            self._last_triggered[wid] = now
            self.storage.increment_workflow_run(wid)

    def _execute_workflow_actions(self, workflow: dict) -> list:
        """Execute all actions in a workflow. Returns list of results."""
        actions = workflow.get("actions", [])
        # Backwards compat with old single-action schema
        if not actions and "action" in workflow:
            old = workflow["action"]
            actions = [{"type": "device", "device": old.get("device"), "command": old.get("command")}]

        results = []
        devices = self.storage.get_all_devices()

        for action in actions:
            atype = action.get("type", "device")

            if atype == "device":
                device_name = action.get("device")
                command = action.get("command", "ON")
                if not device_name or device_name not in devices:
                    print(f"[Engine] Action device '{device_name}' not found.")
                    continue
                topic = devices[device_name]["topic_base"] + "/set"
                self.mqtt.publish(topic, command)
                self.storage.update_device_field(device_name, "status", command)
                self.storage.add_log("success", "engine",
                    f"Workflow '{workflow.get('name')}' fired: {device_name} → {command}",
                    {"workflow_id": workflow.get("id"), "device": device_name, "command": command})
                results.append({"device": device_name, "command": command})
                print(f"[Engine] '{workflow.get('name')}': {device_name} → {command}")

            elif atype == "brightness":
                device_name = action.get("device")
                level = action.get("level", 50)
                if not device_name or device_name not in devices:
                    continue
                topic = devices[device_name]["topic_base"] + "/brightness/set"
                self.mqtt.publish(topic, str(level))
                self.storage.update_device_field(device_name, "brightness", level)
                results.append({"device": device_name, "brightness": level})

            elif atype == "log":
                msg = action.get("message", "Workflow fired")
                self.storage.add_log("info", "engine", msg, {"workflow": workflow.get("name")})
                results.append({"log": msg})

        return results
