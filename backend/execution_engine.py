import asyncio
from datetime import datetime


class ExecutionEngine:
    def __init__(self, storage, mqtt, check_interval: float = 5.0, camera_service=None):
        self.storage = storage
        self.mqtt = mqtt
        self.check_interval = check_interval
        self.camera_service = camera_service
        self._last_triggered: dict = {}
        self.cooldown_seconds = 60
        self._chat_triggers: dict = {}

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
        for workflow in self.storage.get_workflows():
            trigger = workflow.get("trigger", {})
            if trigger.get("type") == "chat" and trigger.get("code"):
                self._chat_triggers[trigger["code"].strip().lower()] = workflow["id"]

    def check_chat_trigger(self, message: str) -> list[dict]:
        """Call this from ai_agent when a user message comes in. Returns fired workflows."""
        self._rebuild_chat_triggers()
        fired = []
        msg_lower = message.strip().lower()
        for code, workflow_id in self._chat_triggers.items():
            if code in msg_lower:
                for workflow in self.storage.get_workflows():
                    if workflow.get("id") == workflow_id and workflow.get("enabled", True):
                        result = self._execute_workflow_actions(workflow)
                        if result:
                            self.storage.increment_workflow_run(workflow_id)
                            fired.append({"workflow": workflow["name"], "result": result})
        return fired

    async def _evaluate_all(self):
        workflows = self.storage.get_workflows()
        devices = self.storage.get_all_devices()
        now = datetime.now()

        self._check_heartbeats(devices, now)

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
                    pass
                elif trigger_type == "always":
                    self._execute_workflow_actions(workflow)
            except Exception as e:
                print(f"[Engine] Error evaluating workflow '{workflow.get('name')}': {e}")

    def _check_heartbeats(self, devices: dict, now: datetime):
        """Mark devices offline if no heartbeat received within 90 seconds."""
        workflows = self.storage.get_workflows()
        for name, data in devices.items():
            hb = data.get("last_heartbeat")
            if not hb:
                continue
            try:
                last = datetime.fromisoformat(hb)
                elapsed = (now - last).total_seconds()
                current_status = str(data.get("status", "")).lower()
                if elapsed > 90 and current_status != "offline":
                    self.storage.update_device_field(name, "status", "offline")
                    self.storage.add_log(
                        "warning", "engine",
                        f"Device '{name}' went offline (no heartbeat for >90s)",
                        {"device": name}
                    )
                    print(f"[Engine] {name} marked offline — heartbeat timeout")
                    self._fire_device_event_workflows(workflows, name, "offline", now)
                elif elapsed <= 90 and current_status == "offline":
                    # Device came back online
                    self.storage.update_device_field(name, "status", "online")
                    self.storage.add_log(
                        "success", "engine",
                        f"Device '{name}' came back online (heartbeat resumed)",
                        {"device": name}
                    )
                    self._fire_device_event_workflows(workflows, name, "online", now)
            except Exception:
                pass

    def _fire_device_event_workflows(self, workflows: list, device_name: str, event: str, now: datetime):
        """Fire all enabled device_event workflows that match device + event."""
        for workflow in workflows:
            if not workflow.get("enabled", True):
                continue
            trigger = workflow.get("trigger", {})
            if trigger.get("type") != "device_event":
                continue
            if trigger.get("event") != event:
                continue
            target = trigger.get("device", "")
            if target and target != device_name:
                continue
            self._fire_if_ready(workflow, now)

    def _evaluate_sensor_trigger(self, workflow, trigger, devices, now):
        device_name = trigger.get("device")
        operator = trigger.get("operator", ">")

        if not device_name or device_name not in devices:
            return

        raw = devices[device_name].get("status")
        if raw is None or raw == "unknown":
            return

        try:
            current = float(raw)
            threshold = float(trigger.get("value", 0))
        except (ValueError, TypeError):
            current = str(raw).strip().upper()
            threshold_str = str(trigger.get("value", "")).strip().upper()
            condition = (operator == "==" and current == threshold_str) or (
                operator == "!=" and current != threshold_str
            )
            if condition:
                self._fire_if_ready(workflow, now)
            return

        ops = {
            ">": current > threshold,
            "<": current < threshold,
            ">=": current >= threshold,
            "<=": current <= threshold,
            "==": current == threshold,
            "!=": current != threshold,
        }
        if ops.get(operator, False):
            self._fire_if_ready(workflow, now)

    def _evaluate_schedule_trigger(self, workflow, trigger, now):
        """Simple schedule: fire at a specific time-of-day (HH:MM) every day."""
        time_str = trigger.get("time", "")
        if not time_str:
            return
        try:
            hour, minute = map(int, time_str.split(":"))
        except Exception:
            return

        target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        diff = abs((now - target).total_seconds())
        if diff <= self.check_interval:
            self._fire_if_ready(workflow, now)

    def _fire_if_ready(self, workflow, now):
        workflow_id = workflow.get("id")
        last = self._last_triggered.get(workflow_id)
        cooldown = workflow.get("cooldown_seconds", self.cooldown_seconds)
        if last and (now - last).total_seconds() < cooldown:
            return
        result = self._execute_workflow_actions(workflow)
        if result:
            self._last_triggered[workflow_id] = now
            self.storage.increment_workflow_run(workflow_id)

    def _execute_workflow_actions(self, workflow: dict) -> list:
        """Execute all actions in a workflow. Returns list of results."""
        actions = workflow.get("actions", [])
        if not actions and "action" in workflow:
            old = workflow["action"]
            actions = [{"type": "device", "device": old.get("device"), "command": old.get("command")}]

        results = []
        devices = self.storage.get_all_devices()

        for action in actions:
            action_type = action.get("type", "device")

            if action_type == "device":
                result = self.execute_device_action(
                    action.get("device"),
                    action.get("command", "ON"),
                    source="engine",
                    workflow=workflow,
                )
                if result:
                    results.append(result)

            elif action_type == "brightness":
                device_name = action.get("device")
                level = action.get("level", 50)
                if not device_name or device_name not in devices:
                    continue
                topic = devices[device_name]["topic_base"] + "/brightness/set"
                self.mqtt.publish(topic, str(level))
                self.storage.update_device_field(device_name, "brightness", level)
                results.append({"device": device_name, "brightness": level})

            elif action_type == "camera_monitor":
                result = self.execute_device_action(
                    action.get("device") or self._default_camera_device(),
                    action.get("command", "ON"),
                    source="engine",
                    workflow=workflow,
                )
                if result:
                    result["action_type"] = "camera_monitor"
                    results.append(result)

            elif action_type == "log":
                msg = action.get("message", "Workflow fired")
                self.storage.add_log("info", "engine", msg, {"workflow": workflow.get("name")})
                results.append({"log": msg})

        return results

    def execute_device_action(self, device_name: str, command: str, source: str = "engine", workflow: dict = None) -> dict:
        devices = self.storage.get_all_devices()
        command = str(command or "").upper()
        if not device_name or device_name not in devices:
            print(f"[Engine] Action device '{device_name}' not found.")
            return {}

        device = devices[device_name]
        workflow_name = workflow.get("name") if workflow else None
        workflow_id = workflow.get("id") if workflow else None

        if device.get("type") == "security_camera":
            if command not in {"ON", "OFF"}:
                return {"error": "Security camera command must be ON or OFF", "device": device_name}
            if not self.camera_service:
                self.storage.add_log("error", source, "Security camera service is not available", {"device": device_name})
                return {"error": "Security camera service is not available", "device": device_name}

            result = self.camera_service.start() if command == "ON" else self.camera_service.stop()
            self.storage.update_device_field(device_name, "status", command)
            self.storage.add_log(
                "success",
                source,
                self._action_message(source, workflow_name, device_name, command),
                {"workflow_id": workflow_id, "device": device_name, "command": command, "result": result},
            )
            return {"device": device_name, "command": command, "result": result}

        topic = device["topic_base"] + "/set"
        success = self.mqtt.publish(topic, command)
        if success:
            self.storage.update_device_field(device_name, "status", command)
        self.storage.add_log(
            "success" if success else "error",
            source,
            self._action_message(source, workflow_name, device_name, command),
            {"workflow_id": workflow_id, "device": device_name, "command": command, "topic": topic},
        )
        print(f"[Engine] {device_name} -> {command}")
        return {"device": device_name, "command": command, "success": success}

    def _default_camera_device(self) -> str:
        devices = self.storage.get_all_devices()
        for name, device in devices.items():
            if device.get("type") == "security_camera":
                return name
        return "laptop_security_camera"

    def _action_message(self, source: str, workflow_name: str, device_name: str, command: str) -> str:
        if workflow_name:
            return f"Workflow '{workflow_name}' fired: {device_name} -> {command}"
        if source == "ai":
            return f"AI turned {command} -> {device_name}"
        if source == "api":
            return f"User turned {command} -> {device_name}"
        return f"{device_name} -> {command}"
