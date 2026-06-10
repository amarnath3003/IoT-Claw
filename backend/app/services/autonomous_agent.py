"""
IoT-Claw Autonomous Agent
─────────────────────────
A self-thinking, always-on AI loop that continuously monitors your home,
reasons about what it observes, and proactively acts — with or without
human intervention. This is the "Claw" in IoT-Claw.

Architecture:
  - Runs as an asyncio background task alongside FastAPI
  - Wakes on a configurable interval (default: 60s)
  - Gathers full system context: devices, sensors, workflows, recent logs
  - Calls OpenAI with a rich reasoning prompt (ReAct-style)
  - Parses structured decisions: OBSERVE → THINK → ACT → REFLECT
  - Executes approved actions via the existing engine
  - Persists its memory/reasoning history to SQLite
  - Broadcasts decisions to the frontend via WebSocket

Configuration (backend/.env):
  AUTONOMOUS_AGENT_ENABLED=true
  AUTONOMOUS_AGENT_INTERVAL=60          # seconds between reasoning cycles
  AUTONOMOUS_AGENT_MAX_ACTIONS=3        # max actions per cycle (safety)
  AUTONOMOUS_AGENT_AGGRESSION=medium    # low | medium | high
"""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta
from typing import Optional

from dotenv import load_dotenv

load_dotenv(override=True)

_ENABLED = os.getenv("AUTONOMOUS_AGENT_ENABLED", "true").lower() == "true"
_INTERVAL = int(os.getenv("AUTONOMOUS_AGENT_INTERVAL", "60"))
_MAX_ACTIONS = int(os.getenv("AUTONOMOUS_AGENT_MAX_ACTIONS", "3"))
_AGGRESSION = os.getenv("AUTONOMOUS_AGENT_AGGRESSION", "medium")
_MODEL = os.getenv("LLM_MODEL", os.getenv("OPENAI_MODEL", "openai/gpt-4o-mini"))
_API_BASE = os.getenv("LLM_API_BASE")
_IS_LOCAL = _MODEL.startswith("ollama/") or bool(_API_BASE)

_openai_key = os.getenv("OPENAI_API_KEY", "")
_anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
_gemini_key = os.getenv("GEMINI_API_KEY", "")

# Disable if not local and no valid API keys are found
if not _IS_LOCAL and not any(k and not k.startswith("sk-proj-REPLACE") for k in [_openai_key, _anthropic_key, _gemini_key]):
    _IS_CONFIGURED = False
else:
    _IS_CONFIGURED = True


AGGRESSION_PROFILES = {
    "low": {
        "description": "conservative — only act on obvious safety/energy issues",
        "threshold": "only act when clearly necessary (sensor threshold exceeded, device left on > 2hrs)",
        "max_actions": 1,
    },
    "medium": {
        "description": "balanced — act on patterns, energy waste, comfort improvements",
        "threshold": "act when beneficial and reasonably certain (confidence > 70%)",
        "max_actions": 3,
    },
    "high": {
        "description": "proactive — learn patterns, anticipate needs, optimize continuously",
        "threshold": "act whenever there's a plausible improvement (confidence > 40%)",
        "max_actions": 5,
    },
}

