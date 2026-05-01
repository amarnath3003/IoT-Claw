"""
IoT-Claw Web Push Service
─────────────────────────
Sends Web Push notifications to subscribed browsers when automations fire.

Configuration (backend/.env):
  VAPID_PUBLIC_KEY   – base64url VAPID public key
  VAPID_PRIVATE_KEY  – base64url VAPID private key
  VAPID_EMAIL        – contact email for VAPID claims (e.g. mailto:you@example.com)

Generate VAPID keys:
  pip install pywebpush
  python -c "from pywebpush import Vapid; v=Vapid(); v.generate_keys(); print('Public:', v.public_key); print('Private:', v.private_key)"
"""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

log = logging.getLogger("push_service")

VAPID_PRIVATE_KEY: str = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY:  str = os.getenv("VAPID_PUBLIC_KEY",  "")
VAPID_EMAIL:       str = os.getenv("VAPID_EMAIL",       "mailto:admin@iotclaw.local")

# In-memory subscription store: {endpoint: subscription_info}
# For production, persist this to SQLite via the Storage class
_subscriptions: dict[str, dict] = {}


def save_subscription(sub: dict) -> None:
    """Register a browser push subscription."""
    endpoint = sub.get("endpoint", "")
    if endpoint:
        _subscriptions[endpoint] = sub
        log.info("Push subscription saved: %s…", endpoint[:60])


def remove_subscription(endpoint: str) -> None:
    """Remove a subscription by its endpoint URL."""
    _subscriptions.pop(endpoint, None)
    log.info("Push subscription removed: %s…", endpoint[:60])


def send_push(
    title: str,
    body:  str,
    tag:   str = "iotclaw-alert",
    url:   str = "/",
) -> dict:
    """
    Send a Web Push notification to all subscribed browsers.
    Returns a summary of results.
    """
    if not _subscriptions:
        return {"sent": 0, "failed": 0, "reason": "no_subscribers"}

    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        log.warning(
            "VAPID keys not configured — push notifications disabled. "
            "Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to backend/.env"
        )
        return {"sent": 0, "failed": 0, "reason": "vapid_not_configured"}

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        log.warning("pywebpush not installed. Run: pip install pywebpush")
        return {"sent": 0, "failed": 0, "reason": "pywebpush_not_installed"}

    payload = json.dumps({"title": title, "body": body, "tag": tag, "url": url})
    sent = failed = 0
    dead: list[str] = []

    for endpoint, sub in list(_subscriptions.items()):
        try:
            webpush(
                subscription_info=sub,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_EMAIL},
            )
            sent += 1
        except Exception as exc:
            err_str = str(exc)
            if "410" in err_str or "404" in err_str:
                dead.append(endpoint)   # subscription expired
            else:
                log.warning("Push failed for %s…: %s", endpoint[:40], exc)
            failed += 1

    # Cleanup expired subscriptions
    for ep in dead:
        _subscriptions.pop(ep, None)
        log.info("Removed expired push subscription: %s…", ep[:60])

    log.info("Push sent: %d OK, %d failed (total subs: %d)", sent, failed, len(_subscriptions))
    return {"sent": sent, "failed": failed}


def get_vapid_public_key() -> Optional[str]:
    """Return the VAPID public key for the frontend."""
    return VAPID_PUBLIC_KEY or None
