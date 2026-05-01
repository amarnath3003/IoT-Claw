# Integration Plan: ESP-Claw Features into IoT-Claw

Based on the analysis of the [espressif/esp-claw](https://github.com/espressif/esp-claw) repository, there are several powerful features we can integrate into our **IoT-Claw** platform to upgrade it from a traditional "Cloud/Backend-driven AI" to a true **Edge AI** system.

## 🌟 1. Features to Integrate from ESP-Claw

1. **Dynamic "Chat Coding" (Lua Scripting on Edge)**
   - *ESP-Claw Feature:* Generates Lua scripts via LLM and loads them dynamically on the ESP32.
   - *Our Benefit:* Replaces static Arduino sketches. Users won't need to recompile and re-flash their ESP32 every time they want to add a new sensor or change logic.

2. **Edge Agent Runtime (Agent Loop on ESP32)**
   - *ESP-Claw Feature:* The continuous loop of sensing, decision-making, and execution runs directly on the ESP32 rather than requiring round trips to a remote server.
   - *Our Benefit:* Much faster event-driven responses (milliseconds) and less reliance on the Python backend for real-time local decisions.

3. **Structured Local Memory**
   - *ESP-Claw Feature:* Organizes memories sequentially and securely on the device itself without pushing privacy data to the cloud.
   - *Our Benefit:* The ESP32 can store offline schedules, user preferences, and current state locally, making automations resilient to backend network drops.

4. **MCP (Model Context Protocol) Integration**
   - *ESP-Claw Feature:* ESP32 acts as an MCP server/client.
   - *Our Benefit:* Standardizes how our `ai_agent.py` interacts with hardware tools seamlessly.

5. **Web-Based Online Flashing**
   - *ESP-Claw Feature:* Flash firmware directly from the browser using Web Serial.
   - *Our Benefit:* Removes the need for users to install the Arduino IDE for `esp32_dual_led_mqtt.ino` setup. They can flash from our React dashboard.

---

## 🛠️ 2. What to Implement & How to Implement

### Phase 1: Web-Based Firmware Flashing
**What to implement:**
Allow users to flash ESP32s directly from our React frontend (`frontend/src/components/DeviceManager.jsx` or a new component).

**How to implement:**
1. Integrate the **ESP Web Tools** (`esp-web-tools`) standard into the React project (`frontend/index.html`).
2. Pre-compile a generic generic Edge Agent firmware (similar to ESP-Claw) that includes Lua support, MQTT credentials form, and basic LLM configurations.
3. Add a "Flash Device" dashboard button that connects to the ESP32 via the Web Serial API and uploads the `.bin` files automatically directly from the browser.

### Phase 2: Model Context Protocol (MCP) Over MQTT
**What to implement:**
Standardize device capabilities using MCP so AI Agents can read them dynamically, replacing static `storage.json` structures.

**How to implement:**
1. Implement an MCP bridge in the Python Backend (`backend/ai_agent.py`) or directly on the ESP32.
2. Whenever a new ESP32 comes online, it publishes a standard manifest of its MCP Tools (e.g., `set_led`, `read_temp_sensor`) to MQTT.
3. The AI Agent consumes this standard MCP schema format, making the system completely flexible and hardware-agnostic.

### Phase 3: Dynamic "Chat Coding" & Lua Execution Engine
**What to implement:**
Replace our rigid C++ Arduino sketch (`hardware/esp32_dual_led_mqtt/esp32_dual_led_mqtt.ino`) with a dynamic firmware processing Lua.

**How to implement:**
1. Switch our ESP hardware basis from standard standard C++ logic to incorporate a lightweight Lua interpreter (like `luajit` adapted for MCU).
2. When a user requests a complex automation via chat (e.g., "Blink an LED when temperature > 30°C for 5 minutes"):
   - `backend/ai_agent.py` generates a Lua script mapping out this specific logic instead of just parsing static MQTT commands.
   - The backend sends the Lua script payload over MQTT (e.g., `home/device_id/ota_script`).
   - The ESP32 receives the script, stores it in its Local Structured Memory, and dynamically reloads its behavior loop.

### Phase 4: Edge Agent & Event-Driven Loop
**What to implement:**
Migrate latency-sensitive workflows from Python `execution_engine.py` running at a 5s interval to the ESP32 for immediate response.

**How to implement:**
1. Port basic event decision trees down to the ESP32. 
2. Have physical sensors trigger Edge-based interrupts (Event-Driven) instead of polling states via the Python backend. The ESP32 handles the immediate physical reaction (like turning on a light with millisecond latency) and then asynchronously notifies the React dashboard via MQTT and Websockets to update the UI.

## 🏁 Summary
Integrating **ESP-Claw** principles shifts **IoT Claw** from a purely *hub-and-spoke* architectural model to an *edge-computing* model. By combining our beautiful React Dashboard and advanced local backend with ESP-Claw's dynamic Lua loading, MCP support, and Edge-Agent loops, our platform will offer unparalleled execution speed, offline resilience, and plug-and-play ease of use.

---

## 🏆 Why IoT-Claw Stays Superior (Our Architectural Advantage)

While ESP-Claw provides a powerful edge-computing framework, **IoT-Claw** maintains distinct advantages as a comprehensive smart home/IoT hub:

1. **Dedicated Visual Dashboard:** We offer a full React-based Neumorphic frontend. ESP-Claw relies entirely on 3rd-party IM apps (Telegram, WeChat), whereas we provide a holistic, real-time visual system overview.
2. **Centralized Multi-Device Orchestration:** Our Python backend (`ai_agent.py` & `execution_engine.py`) securely holds the context of *all* devices. Coordinating 50+ devices is trivial for our central "big brain," while edge-only systems struggle with complex peer-to-peer orchestration.
3. **True Hardware Agnosticism:** We can control *any* basic MQTT device, not just powerful ESP32-S3 boards.
4. **Infinite Backend Extensibility:** Running AI logic on a Python backend allows us to connect heavy tools (Vector DBs, local vision models, complex REST APIs) that simply cannot fit on an ESP32's restricted memory.

---

## 💡 Implementing ESP-Claw Features on a "Normal" ESP32

Standard ESP-Claw targets the ESP32-S3. To bring these edge features to a standard, cheap ESP32, we should adopt a **MicroPython "Lite" Approach**:

1. **Dynamic Execution via MicroPython `exec()`**
   - Instead of C++ firmware or a full Lua JIT, flash the ESP32 with **MicroPython**.
   - The AI Agent generates short MicroPython scripts and sends them over MQTT (e.g., `home/esp32_1/script`).
   - The ESP32 receives the script string and runs it dynamically using Python's `exec()`. Instant updates, zero compiling!

2. **Lightweight MCP over MQTT**
   - When the ESP32 boots, it publishes a JSON manifest to a discovery topic (e.g., `home/discovery/esp32_1`).
   - The manifest lists available "Tools" (like `{"name": "set_led", "params": {"state": ["ON", "OFF"]}}`).
   - The central AI Agent listens to this topic to dynamically understand device capabilities without hardcoded configs.

3. **Local Edge Loops**
   - Push condition evaluations (e.g., `if temp > 30: turn_on_fan()`) directly into the ESP32's local `while True` loop.
   - The ESP32 reacts in milliseconds locally, and only uses MQTT to asynchronously notify the React dashboard of state changes.

## 📝 Recommended Approach & Next Steps

**Step 1: Prototype the MicroPython Firmware**
- Flash a single ESP32 with standard MicroPython.
- Write a basic script that connects to WiFi and MQTT, and exposes a command topic capable of executing dynamic string payloads with `exec()`.

**Step 2: Backend Tool Discovery (MCP)**
- Modify `ai_agent.py` and `storage.py` to auto-register new devices that publish their schema to an MQTT `discovery/#` topic.

**Step 3: Update AI Prompting**
- Train the local AI Agent to respond to complex automation requests by outputting standard MicroPython logic and pushing it to the target device's script topic, rather than just flipping a state in `execution_engine.py`.

**Step 4: Web Flash UI**
- Add the `esp-web-tools` script to our React frontend to allow one-click installation of the base MicroPython image for completely seamless user onboarding.

---

## ✅ Implemented (2026-05-01)

### Phase 2 + Phase 3 — MCP Discovery & Dynamic Edge Scripting

**Files changed:**
- `backend/mqtt_client.py` — subscribes to `home/discovery/#`; new `_handle_discovery()` auto-registers edge devices and stores their MCP tool manifest when they boot.
- `backend/ai_agent.py` — added `push_script` and `get_device_capabilities` tools + system prompt section teaching the AI to write MicroPython for edge devices.
- `hardware/micropython_edge_agent.py` — **new MicroPython firmware** for ESP32:
  - Connects to WiFi + MQTT on boot
  - Publishes full capability manifest to `home/discovery/<device_id>` (retained)
  - Subscribes to `<topic_base>/set` (direct ON/OFF) and `<topic_base>/script` (dynamic code)
  - Executes received scripts with `exec()`; if the script defines `loop()`, calls it every 100ms
  - MQTT keepalive + auto-reconnect on network drop

**New AI capabilities:**
- `get_device_capabilities(device)` — AI inspects what hardware a device exposes before scripting it
- `push_script(device, script, description)` — AI generates + pushes live MicroPython to the device

**Example interaction now possible:**
> User: "Make the LED on esp32_edge_1 blink twice fast whenever the ADC on pin 34 exceeds 2500"
> AI → `get_device_capabilities(esp32_edge_1)` → sees ADC + LED tools → `push_script(...)` with real MicroPython → ESP32 runs it locally forever with ~100ms latency, no backend round-trip

---

## ✅ Implemented (2026-05-01) — Round 2

### Features 5–8 implemented:

**Feature 5 — Real-Time Sensor Graphing:**
- `backend/storage.py` — in-memory `_telemetry` ring buffer (60 readings per device); `add_telemetry()`, `get_telemetry()`
- `backend/mqtt_client.py` — any numeric MQTT state update is also buffered as telemetry
- `backend/main.py` — `GET /devices/{name}/telemetry` endpoint
- `frontend/src/api.js` — `getTelemetry(name)`
- `frontend/src/components/DeviceCard.jsx` — SVG `<Sparkline>` component (polyline + gradient area fill + latest-value dot); polls every 2s; shows for all numeric sensors and edge devices with ADC data

**Feature 6 — Script Version History & Rollback:**
- `backend/storage.py` — `add_script_history()`, `get_script_history()` (last 10 per device, newest first)
- `backend/ai_agent.py` — `push_script_fn` now saves to history on every push; new `rollback_script` AI tool
- `backend/main.py` — `GET /devices/{name}/scripts`, `POST /devices/{name}/scripts/{index}/rollback`
- `frontend/src/api.js` — `getScriptHistory()`, `rollbackScript()`
- `frontend/src/components/DeviceCard.jsx` — `<ScriptHistoryDrawer>` modal: lists all versions with timestamps, view/expand code, one-click Rollback button for each past version

**Feature 7 — Multi-Device Script Broadcast:**
- `backend/ai_agent.py` — `push_script_group` AI tool: pushes script to all `micropython_edge_agent` devices matching a location (empty = all edge devices); saves history on each

**Feature 8 — Device Health Heartbeat Monitor:**
- `backend/mqtt_client.py` — subscribes to `home/+/heartbeat`; `_handle_heartbeat()` updates `last_heartbeat` and revives devices marked offline
- `backend/storage.py` — `update_device_heartbeat(device_name)`
- `backend/execution_engine.py` — `_check_heartbeats()` runs every 5s; marks device `offline` if no heartbeat for >90s
- `hardware/micropython_edge_agent.py` — publishes `alive` to `{TOPIC_BASE}/heartbeat` every 30s; also publishes ADC reading to `/state` every 500ms for telemetry
- `frontend/src/components/DeviceCard.jsx` — red OFFLINE badge, greyed icon, disabled toggle, live heartbeat timestamp, red card glow

---

## 💡 Additional Integration Suggestions

### 5. Real-Time Sensor Graphing via High-Frequency MQTT Telemetry
**What:** Edge devices currently only publish state on change. Add a configurable telemetry mode where the ESP32 publishes sensor readings (ADC, temperature, etc.) at a fixed interval (e.g., every 500ms) to `<topic_base>/telemetry`.
**Backend:** New `/telemetry/{device}` WebSocket stream endpoint that buffers the last N readings.
**Frontend:** Add a mini sparkline/chart in DeviceCard for sensor-type devices using a lightweight lib like `recharts`.
**Why:** Turns the dashboard from a state-snapshot view into a live data stream — much more useful for monitoring physical environments.

### 6. Script Version History & Rollback
**What:** When `push_script` is called, store the script content + timestamp + description in `storage.json` under `devices[name].script_history` (cap at last 10). Add an AI tool `rollback_script(device, version)` and a UI drawer in DeviceCard showing past scripts with one-click re-push.
**Why:** Edge scripts can misbehave (crash the loop, wrong pin). Rollback gives a safety net without needing to physically access the device.

### 7. Multi-Device Edge Orchestration via Script Broadcast
**What:** Add a `push_script_group(location, script, description)` AI tool that pushes the same script to all edge devices in a given location (e.g., "living_room"). Useful for synchronized light effects, coordinated sensor polling, or room-wide automation.
**Why:** Today's MQTT structure naturally supports fan-out — this just exposes it as a first-class AI tool.

### 8. Device Health Heartbeat Monitor
**What:** Edge devices publish a `home/<device_id>/heartbeat` ping every 30s. The backend tracks `last_heartbeat` per device and marks a device `offline` if no ping arrives within 90s. The execution engine can trigger a workflow on device-offline events.
**Why:** Currently, a crashed or unplugged ESP32 stays "online" in the dashboard forever. This makes device health visible and actionable.

---

## ✅ Implemented (2026-05-01) — Round 3

**Feature 9 — Device Event Workflow Triggers:**
- `backend/execution_engine.py` — `_check_heartbeats()` now fires `device_event` workflows on offline/online transitions; also detects device recovery (heartbeat resumes after timeout)
- `backend/ai_agent.py` — `device_event` added as trigger type (`event: "offline"|"online"`, optional `device` filter); system prompt updated with examples

**Feature 10 — Telemetry CSV Export:**
- `backend/main.py` — `GET /devices/{name}/telemetry/export` returns CSV file
- `frontend/src/api.js` — `getTelemetryExportUrl(name)`
- `frontend/src/components/DeviceCard.jsx` — `⬇ CSV` download link on numeric sensor and edge ADC sparkline panels



**Feature 11 — Dashboard Stats Fix + Enhancements:**
- `frontend/src/components/Dashboard.jsx` — fixed offline count bug (was `total − onCount`, now counts only `status === "OFFLINE"`); added **Edge** and **Workflows** stat tiles; active workflow count fetched on mount

---

## ✅ Implemented (2026-05-01) — Round 4

### Phase 1 — Web-Based Firmware Flashing

**Files changed:**
- `frontend/src/components/FlashDevice.jsx` — **new Flash Wizard component**:
  - Step 1: Configure WiFi SSID/password, MQTT broker IP, Device ID, location, and LED GPIO pin
  - Step 2: Preview the auto-generated `main.py` MicroPython script with all credentials embedded
  - Step 3 Method A: One-click **Web Serial API** flash — browser connects to ESP32 over USB, pushes script into MicroPython REPL via raw paste protocol (Chrome/Edge 89+)
  - Step 3 Method B: Manual upload instructions with `mpremote` command and Thonny guide as fallback
  - Step 4: Done screen — shows device summary (ID, topic, broker, location) and a "Flash Another" reset
- `frontend/src/App.jsx` — added `⚡ Flash` tab to the sidebar nav; renders `<FlashDevice />` when active

**New user flow:**
> User opens Flash tab → fills in WiFi + MQTT + device name → clicks "Generate" → previews script → clicks "Connect & Flash via Web Serial" → browser prompts for USB port → firmware pushed in-browser — device auto-discovers on MQTT and appears in dashboard within seconds. Zero terminal, zero IDE required.

---

## 🚀 3. Remaining Roadmap (Yet to be Built)

### ~~1. Phase 4: Edge Agent Migration (Latency-Free Automations)~~ ✅ Done

### ~~2. Advanced Structured Local Memory~~ ✅ Done

### ~~3. Interactive Edge Console~~ ✅ Done

### ~~4. Standardized MCP Protocol Implementation~~ ✅ Done

### ~~5. Backend Reliability (Broker Reachability)~~ ✅ Done

---

## ✅ Implemented (2026-05-01) — Round 5

### Advanced Structured Local Memory — Edge Persistence & NTP Time Sync

**Files changed:**
- `hardware/micropython_edge_agent.py` — three additions:
  - `import ntptime` + `TZ_OFFSET_HOURS` config constant
  - `connect_wifi()` now calls `ntptime.settime()` immediately after a successful WiFi connection; prints local offset; gracefully continues if NTP is unreachable
  - `on_message()` now writes every received script to `edge_logic.py` on internal flash using `with open(..., "w")`
  - Boot sequence now attempts `with open("edge_logic.py", "r")` to restore and `exec()` the last saved script before connecting to MQTT; publishes `script_loaded_from_flash` status on success
- `frontend/src/components/FlashDevice.jsx` — mirrored all of the above into the `buildFirmwareScript` template; added **TZ Offset** number field to the Step 1 configuration form (4-column grid layout)

**Success criteria:**
> Push a looping script to the device via AI chat. Unplug the ESP32. Plug it back in. The automation resumes automatically within seconds of boot — no backend, no re-push needed.

### Edge Agent Migration (Workflow Compiler)

**Files changed:**
- `backend/edge_compiler.py` — **new file**: Implements the `EdgeCompiler` which takes a JSON workflow and generates a `loop()` function in MicroPython. It translates "sensor" triggers into `_adc.read()` conditions and generates `mqtt.publish()` actions with a cooldown mechanism.
- `backend/main.py` — added `POST /workflows/{workflow_id}/deploy` to call the compiler, publish the script to the device, and save the deployed status to storage.
- `backend/execution_engine.py` — modified `_evaluate_all` to **skip** evaluating workflows that have `deployed_to_edge = True` to prevent duplicate firing.
- `frontend/src/api.js` — added `deployWorkflowToEdge` API call.
- `frontend/src/components/WorkflowList.jsx` — added a **⚡ Deploy to Edge** button for sensor-triggered workflows, and a `⚡ EDGE` badge to visually indicate hardware-deployed automations.

**Success criteria:**
> Create a workflow in the UI ("If Sensor ADC > 2000, Turn ON Light"). Click "⚡ Deploy to Edge". The backend compiles it to Python, pushes it to the ESP32's internal memory via MQTT, and the automation now executes locally on the hardware in <100ms.

### Interactive Edge Console

**Files changed:**
- `hardware/micropython_edge_agent.py` & `frontend/src/components/FlashDevice.jsx`: Injected a custom `print()` wrapper into the execution environment that publishes all print statements to `topic_base/console`.
- `backend/mqtt_client.py`: Added subscriptions to `/console` topics and routed them to WebSocket broadcasts.
- `frontend/src/hooks/useWebSocket.js`: Exposed the raw `lastMessage` state.
- `frontend/src/components/EdgeConsole.jsx`: **New file.** A terminal-style component that renders incoming WebSocket console logs.
- `frontend/src/components/DeviceCard.jsx`: Added the "💻 Console" button for edge devices to toggle the visibility of the new `EdgeConsole` component.

**Success criteria:**
> Pushing a script with `print("Hello from edge")` will instantly stream that text over MQTT and display it in the browser UI, eliminating the need for a physical USB serial connection for debugging.

### Backend Reliability (Self-Healing MQTT)

**Files changed:**
- `backend/mqtt_client.py`: Added `is_connected` tracking and a time-to-live (TTL) offline command queue. Commands issued while Mosquitto is down are queued for up to 60 seconds and automatically flushed upon reconnection.
- `frontend/src/hooks/useWebSocket.js` & `frontend/src/App.jsx`: UI now intercepts `broker_status` WebSocket events to display a "⚠️ MQTT Broker is Offline" warning banner.
- `backend/ai_agent.py`: Dynamically injects `[SYSTEM CONTEXT: The internal MQTT Broker is currently OFFLINE]` into the system prompt so the AI can intelligently explain queue states to the user.

**Success criteria:**
> Stop the Mosquitto broker. The UI shows an amber warning. Ask the AI to turn on the lights; the AI replies that commands are queued because the broker is unreachable. Start the Mosquitto broker again; the queued commands execute immediately and the UI warning disappears.

### Standardized MCP Protocol Implementation

**Files changed:**
- `hardware/micropython_edge_agent.py`: Added `handle_mcp_request()` dispatcher, `_mcp_respond()` helper, native tools (`set_led`, `set_pin`, `read_adc`, `exec_script`, `tools/list`). Subscribed to `TOPIC_BASE/mcp/request` on boot and reconnect.
- `backend/mcp_client.py` — **new file**: `MCPClient` class with `call_tool()` / `list_tools()` async methods. Maintains a pending-futures registry keyed by JSON-RPC `id` for response correlation with 5s timeout.
- `backend/mqtt_client.py`: Subscribes to `home/+/mcp/response`, routes responses through `_handle_mcp_response()` which resolves the correct pending `asyncio.Future`.
- `backend/main.py`: Instantiates `MCPClient`, links its pending registry, adds `POST /devices/{name}/mcp/call` REST endpoint.
- `backend/ai_agent.py`: Added `call_hardware_tool` AI tool + made the dispatch loop async-aware (`inspect.iscoroutinefunction`).
- `frontend/src/api.js`: Added `callMcpTool()` API call.
- `frontend/src/components/DeviceCard.jsx`: Added `McpToolsPanel` component and "🔧 Tools" toggle button for edge devices.

**Success criteria:**
> Boot the ESP32. Open the Device Card. Click "🔧 Tools". See `set_led`, `read_adc`, `set_pin` as interactive buttons. Click ► Run on `set_led` with state `ON` and watch the hardware LED light up in <200ms with a JSON-RPC response displayed inline.
