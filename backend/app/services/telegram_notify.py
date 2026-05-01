"""
IoT-Claw Telegram Notification Service
────────────────────────────────────────
Sends proactive Telegram messages when:
  - A workflow fires
  - A device goes offline / comes back online
  - A sensor crosses a threshold

This reuses the existing Telegram bot token — no extra config needed.
Just make sure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set in .env.

Usage (from anywhere in the backend):
    from app.services.telegram_notify import notify

    notify("⚡ Fan turned ON", "Workflow 'Night Mode' triggered at 23:00")
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("telegram_notify")

_TOKEN   = os.getenv("TELEGRAM_BOT_TOKEN", "")
_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
_BASE    = f"https://api.telegram.org/bot{_TOKEN}"


def _is_configured() -> bool:
    return bool(_TOKEN and _CHAT_ID)


def _build_html(title: str, body: str, extra: Optional[str] = None) -> str:
    """Format a clean HTML notification message for Telegram."""
    parts = [f"<b>{title}</b>"]
    if body:
        parts.append(body)
    if extra:
        parts.append(f"<i>{extra}</i>")
    return "\n".join(parts)


async def _send_async(text: str, photo_path: Optional[str] = None) -> None:
    """Async send — used when already inside an event loop."""
    if not _is_configured():
        return
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if photo_path and os.path.exists(photo_path):
                with open(photo_path, "rb") as photo_file:
                    await client.post(
                        f"{_BASE}/sendPhoto",
                        data={"chat_id": _CHAT_ID, "caption": text, "parse_mode": "HTML"},
                        files={"photo": photo_file},
                    )
            else:
                await client.post(f"{_BASE}/sendMessage", json={
                    "chat_id":    _CHAT_ID,
                    "text":       text,
                    "parse_mode": "HTML",
                })
    except Exception as exc:
        log.warning("Telegram notify failed: %s", exc)


def notify(title: str, body: str = "", extra: str = "", photo_path: str = None) -> None:
    """
    Fire-and-forget Telegram notification.
    Safe to call from sync or async code.
    """
    if not _is_configured():
        log.debug("Telegram notify skipped (not configured): %s", title)
        return

    text = _build_html(title, body, extra or None)

    # If there's a running event loop (FastAPI context), schedule a task
    try:
        loop = asyncio.get_running_loop()
        asyncio.run_coroutine_threadsafe(_send_async(text, photo_path), loop)
    except RuntimeError:
        # No running loop — use a background thread
        def _send_sync():
            try:
                import requests as req
                if photo_path and os.path.exists(photo_path):
                    with open(photo_path, "rb") as photo_file:
                        req.post(
                            f"{_BASE}/sendPhoto",
                            data={"chat_id": _CHAT_ID, "caption": text, "parse_mode": "HTML"},
                            files={"photo": photo_file},
                            timeout=15,
                        )
                else:
                    req.post(f"{_BASE}/sendMessage", json={
                        "chat_id":    _CHAT_ID,
                        "text":       text,
                        "parse_mode": "HTML",
                    }, timeout=10)
            except Exception as exc:
                log.warning("Telegram notify (sync) failed: %s", exc)
        threading.Thread(target=_send_sync, daemon=True).start()
