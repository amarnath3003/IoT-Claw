"""
IoT-Claw Telegram Bot
─────────────────────
Mirrors the web chat interface: users can chat with the iotClaw AI via Telegram.
All tool calls (device control, workflow management, etc.) work identically to the
web frontend.  Per-chat conversation history is maintained in memory.

Configuration (backend/.env):
  TELEGRAM_BOT_TOKEN  – token from @BotFather
  TELEGRAM_CHAT_ID    – (optional) whitelist a single chat-id; leave blank to allow all

Usage: the bot is started automatically when the FastAPI server launches.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections import defaultdict

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


# ── Telegram helpers ──────────────────────────────────────────────────────────

async def _tg(client: httpx.AsyncClient, method: str, **kwargs) -> dict:
    """Call a Telegram Bot API method."""
    try:
        r = await client.post(f"{_BASE_URL}/{method}", json=kwargs, timeout=40.0)
        return r.json()
    except Exception as exc:
        log.warning("Telegram API error (%s): %s", method, exc)
        return {}


import re

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
    # Telegram max message length
    MAX_LEN = 4096
    
    html_text = _md_to_html(text)
    
    # Split on newline boundaries to keep formatting readable
    while html_text:
        chunk = html_text[:MAX_LEN]
        # Try to split at a newline so we don't cut mid-sentence
        if len(html_text) > MAX_LEN:
            split_at = chunk.rfind("\n")
            if split_at > MAX_LEN // 2:
                chunk = chunk[:split_at]
        html_text = html_text[len(chunk):]
        await _tg(client, "sendMessage",
                  chat_id=chat_id,
                  text=chunk,
                  parse_mode="HTML")


# ── Authorization ─────────────────────────────────────────────────────────────

def _is_allowed(chat_id: int) -> bool:
    """Return True if this chat is permitted to use the bot."""
    if not ALLOWED_CHAT_ID:
        return True  # no whitelist → allow everyone
    return str(chat_id) == ALLOWED_CHAT_ID.strip()


# ── Command handlers ───────────────────────────────────────────────────────────

async def _handle_start(client: httpx.AsyncClient, chat_id: int) -> None:
    welcome = (
        "🦾 *IoT-Claw AI Assistant* is online!\n\n"
        "I can control your devices, read sensors, manage workflows — "
        "all through natural language.\n\n"
        "*Quick commands you can try:*\n"
        "• `list my devices`\n"
        "• `turn on the light`\n"
        "• `blink LED 3 times`\n"
        "• `what workflows do I have?`\n"
        "• `turn off everything`\n\n"
        "/help – show this message\n"
        "/clear – reset conversation history\n"
        "/status – list all device states"
    )
    await _send(client, chat_id, welcome)


async def _handle_clear(client: httpx.AsyncClient, chat_id: int) -> None:
    _histories[chat_id].clear()
    await _send(client, chat_id, "🗑 Conversation history cleared. Fresh start!")


async def _handle_status(client: httpx.AsyncClient, chat_id: int, storage) -> None:
    devices = storage.get_all_devices()
    if not devices:
        await _send(client, chat_id, "No devices registered yet.")
        return
    lines = ["*📡 Device Status*\n"]
    for name, d in devices.items():
        status = d.get("status", "unknown")
        emoji = "🟢" if str(status).upper() == "ON" else ("🔴" if str(status).upper() == "OFF" else "🟡")
        dtype = d.get("type", "generic")
        loc = d.get("location", "")
        location_str = f" — _{loc}_" if loc else ""
        lines.append(f"{emoji} *{name}* `[{dtype}]`{location_str}: `{status}`")
    await _send(client, chat_id, "\n".join(lines))


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

    # Build history slice (strip system greetings, keep role/content only)
    history = [
        {"role": m["role"], "content": m["content"]}
        for m in _histories[chat_id]
    ]
    
    # Inject Telegram-specific formatting rules
    telegram_history = [
        {"role": "system", "content": "IMPORTANT: You are responding via Telegram. DO NOT use Markdown tables, # headers, or complex markdown. Telegram does not support them. Use simple text, emojis, and plain bullet points (-) for lists."}
    ] + history

    try:
        result = await run_chat_fn(text, telegram_history, mqtt, storage, engine=engine)
        reply: str = result.get("reply") or "Done."
        tool_calls: list = result.get("tool_calls", [])

        if broadcast_fn:
            await broadcast_fn({"type": "state", "data": storage.get_all_devices()})

        # Append to per-chat history
        _histories[chat_id].append({"role": "user", "content": text})
        _histories[chat_id].append({"role": "assistant", "content": reply})

        # Trim history
        if len(_histories[chat_id]) > _MAX_HISTORY:
            _histories[chat_id] = _histories[chat_id][-_MAX_HISTORY:]

        # Attach tool-call badges to the reply if any tools were called
        if tool_calls:
            tools_str = " · ".join(f"<code>{t['tool']}</code>" for t in tool_calls if isinstance(t, dict) and "tool" in t)
            if tools_str:
                reply = f"{reply}\n\n<i>⚙ {tools_str}</i>"

        await _send(client, chat_id, reply)

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
                    allowed_updates=["message"],
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
                msg = upd.get("message")
                if not msg:
                    continue

                chat_id: int = msg["chat"]["id"]
                text: str = msg.get("text", "").strip()
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
                else:
                    # Regular chat — pass to AI agent
                    asyncio.create_task(
                        _handle_message(
                            client, chat_id, text,
                            run_chat_fn, mqtt, storage, engine, broadcast_fn
                        )
                    )

            # Small sleep to avoid hammering the API when there are no updates
            await asyncio.sleep(0.2)
