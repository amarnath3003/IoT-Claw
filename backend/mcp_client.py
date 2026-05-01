"""
MCPClient — async wrapper around the MQTT transport for MCP tool calls.

Usage:
    mcp = MCPClient(mqtt_client, storage)

    # Register the response registry with the mqtt client
    mqtt_client.set_mcp_response_registry(mcp.pending)

    # Call a native tool on an edge device
    result = await mcp.call_tool("esp32_edge_1", "set_pin", {"pin": 5, "state": "ON"})
    # => {"content": [{"type": "text", "text": "Pin 5 set to ON"}]}
"""
import asyncio
import json
import uuid


class MCPClient:
    def __init__(self, mqtt, storage, timeout: float = 5.0):
        self.mqtt = mqtt
        self.storage = storage
        self.timeout = timeout
        # Maps request_id -> asyncio.Future for pending tool calls
        self.pending: dict[str, asyncio.Future] = {}

    def _get_device_topic(self, device_name: str) -> str | None:
        devices = self.storage.get_all_devices()
        device = devices.get(device_name)
        if not device:
            return None
        return device.get("topic_base")

    async def list_tools(self, device_name: str) -> dict:
        """Send a tools/list request and return the capability manifest."""
        return await self._rpc(device_name, "tools/list", {})

    async def call_tool(self, device_name: str, tool_name: str, arguments: dict = None) -> dict:
        """Send a tools/call request and await the response."""
        return await self._rpc(device_name, "tools/call", {
            "name": tool_name,
            "arguments": arguments or {}
        })

    async def _rpc(self, device_name: str, method: str, params: dict) -> dict:
        topic_base = self._get_device_topic(device_name)
        if not topic_base:
            return {"error": f"Device '{device_name}' not found."}

        req_id = str(uuid.uuid4())[:8]
        payload = json.dumps({
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params
        })

        loop = asyncio.get_event_loop()
        fut: asyncio.Future = loop.create_future()
        self.pending[req_id] = fut

        try:
            ok = self.mqtt.publish(topic_base + "/mcp/request", payload)
            if not ok:
                del self.pending[req_id]
                return {"error": "MQTT publish failed (broker may be offline, command is queued)"}

            response = await asyncio.wait_for(fut, timeout=self.timeout)
            return response
        except asyncio.TimeoutError:
            self.pending.pop(req_id, None)
            return {"error": f"MCP call timed out after {self.timeout}s — device may be offline"}
        except Exception as e:
            self.pending.pop(req_id, None)
            return {"error": str(e)}

    def resolve_response(self, req_id: str, payload: dict):
        """Called by mqtt_client when a /mcp/response arrives."""
        fut = self.pending.pop(req_id, None)
        if fut and not fut.done():
            fut.set_result(payload)
