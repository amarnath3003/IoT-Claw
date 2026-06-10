"""
IntegrationRegistry
───────────────────
Central hub that holds every registered integration adapter and routes
device commands to the correct one based on the device's ``integration_source``
field.

Usage
─────
    registry = IntegrationRegistry()
    registry.register(MQTTClient(...))          # integration_id = "mqtt"
    registry.register(ZigbeeAdapter(...))       # integration_id = "zigbee"
    registry.register(HomeAssistantAdapter(...))# integration_id = "ha"

    await registry.start_all()                  # called from FastAPI lifespan

    result = await registry.send_command(device, "ON")

    await registry.stop_all()                   # called from lifespan shutdown
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.integrations.base import BaseIntegration

logger = logging.getLogger(__name__)


class IntegrationRegistry:
    """Holds and coordinates all active integration adapters."""

    def __init__(self) -> None:
        # Ordered dict preserves registration order for start_all / stop_all
        self._integrations: dict[str, "BaseIntegration"] = {}

    # ── Registration ──────────────────────────────────────────────────────────

    def register(self, integration: "BaseIntegration") -> None:
        """
        Register an adapter.  Replaces any existing one with the same ID.
        Call this before ``start_all()``.
        """
        iid = integration.integration_id
        self._integrations[iid] = integration
        logger.info("[Registry] Registered integration: %s", iid)

    def get(self, integration_id: str) -> "BaseIntegration | None":
        """Return the adapter with the given ID, or None if not registered."""
        return self._integrations.get(integration_id)

    @property
    def all(self) -> list["BaseIntegration"]:
        """All registered adapters in registration order."""
        return list(self._integrations.values())

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start_all(self) -> None:
        """
        Start every registered integration in registration order.

        Errors are logged but do not stop other integrations from starting.
        """
        for iid, integration in self._integrations.items():
            try:
                await integration.start()
                logger.info("[Registry] Started: %s", iid)
            except Exception as exc:
                logger.error("[Registry] Failed to start %s: %s", iid, exc)

    async def stop_all(self) -> None:
        """
        Stop every registered integration in *reverse* registration order so
        that higher-level adapters (Zigbee, HA) shut down before the MQTT
        transport they depend on.
        """
        for iid, integration in reversed(list(self._integrations.items())):
            try:
                await integration.stop()
                logger.info("[Registry] Stopped: %s", iid)
            except Exception as exc:
                logger.error("[Registry] Error stopping %s: %s", iid, exc)

    # ── Command routing ───────────────────────────────────────────────────────

    async def send_command(
        self,
        device: dict,
        command: str,
        params: dict | None = None,
    ) -> dict:
        """
        Route a command to the integration that owns *device*.

        Routing key: ``device["integration_source"]``

        Falls back to the "mqtt" adapter for legacy devices that were
        registered before the ``integration_source`` field existed.
        """
        source = device.get("integration_source") or "mqtt"
        integration = self._integrations.get(source)

        if integration is None:
            # Graceful fallback: try mqtt for un-sourced legacy devices
            integration = self._integrations.get("mqtt")

        if integration is None:
            return {
                "ok": False,
                "error": f"No integration registered for source '{source}'",
            }

        return await integration.send_command(device, command, params or {})

    # ── Introspection ─────────────────────────────────────────────────────────

    def status(self) -> dict:
        """Return a summary dict of registered integrations (for diagnostics)."""
        return {
            iid: {
                "integration_id": iid,
                "class": type(intg).__name__,
            }
            for iid, intg in self._integrations.items()
        }
