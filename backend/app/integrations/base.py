"""
BaseIntegration
───────────────
Abstract base class that every IoT-Claw protocol adapter must implement.

Contract
────────
  integration_id  str    Unique identifier: "mqtt", "zigbee", "ha"
  start()                Connect / subscribe / launch background tasks
  stop()                 Clean, idempotent shutdown
  send_command()         Route a device command to the correct protocol
  owns_device()          True if this adapter is responsible for a device record

All concrete adapters also receive a uniform constructor signature:

    def __init__(self, storage, ws_broadcast: Callable) -> None

so that IntegrationRegistry can create and manage them uniformly.
Subclasses that need extra dependencies (e.g. ZigbeeAdapter needs the MQTT
transport) accept them as additional keyword arguments after the base pair.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Callable


class BaseIntegration(ABC):
    """
    Unified interface for all IoT-Claw protocol adapters.

    Subclasses MUST:
      1. Set ``integration_id`` as a class attribute.
      2. Implement ``start()``, ``stop()``, and ``send_command()``.
    """

    #: Must be overridden as a class attribute in every subclass.
    #: Valid values: "mqtt" | "zigbee" | "ha"
    integration_id: str

    def __init__(self, storage, ws_broadcast: Callable) -> None:
        self.storage = storage
        # Normalise: internal code always uses self._broadcast
        self._broadcast = ws_broadcast

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    @abstractmethod
    async def start(self) -> None:
        """
        Connect to the upstream service and begin processing.

        - MQTT:   calls paho connect_async + loop_start
        - Zigbee: subscribes to Zigbee2MQTT topics via the shared MQTT transport
        - HA:     launches the WebSocket reconnection loop as an asyncio.Task
        """

    @abstractmethod
    async def stop(self) -> None:
        """
        Gracefully shut down the adapter.

        Must be idempotent — safe to call even if start() was never called.
        """

    # ── Command dispatch ──────────────────────────────────────────────────────

    @abstractmethod
    async def send_command(self, device: dict, command: str, params: dict) -> dict:
        """
        Send a control command to a device owned by this integration.

        Args:
            device:  Full device record from ``storage.get_all_devices()``.
            command: Normalised action string, e.g. "ON", "OFF", "TOGGLE".
            params:  Additional protocol-specific parameters:
                       - Zigbee: brightness (1-254), color_temp, color, effect, transition
                       - HA:     brightness_pct (0-100), color_temp_kelvin, rgb_color,
                                 temperature, hvac_mode, media_content_id
                       - MQTT:   (usually empty — command string is the full payload)

        Returns:
            dict with at minimum an ``"ok"`` key (bool).
        """

    # ── Ownership check ───────────────────────────────────────────────────────

    def owns_device(self, device: dict) -> bool:
        """
        Return True if this integration is responsible for the given device.

        Uses the canonical ``integration_source`` field set during device
        registration.  The field defaults to "mqtt" for pre-existing devices
        that were registered before this field was introduced.
        """
        return device.get("integration_source") == self.integration_id