SYSTEM_PROMPT = """You are the Autonomous Claw — the self-governing intelligence of an IoT smart home system.

Your job is NOT to answer questions. Your job is to OBSERVE → THINK → DECIDE → ACT autonomously.

You have complete access to the home's state. You must reason like a vigilant, thoughtful caretaker who:
- Notices patterns (a sensor has been high for 30 minutes)
- Catches waste (a device left on unnecessarily)
- Anticipates needs (it's nearly 11pm, lights might need dimming)
- Prevents problems (temperature creeping dangerously high)
- Learns routines (this fan turns on every morning at 7am)

═══ REASONING PROTOCOL ═══
You MUST respond with exactly this JSON structure:

{
  "observe": "What you notice about the current state — factual, specific",
  "think": "Your reasoning chain — what patterns, risks, or opportunities do you see",
  "confidence": 0-100,
  "actions": [
    {
      "type": "device_control" | "create_workflow" | "send_alert" | "nothing",
      "reason": "why this specific action",
      "device": "device_name (if applicable)",
      "command": "ON" | "OFF" (if device_control),
      "workflow": { ... } (if create_workflow),
      "message": "alert text (if send_alert)"
    }
  ],
  "reflect": "What you learned, what to watch for next cycle",
  "mood": "vigilant" | "calm" | "concerned" | "optimizing" | "learning"
}

═══ ACTION RULES ═══
- Maximum {max_actions} actions per cycle
- Aggression level: {aggression} — {threshold}
- If confidence < 40%: type = "nothing", explain why in reflect
- NEVER turn off a device that was manually turned on in the last 10 minutes
- ALWAYS prefer creating a workflow over repeated one-off actions
- If you see the same issue 3+ times: create a workflow to automate the fix

═══ CONTEXT AWARENESS ═══
- Time of day matters: bedroom lights at 2am = likely forgotten
- Temperature > 35°C = urgent cooling needed
- Device ON for > 2 hours with no sensor justification = possible waste
- Motion sensor active + lights off = turn on lights
- Multiple devices ON at night = run check

═══ MEMORY ═══
You receive your last {memory_depth} decisions. Use them to:
- Avoid repeating the same action (if you just turned something off, don't do it again)
- Detect persistent problems (same issue = needs a workflow)
- Track your effectiveness

Respond with ONLY the JSON object. No prose, no markdown, no code fences."""


def _get_db_connection():
    from app.core.db import get_connection
    return get_connection()


def _init_autonomous_tables():
    """Create the autonomous agent's memory tables if they don't exist."""
    conn = _get_db_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS autonomous_cycles (
            id TEXT PRIMARY KEY,
            ts DATETIME,
            observe TEXT,
            think TEXT,
            confidence INTEGER,
            actions_json TEXT,
            reflect TEXT,
            mood TEXT,
            actions_executed INTEGER DEFAULT 0,
            cycle_duration_ms INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_autonomous_cycles_ts
        ON autonomous_cycles(ts DESC)
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS autonomous_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME
        )
    """)
    # Default settings
    defaults = [
        ("enabled", str(_ENABLED).lower()),
        ("interval", str(_INTERVAL)),
        ("aggression", _AGGRESSION),
        ("max_actions", str(_MAX_ACTIONS)),
        ("paused_until", ""),
    ]
    for k, v in defaults:
        conn.execute(
            "INSERT OR IGNORE INTO autonomous_settings (key, value, updated_at) VALUES (?, ?, ?)",
            (k, v, datetime.now().isoformat())
        )
    conn.commit()
    conn.close()


def _get_setting(key: str, default: str = "") -> str:
    try:
        conn = _get_db_connection()
        row = conn.execute(
            "SELECT value FROM autonomous_settings WHERE key = ?", (key,)
        ).fetchone()
        conn.close()
        return row["value"] if row else default
    except Exception:
        return default


def _set_setting(key: str, value: str):
    try:
        conn = _get_db_connection()
        conn.execute(
            """INSERT OR REPLACE INTO autonomous_settings (key, value, updated_at)
               VALUES (?, ?, ?)""",
            (key, value, datetime.now().isoformat())
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


def _save_cycle(cycle: dict) -> str:
    cycle_id = str(uuid.uuid4())[:8]
    try:
        conn = _get_db_connection()
        conn.execute(
            """INSERT INTO autonomous_cycles
               (id, ts, observe, think, confidence, actions_json, reflect, mood,
                actions_executed, cycle_duration_ms)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                cycle_id,
                datetime.now().isoformat(),
                cycle.get("observe", ""),
                cycle.get("think", ""),
                cycle.get("confidence", 0),
                json.dumps(cycle.get("actions", [])),
                cycle.get("reflect", ""),
                cycle.get("mood", "calm"),
                cycle.get("actions_executed", 0),
                cycle.get("cycle_duration_ms", 0),
            )
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Autonomous] Failed to save cycle: {e}")
    return cycle_id


def get_recent_cycles(limit: int = 20) -> list:
    try:
        conn = _get_db_connection()
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM autonomous_cycles ORDER BY ts DESC LIMIT ?", (limit,)
        ).fetchall()
        conn.close()
        result = []
        for row in rows:
            d = dict(row)
            try:
                d["actions"] = json.loads(d.get("actions_json", "[]"))
            except Exception:
                d["actions"] = []
            result.append(d)
        return result
    except Exception:
        return []


