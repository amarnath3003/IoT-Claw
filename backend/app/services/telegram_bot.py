"""
IoT-Claw Telegram Bot
─────────────────────
Mirrors the web chat interface: users can chat with the iotClaw AI via Telegram.
All tool calls (device control, workflow management, etc.) work identically to the
web frontend.  Per-chat conversation history is maintained in memory.

NEW: /dashboard command — interactive inline-keyboard panel to read sensors and
toggle switches directly from Telegram without opening the web dashboard.

Configuration (backend/.env):
  TELEGRAM_BOT_TOKEN  – token from @BotFather
  TELEGRAM_CHAT_ID    – (optional) whitelist a single chat-id; leave blank to allow all

Usage: the bot is started automatically when the FastAPI server launches.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from collections import defaultdict
from datetime import datetime

import httpx
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("telegram_bot")

TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
ALLOWED_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")   # optional whitelist

_BASE_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

# Per-chat conversation history: {chat_id: [{"role": ..., "content": ...}]}
_histories: dict[int, list[dict]] = defaultdict(list)

# Max messages kept per chat (prevents unbounded memory growth)
_MAX_HISTORY = 30

# Track dashboard message IDs so we can edit them in-place
# {chat_id: message_id}
_dashboard_messages: dict[int, int] = {}


# ── Telegram API helper ────────────────────────────────────────────────────────

async def _tg(client: httpx.AsyncClient, method: str, **kwargs) -> dict:
    """Call a Telegram Bot API method."""
    try:
        r = await client.post(f"{_BASE_URL}/{method}", json=kwargs, timeout=40.0)
        return r.json()
    except Exception as exc:
        log.warning("Telegram API error (%s): %s", method, exc)
        return {}


# ── Text formatting ────────────────────────────────────────────────────────────

def _md_to_html(text: str) -> str:
    """Convert basic markdown to Telegram HTML, escaping unsafe tags."""
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r'```(?:.*?)\n?(.*?)```', r'<pre>\1</pre>', text, flags=re.DOTALL)
    text = re.sub(r'`(.+?)`', r'<code>\1</code>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)
    return text


async def _send(client: httpx.AsyncClient, chat_id: int, text: str) -> None:
    """Send a plain-text message, splitting if >4096 chars (Telegram limit)."""
    MAX_LEN = 4096
    html_text = _md_to_html(text)
    while html_text:
        chunk = html_text[:MAX_LEN]
        if len(html_text) > MAX_LEN:
            split_at = chunk.rfind("\n")
            if split_at > MAX_LEN // 2:
                chunk = chunk[:split_at]
        html_text = html_text[len(chunk):]
        await _tg(client, "sendMessage",
                  chat_id=chat_id,
                  text=chunk,
                  parse_mode="HTML")


# ── Authorization ──────────────────────────────────────────────────────────────

def _is_allowed(chat_id: int) -> bool:
    """Return True if this chat is permitted to use the bot."""
    if not ALLOWED_CHAT_ID:
        return True  # no whitelist → allow everyone
    return str(chat_id) == ALLOWED_CHAT_ID.strip()


# ── Dashboard helpers ──────────────────────────────────────────────────────────

_SENSOR_TYPES = {"sensor", "temperature", "humidity", "pressure", "gas", "motion", "light_sensor"}
_SWITCH_TYPES = {"switch", "dimmable_switch", "relay", "generic", "micropython_edge_agent"}

def _device_emoji(dtype: str, status: str) -> str:
    """Return a relevant emoji based on device type and status."""
    status_up = str(status).upper()
    icons = {
        "switch": ("🟢", "🔴"),
        "dimmable_switch": ("💡", "🌑"),
        "relay": ("⚡", "🔌"),
        "sensor": ("📊", "📊"),
        "security_camera": ("📷", "📷"),
        "micropython_edge_agent": ("🤖", "🤖"),
        "generic": ("🟢", "🔴"),
    }
    on_icon, off_icon = icons.get(dtype, ("🟢", "🔴"))
    if dtype in _SENSOR_TYPES:
        return "📊"
    return on_icon if status_up == "ON" else off_icon


def _build_dashboard_content(devices: dict) -> tuple[str, list]:
    """
    Build the dashboard message text and inline keyboard.
    Returns (html_text, inline_keyboard_rows).
    """
    now = datetime.now().strftime("%H:%M:%S")
    lines = [
        f"<b>🏠 IoT-Claw Dashboard</b>  <i>· {now}</i>",
        "─────────────────────────────",
    ]
    keyboard: list[list[dict]] = []

    if not devices:
        lines.append("\n📭 <i>No devices registered yet.</i>")
        lines.append("\nUse the web dashboard or AI chat to register devices.")
        return "\n".join(lines), keyboard

    # Group by location
    by_location: dict[str, list] = defaultdict(list)
    for name, d in devices.items():
        loc = d.get("location", "") or "Unassigned"
        by_location[loc].append((name, d))

    for loc, devs in sorted(by_location.items()):
        lines.append(f"\n<b>📍 {loc}</b>")
        for name, d in devs:
            status = str(d.get("status", "unknown"))
            dtype  = d.get("type", "generic")
            unit   = d.get("unit", "")
            last_u = d.get("last_updated", "")
            emoji  = _device_emoji(dtype, status)

            # Format the value line
            is_sensor = dtype in _SENSOR_TYPES or unit
            if is_sensor:
                val_str = f"{status} {unit}".strip()
                lines.append(f"  {emoji} <b>{name}</b>: <code>{val_str}</code>")
                if last_u:
                    ts = last_u[:19].replace("T", " ")
                    lines.append(f"      <i>↳ updated {ts}</i>")
                keyboard.append([{
                    "text": f"🔄 Refresh {name}",
                    "callback_data": f"read:{name}"
                }])
            else:
                status_up = status.upper()
                lines.append(f"  {emoji} <b>{name}</b> <i>[{dtype}]</i>: <code>{status_up}</code>")
                # Toggle button — show the action that WILL happen
                if status_up == "ON":
                    btn = {"text": f"⬛ Turn OFF  {name}", "callback_data": f"toggle:{name}:OFF"}
                elif status_up == "OFF":
                    btn = {"text": f"✅ Turn ON  {name}",  "callback_data": f"toggle:{name}:ON"}
                else:
                    btn = {"text": f"🔄 Refresh {name}", "callback_data": f"read:{name}"}
                keyboard.append([btn])

    # Bottom controls row
    keyboard.append([
        {"text": "🔄 Refresh All",   "callback_data": "dashboard:refresh"},
        {"text": "⬛ All OFF",       "callback_data": "dashboard:all_off"},
    ])

    return "\n".join(lines), keyboard


# ── Dashboard command ──────────────────────────────────────────────────────────

async def _handle_dashboard(
    client: httpx.AsyncClient,
    chat_id: int,
    storage,
    engine,
    broadcast_fn,
) -> None:
    """Send (or refresh) the interactive dashboard panel."""
    devices = storage.get_all_devices()
    text, keyboard = _build_dashboard_content(devices)

    result = await _tg(
        client, "sendMessage",
        chat_id=chat_id,
        text=text,
        parse_mode="HTML",
        reply_markup={"inline_keyboard": keyboard},
    )
    # Remember the message ID so callbacks can edit it in-place
    if result.get("ok") and result.get("result"):
        _dashboard_messages[chat_id] = result["result"]["message_id"]


async def _refresh_dashboard(
    client: httpx.AsyncClient,
    chat_id: int,
    message_id: int,
    storage,
) -> None:
    """Edit an existing dashboard message with fresh device state."""
    devices = storage.get_all_devices()
    text, keyboard = _build_dashboard_content(devices)
    await _tg(
        client, "editMessageText",
        chat_id=chat_id,
        message_id=message_id,
        text=text,
        parse_mode="HTML",
        reply_markup={"inline_keyboard": keyboard},
    )


# ── Callback query handler (button taps) ──────────────────────────────────────

async def _handle_callback(
    client: httpx.AsyncClient,
    callback_query: dict,
    storage,
    engine,
    broadcast_fn,
) -> None:
    """Handle inline keyboard button taps from the /dashboard panel."""
    query_id  = callback_query["id"]
    chat_id   = callback_query["message"]["chat"]["id"]
    message_id = callback_query["message"]["message_id"]
    data      = callback_query.get("data", "")

    # Immediately acknowledge the tap — removes Telegram's loading spinner
    await _tg(client, "answerCallbackQuery", callback_query_id=query_id)

    toast: str = ""  # short popup text shown by answerCallbackQuery

    # ── Toggle a switch ────────────────────────────────────────────────────────
    if data.startswith("toggle:"):
        parts = data.split(":", 2)
        if len(parts) == 3:
            _, device_name, action = parts
            if engine:
                result = engine.execute_device_action(device_name, action, source="telegram")
                if result and result.get("error"):
                    toast = f"❌ {result['error']}"
                else:
                    icon = "✅" if action == "ON" else "⬛"
                    toast = f"{icon} {device_name} turned {action}"
                    log.info("[Telegram] Toggled %s → %s", device_name, action)
            if broadcast_fn:
                await broadcast_fn({"type": "state", "data": storage.get_all_devices()})

    # ── Read / refresh a single sensor ────────────────────────────────────────
    elif data.startswith("read:"):
        device_name = data.split(":", 1)[1]
        devices = storage.get_all_devices()
        d = devices.get(device_name)
        if d:
            status = d.get("status", "unknown")
            unit   = d.get("unit", "")
            toast  = f"📊 {device_name}: {status} {unit}".strip()
        else:
            toast = f"❓ Device '{device_name}' not found"

    # ── Refresh entire dashboard ───────────────────────────────────────────────
    elif data == "dashboard:refresh":
        toast = "🔄 Refreshed"

    # ── Turn all switches OFF ──────────────────────────────────────────────────
    elif data == "dashboard:all_off":
        devices = storage.get_all_devices()
        turned_off = []
        for name, d in devices.items():
            dtype = d.get("type", "generic")
            if dtype not in _SENSOR_TYPES and str(d.get("status", "")).upper() == "ON":
                if engine:
                    engine.execute_device_action(name, "OFF", source="telegram")
                    turned_off.append(name)
        if broadcast_fn:
            await broadcast_fn({"type": "state", "data": storage.get_all_devices()})
        toast = f"⬛ Turned off {len(turned_off)} device(s)" if turned_off else "All devices already off"
        log.info("[Telegram] All OFF triggered — %s", turned_off)

    # Send a visible popup acknowledgment (only shown if non-empty)
    if toast:
        await _tg(client, "answerCallbackQuery",
                  callback_query_id=query_id,
                  text=toast,
                  show_alert=False)

    # Always re-render the dashboard with fresh state
    await _refresh_dashboard(client, chat_id, message_id, storage)
    # Update our tracking
    _dashboard_messages[chat_id] = message_id


# ── Standard command handlers ──────────────────────────────────────────────────

async def _handle_start(client: httpx.AsyncClient, chat_id: int) -> None:
    welcome = (
        "🦾 <b>IoT-Claw AI Assistant</b> is online!\n\n"
        "I can control your devices, read sensors, manage workflows — "
        "all through natural language.\n\n"
        "<b>📌 Commands:</b>\n"
        "/dashboard — <b>interactive device panel</b> (toggle switches, read sensors)\n"
        "/status — quick text list of all device states\n"
        "/clear — reset conversation history\n"
        "/help — show this message\n\n"
        "<b>💬 Or just chat:</b>\n"
        "• <code>turn on the light</code>\n"
        "• <code>blink LED 3 times</code>\n"
        "• <code>what workflows do I have?</code>\n"
        "• <code>turn off everything</code>\n"
        "• <code>read the temperature sensor</code>"
    )
    await _tg(client, "sendMessage",
              chat_id=chat_id,
              text=welcome,
              parse_mode="HTML")


async def _handle_clear(client: httpx.AsyncClient, chat_id: int) -> None:
    _histories[chat_id].clear()
    await _send(client, chat_id, "🗑 Conversation history cleared. Fresh start!")


async def _handle_status(client: httpx.AsyncClient, chat_id: int, storage) -> None:
    devices = storage.get_all_devices()
    if not devices:
        await _send(client, chat_id, "No devices registered yet.")
        return
    lines = ["<b>📡 Device Status</b>\n"]
    for name, d in devices.items():
        status = d.get("status", "unknown")
        emoji  = "🟢" if str(status).upper() == "ON" else ("🔴" if str(status).upper() == "OFF" else "🟡")
        dtype  = d.get("type", "generic")
        unit   = d.get("unit", "")
        loc    = d.get("location", "")
        loc_str = f" — <i>{loc}</i>" if loc else ""
        val    = f"{status} {unit}".strip() if unit else status
        lines.append(f"{emoji} <b>{name}</b> <code>[{dtype}]</code>{loc_str}: <code>{val}</code>")
    await _tg(client, "sendMessage",
              chat_id=chat_id,
              text="\n".join(lines),
              parse_mode="HTML")


# ── Main message handler ───────────────────────────────────────────────────────

async def _handle_message(
    client: httpx.AsyncClient,
    chat_id: int,
    text: str,
    run_chat_fn,
    mqtt,
    storage,
    engine,
    broadcast_fn,
) -> None:
    """Process a user message: run through the AI agent, reply with result."""

    # Typing indicator
    await _tg(client, "sendChatAction", chat_id=chat_id, action="typing")

    # Build history slice
    history = [
        {"role": m["role"], "content": m["content"]}
        for m in _histories[chat_id]
    ]

    # Inject Telegram-specific formatting rules
    telegram_history = [
        {"role": "system", "content": (
            "IMPORTANT: You are responding via Telegram. "
            "DO NOT use Markdown tables, # headers, or complex markdown. "
            "Telegram does not support them. "
            "Use simple text, emojis, and plain bullet points (-) for lists."
        )}
    ] + history

    try:
        result = await run_chat_fn(text, telegram_history, mqtt, storage, engine=engine)
        reply: str = result.get("reply") or "Done."
        tool_calls: list = result.get("tool_calls", [])

        if broadcast_fn:
            await broadcast_fn({"type": "state", "data": storage.get_all_devices()})

        # Append to per-chat history
        _histories[chat_id].append({"role": "user",      "content": text})
        _histories[chat_id].append({"role": "assistant",  "content": reply})

        # Trim history
        if len(_histories[chat_id]) > _MAX_HISTORY:
            _histories[chat_id] = _histories[chat_id][-_MAX_HISTORY:]

        # Attach tool-call badges if any tools were called
        if tool_calls:
            tools_str = " · ".join(
                f"<code>{t['tool']}</code>"
                for t in tool_calls
                if isinstance(t, dict) and "tool" in t
            )
            if tools_str:
                reply = f"{reply}\n\n<i>⚙ {tools_str}</i>"

        await _tg(client, "sendMessage",
                  chat_id=chat_id,
                  text=_md_to_html(reply),
                  parse_mode="HTML")

        # If the AI action affected devices, silently refresh any open dashboard
        if tool_calls and chat_id in _dashboard_messages:
            await _refresh_dashboard(
                client, chat_id, _dashboard_messages[chat_id], storage
            )

    except Exception as exc:
        log.exception("Error in AI chat for chat_id=%s", chat_id)
        await _send(client, chat_id, f"❌ An error occurred: {exc}")


# ── Polling loop ───────────────────────────────────────────────────────────────

async def run_bot(run_chat_fn, mqtt, storage, engine, broadcast_fn=None) -> None:
    """
    Long-poll Telegram for updates and dispatch to handlers.
    Designed to run as an asyncio task alongside the FastAPI app.
    """
    if not TELEGRAM_BOT_TOKEN:
        log.warning(
            "TELEGRAM_BOT_TOKEN not set — Telegram bot disabled. "
            "Add it to backend/.env to enable."
        )
        return

    log.info("🤖 Telegram bot starting (polling)…")

    offset = 0
    async with httpx.AsyncClient() as client:
        # Verify token / get bot info
        me = await _tg(client, "getMe")
        if not me.get("ok"):
            log.error(
                "Failed to connect to Telegram API. "
                "Check your TELEGRAM_BOT_TOKEN. Response: %s", me
            )
            return

        bot_name = me["result"].get("username", "iotClaw_bot")
        log.info("✅ Telegram bot connected as @%s", bot_name)

        # Delete any stale webhook so polling works
        await _tg(client, "deleteWebhook", drop_pending_updates=True)

        while True:
            try:
                updates = await _tg(
                    client, "getUpdates",
                    offset=offset,
                    timeout=30,
                    # ← Now also listening for button taps
                    allowed_updates=["message", "callback_query"],
                )
            except Exception as exc:
                log.warning("Polling error: %s — retrying in 5s", exc)
                await asyncio.sleep(5)
                continue

            if not updates.get("ok"):
                await asyncio.sleep(5)
                continue

            for upd in updates.get("result", []):
                offset = upd["update_id"] + 1

                # ── Handle inline keyboard button taps ────────────────────────
                if "callback_query" in upd:
                    cq = upd["callback_query"]
                    cq_chat_id: int = cq["message"]["chat"]["id"]
                    if _is_allowed(cq_chat_id):
                        log.info("[Telegram] Callback from chat=%s data=%r",
                                 cq_chat_id, cq.get("data", ""))
                        asyncio.create_task(
                            _handle_callback(client, cq, storage, engine, broadcast_fn)
                        )
                    else:
                        await _tg(client, "answerCallbackQuery",
                                  callback_query_id=cq["id"],
                                  text="⛔ Unauthorized.")
                    continue

                # ── Handle regular text messages ───────────────────────────────
                msg = upd.get("message")
                if not msg:
                    continue

                chat_id: int = msg["chat"]["id"]
                text: str    = msg.get("text", "").strip()
                if not text:
                    continue  # ignore stickers, photos, etc.

                # Authorization check
                if not _is_allowed(chat_id):
                    await _send(client, chat_id, "⛔ Unauthorized. This bot is private.")
                    continue

                log.info("[Telegram] chat=%s text=%r", chat_id, text[:80])

                # Route commands
                if text.startswith("/start") or text.startswith("/help"):
                    await _handle_start(client, chat_id)

                elif text.startswith("/clear"):
                    await _handle_clear(client, chat_id)

                elif text.startswith("/status"):
                    await _handle_status(client, chat_id, storage)

                elif text.startswith("/dashboard"):
                    # /dashboard is handled synchronously so the message_id
                    # is saved before any callbacks can arrive
                    await _handle_dashboard(client, chat_id, storage, engine, broadcast_fn)

                else:
                    # Regular chat — pass to AI agent
                    asyncio.create_task(
                        _handle_message(
                            client, chat_id, text,
                            run_chat_fn, mqtt, storage, engine, broadcast_fn,
                        )
                    )

            # Small sleep to avoid hammering the API when there are no updates
            await asyncio.sleep(0.2)