def get_all_settings() -> dict:
    try:
        conn = _get_db_connection()
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT key, value FROM autonomous_settings").fetchall()
        conn.close()
        return {r["key"]: r["value"] for r in rows}
    except Exception:
        return {}


def update_settings(updates: dict):
    for k, v in updates.items():
        _set_setting(k, str(v))


class AutonomousAgent:
    def __init__(self, storage, mqtt, engine, ws_broadcast_fn=None):
        self.storage = storage
        self.mqtt = mqtt
        self.engine = engine
        self.ws_broadcast_fn = ws_broadcast_fn
        self._loop = None
        self._running = False
        self._last_cycle_ts: Optional[datetime] = None
        self._current_cycle: Optional[dict] = None
        self._cycle_count = 0
        self._device_on_times: dict[str, datetime] = {}  # track when devices turned on

        try:
            _init_autonomous_tables()
        except Exception as e:
            print(f"[Autonomous] Table init warning: {e}")

    def bind_loop(self, loop):
        self._loop = loop

    def _is_enabled(self) -> bool:
        if not _ENABLED:
            return False
        enabled = _get_setting("enabled", "true")
        if enabled.lower() != "true":
            return False
        paused_until = _get_setting("paused_until", "")
        if paused_until:
            try:
                until = datetime.fromisoformat(paused_until)
                if datetime.now() < until:
                    return False
            except Exception:
                pass
        return True

    def _get_interval(self) -> int:
        try:
            return int(_get_setting("interval", str(_INTERVAL)))
        except Exception:
            return _INTERVAL

    def _get_aggression(self) -> str:
        return _get_setting("aggression", _AGGRESSION)

    def _get_max_actions(self) -> int:
        try:
            return int(_get_setting("max_actions", str(_MAX_ACTIONS)))
        except Exception:
            return _MAX_ACTIONS

    def _build_context(self) -> str:
        """Build a rich context string for the AI to reason about."""
        now = datetime.now()
        devices = self.storage.get_all_devices()
        logs = self.storage.get_logs(limit=30)
        workflows = self.storage.get_workflows()
        recent_cycles = get_recent_cycles(limit=5)

        # Device status summary
        device_lines = []
        for name, d in devices.items():
            status = d.get("status", "unknown")
            dtype = d.get("type", "generic")
            location = d.get("location", "")
            unit = d.get("unit", "")
            last_updated = d.get("last_updated", "")
            is_offline = str(status).upper() == "OFFLINE"

            # Track how long device has been ON
            on_duration = ""
            if str(status).upper() == "ON":
                if name not in self._device_on_times:
                    self._device_on_times[name] = now
                else:
                    minutes_on = (now - self._device_on_times[name]).total_seconds() / 60
                    on_duration = f" [ON for {int(minutes_on)} minutes]"
            else:
                self._device_on_times.pop(name, None)

            val = f"{status} {unit}".strip()
            loc_str = f" @ {location}" if location else ""
            offline_str = " [OFFLINE — no heartbeat]" if is_offline else ""

            device_lines.append(
                f"  {name} ({dtype}{loc_str}): {val}{on_duration}{offline_str}"
            )

        devices_block = "\n".join(device_lines) if device_lines else "  (no devices registered)"

        # Recent activity (last 10 meaningful logs)
        meaningful_logs = [
            l for l in logs[:10]
            if l.get("level") in ("warning", "error", "success")
        ]
        log_lines = [
            f"  [{l.get('level','?').upper()}] {l.get('message','')}"
            for l in meaningful_logs[:8]
        ]
        logs_block = "\n".join(log_lines) if log_lines else "  (no recent alerts)"

        # Active workflows
        active_wf = [w for w in workflows if w.get("enabled")]
        wf_lines = [
            f"  '{w.get('name')}' — trigger: {w.get('trigger', {}).get('type')}"
            for w in active_wf[:5]
        ]
        wf_block = "\n".join(wf_lines) if wf_lines else "  (none)"

        # Memory: last 3 cycles
        memory_lines = []
        for c in recent_cycles[:3]:
            ts = c.get("ts", "")[:16]
            mood = c.get("mood", "?")
            actions_exec = c.get("actions_executed", 0)
            reflect = c.get("reflect", "")[:120]
            memory_lines.append(
                f"  [{ts}] mood={mood} actions={actions_exec}: {reflect}"
            )
        memory_block = "\n".join(memory_lines) if memory_lines else "  (first cycle — no history)"

        aggression = self._get_aggression()
        profile = AGGRESSION_PROFILES.get(aggression, AGGRESSION_PROFILES["medium"])

        return f"""=== HOME STATE @ {now.strftime('%Y-%m-%d %H:%M:%S')} ===

DEVICES ({len(devices)} registered):
{devices_block}

RECENT ALERTS & ACTIVITY:
{logs_block}

ACTIVE AUTOMATIONS ({len(active_wf)} workflows):
{wf_block}

YOUR RECENT MEMORY (last 3 decisions):
{memory_block}

AGENT PROFILE:
  aggression: {aggression} — {profile['description']}
  threshold: {profile['threshold']}
  max_actions_this_cycle: {self._get_max_actions()}
  cycles_completed: {self._cycle_count}
"""

    async def _call_llm(self, context: str) -> Optional[dict]:
        """Call LLM and parse the structured response."""
        if not _IS_CONFIGURED:
            return None

        aggression = self._get_aggression()
        profile = AGGRESSION_PROFILES.get(aggression, AGGRESSION_PROFILES["medium"])

        system = SYSTEM_PROMPT.format(
            max_actions=self._get_max_actions(),
            aggression=aggression,
            threshold=profile["threshold"],
            memory_depth=3,
        )

        try:
            from litellm import acompletion
            import litellm
            litellm.drop_params = True
            
            kwargs = {
                "model": _MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": context},
                ],
                "max_tokens": 800,
                "temperature": 0.3,  # Lower = more consistent, less creative
                "response_format": {"type": "json_object"},
            }
            if _API_BASE:
                kwargs["api_base"] = _API_BASE

            response = await acompletion(**kwargs)

            raw = response.choices[0].message.content
            return json.loads(raw)

        except json.JSONDecodeError as e:
            print(f"[Autonomous] LLM returned invalid JSON: {e}")
            return None
        except Exception as e:
            print(f"[Autonomous] LLM call failed: {type(e).__name__}: {e}")
            return None

    def _execute_action(self, action: dict) -> dict:
        """Execute a single autonomous action and return a result dict."""
        action_type = action.get("type", "nothing")

        if action_type == "nothing":
            return {"executed": False, "reason": "no_action_needed"}

        if action_type == "device_control":
            device = action.get("device", "")
            command = str(action.get("command", "ON")).upper()
            if command not in ("ON", "OFF"):
                return {"executed": False, "reason": "invalid_command"}

            # Safety: don't override a device that was recently manually controlled
            devices = self.storage.get_all_devices()
            if device not in devices:
                return {"executed": False, "reason": f"device_not_found: {device}"}

            result = self.engine.execute_device_action(
                device, command, source="autonomous"
            )
            if result:
                self.storage.add_log(
                    "success", "autonomous",
                    f"[AUTO] {device} → {command}: {action.get('reason', '')}",
                    {"device": device, "command": command, "autonomous": True}
                )
                return {"executed": True, "device": device, "command": command}
            return {"executed": False, "reason": "execution_failed"}

        if action_type == "create_workflow":
            wf_data = action.get("workflow", {})
            if not wf_data or not wf_data.get("name"):
                return {"executed": False, "reason": "invalid_workflow_data"}
            try:
                saved = self.storage.save_workflow(wf_data)
                self.engine._rebuild_chat_triggers()
                self.storage.add_log(
                    "success", "autonomous",
                    f"[AUTO] Created workflow: {wf_data['name']}: {action.get('reason', '')}",
                    {"workflow_id": saved["id"], "autonomous": True}
                )
                return {"executed": True, "workflow": wf_data["name"]}
            except Exception as e:
                return {"executed": False, "reason": str(e)}

        if action_type == "send_alert":
            msg = action.get("message", "Autonomous agent alert")
            self.storage.add_log(
                "warning", "autonomous",
                f"[AUTO ALERT] {msg}",
                {"autonomous": True, "alert": True}
            )
            # Also send via Telegram if configured
            try:
                from app.services.telegram_notify import notify
                notify("🤖 IoT-Claw Alert", msg)
            except Exception:
                pass
            return {"executed": True, "alert": msg}

        return {"executed": False, "reason": f"unknown_action_type: {action_type}"}

    async def _broadcast_cycle(self, cycle: dict):
        """Push the cycle result to all connected WebSocket clients."""
        if self.ws_broadcast_fn and self._loop and self._loop.is_running():
            try:
                await self.ws_broadcast_fn({
                    "type": "autonomous_cycle",
                    "cycle": cycle,
                })
            except Exception:
                pass

    async def run_cycle(self) -> Optional[dict]:
        """Run one full reasoning cycle. Returns the cycle dict."""
        if not self._is_enabled():
            return None

        start = datetime.now()
        self._cycle_count += 1
        print(f"[Autonomous] === Cycle #{self._cycle_count} starting ===")

        context = self._build_context()
        decision = await self._call_llm(context)

        if not decision:
            print("[Autonomous] No decision from LLM (disabled or error)")
            # Still record a no-op cycle so the UI shows the agent is alive
            cycle = {
                "observe": "Unable to reason (AI key not configured or API error)",
                "think": "",
                "confidence": 0,
                "actions": [],
                "reflect": "Waiting for valid AI configuration",
                "mood": "calm",
                "actions_executed": 0,
                "cycle_duration_ms": int((datetime.now() - start).total_seconds() * 1000),
            }
            cycle_id = _save_cycle(cycle)
            cycle["id"] = cycle_id
            cycle["ts"] = datetime.now().isoformat()
            await self._broadcast_cycle(cycle)
            return cycle

        # Clamp actions to the safety limit
        max_a = self._get_max_actions()
        actions = (decision.get("actions") or [])[:max_a]

        # Execute each action
        executed_count = 0
        action_results = []
        for action in actions:
            if action.get("type") == "nothing":
                action_results.append({**action, "_result": {"executed": False}})
                continue
            result = self._execute_action(action)
            action_results.append({**action, "_result": result})
            if result.get("executed"):
                executed_count += 1

        duration_ms = int((datetime.now() - start).total_seconds() * 1000)

        cycle = {
            "observe": decision.get("observe", ""),
            "think": decision.get("think", ""),
            "confidence": int(decision.get("confidence", 0)),
            "actions": action_results,
            "reflect": decision.get("reflect", ""),
            "mood": decision.get("mood", "calm"),
            "actions_executed": executed_count,
            "cycle_duration_ms": duration_ms,
        }

        cycle_id = _save_cycle(cycle)
        cycle["id"] = cycle_id
        cycle["ts"] = datetime.now().isoformat()

        self._last_cycle_ts = datetime.now()
        self._current_cycle = cycle

        print(
            f"[Autonomous] Cycle #{self._cycle_count} done in {duration_ms}ms "
            f"| mood={cycle['mood']} | confidence={cycle['confidence']}% "
            f"| actions={executed_count}/{len(actions)}",
            end="\n",
            flush=True
        )

        # Broadcast to WebSocket clients
        await self._broadcast_cycle(cycle)

        # Also broadcast updated device state after any actions
        if executed_count > 0:
            if self.ws_broadcast_fn:
                await self.ws_broadcast_fn({
                    "type": "state",
                    "data": self.storage.get_all_devices(),
                })

        return cycle

    async def run(self):
        """Main async loop. Runs until the server shuts down."""
        try:
            print(f"[Autonomous] Agent starting. interval={self._get_interval()}s")
        except Exception:
            print("[Autonomous] Agent starting")
        await asyncio.sleep(15)  # Warm-up: let the system settle after startup

        while True:
            try:
                interval = self._get_interval()
                await self.run_cycle()
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                print("[Autonomous] Agent task cancelled")
                break
            except Exception as e:
                print(f"[Autonomous] Unexpected error in run loop: {e}")
                await asyncio.sleep(30)  # Back off on error

    def get_status(self) -> dict:
        """Return current agent status for the API."""
        settings = get_all_settings()
        last_cycle = get_recent_cycles(limit=1)
        return {
            "enabled": self._is_enabled(),
            "settings": settings,
            "cycle_count": self._cycle_count,
            "last_cycle_ts": self._last_cycle_ts.isoformat() if self._last_cycle_ts else None,
            "last_cycle": last_cycle[0] if last_cycle else None,
            "interval": self._get_interval(),
            "aggression": self._get_aggression(),
        }