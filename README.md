# IoT-Claw

![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688?logo=fastapi)
![MQTT](https://img.shields.io/badge/MQTT-Mosquitto-660066?logo=eclipsemosquitto)
![License](https://img.shields.io/badge/License-MIT-green)

IoT-Claw is an open-source IoT dashboard that lets you monitor and control smart home devices through a conversational AI interface. It connects a React frontend to a FastAPI backend that manages MQTT-based devices, automation workflows, and a simulated security camera.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [Hardware Setup](#hardware-setup)
- [MQTT Configuration](#mqtt-configuration)
- [API Endpoints](#api-endpoints)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

## Features

- 🤖 **AI Chat Interface** – Control devices using natural language powered by OpenAI
- 📡 **MQTT Integration** – Publish and subscribe to device topics via Mosquitto
- 🏠 **Device Registry** – Register, update, and delete MQTT-connected devices
- ⚡ **Automation Workflows** – Create trigger-based rules to automate device actions
- 📷 **Security Camera Simulator** – View a live-preview JPEG feed from a simulated camera
- 📊 **Activity Logs** – Full audit trail of all commands and state changes
- 🔌 **WebSocket Updates** – Real-time state push to all connected frontend clients

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | FastAPI, Uvicorn, Python 3.10+ |
| AI | OpenAI API |
| Messaging | MQTT (Mosquitto broker) |
| Hardware | ESP32 (Arduino sketch) |

## Prerequisites

- Python 3.10 or later
- Node.js 18 or later and npm
- [Mosquitto MQTT broker](https://mosquitto.org/download/) running on port 1883
- An OpenAI API key (for the AI chat feature)
- Arduino IDE with the ESP32 board package and `PubSubClient` library installed (for hardware control)

## Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in your credentials:

```env
OPENAI_API_KEY=sk-...
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
```

Start the server:

```bash
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000` and interactive docs at `http://localhost:8000/docs`.

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The dashboard will open at `http://localhost:5173`.

## Hardware Setup

The `hardware/` directory contains an Arduino sketch for an ESP32 that controls two LEDs over MQTT.

1. Open `hardware/esp32_dual_led_mqtt/esp32_dual_led_mqtt.ino` in the Arduino IDE.
2. Replace the placeholder Wi-Fi credentials and broker IP:
   - `YOUR_WIFI_NAME` → your Wi-Fi SSID
   - `YOUR_WIFI_PASSWORD` → your Wi-Fi password
   - `192.168.1.100` → your PC's LAN IP address
3. Upload the sketch to the ESP32.
4. Wire the LEDs:
   - LED 1: GPIO 26 → resistor → LED anode; cathode → GND
   - LED 2: GPIO 27 → resistor → LED anode; cathode → GND

See [`hardware/ESP32_SETUP.md`](hardware/ESP32_SETUP.md) for detailed wiring and end-to-end testing steps.

## MQTT Configuration

The backend subscribes to `<topic_base>/state` and publishes to `<topic_base>/set` for each registered device.

Default topic mapping for the two built-in LED devices:

| Device | Subscribe (state) | Publish (command) |
|--------|-------------------|-------------------|
| `light_control_1` | `home/hall/light/state` | `home/hall/light/set` |
| `light_control_2` | `home/hall/light2/state` | `home/hall/light2/set` |

For Mosquitto to accept connections from the ESP32 on your LAN, add the following to your `mosquitto.conf`:

```conf
listener 1883
allow_anonymous true
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/chat` | Send a natural-language message to the AI agent |
| `GET` | `/state` | Get current state of all registered devices |
| `POST` | `/devices` | Register a new MQTT device |
| `DELETE` | `/devices/{name}` | Delete a registered device |
| `POST` | `/devices/{name}/command` | Send `ON` or `OFF` to a device |
| `GET` | `/devices/{name}/preview` | Get the latest camera preview frame (JPEG) |
| `GET` | `/logs` | Retrieve recent activity logs |
| `GET` | `/workflows` | List all automation workflows |
| `POST` | `/workflows` | Create a new automation workflow |
| `PATCH` | `/workflows/{id}/toggle` | Enable or disable a workflow |
| `POST` | `/workflows/{id}/run` | Manually execute a workflow |
| `DELETE` | `/workflows/{id}` | Delete a workflow |
| `WS` | `/ws` | WebSocket for real-time device state updates |

Full interactive docs are available at `http://localhost:8000/docs` when the backend is running.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│  (Vite · Tailwind CSS · WebSocket client)                │
└────────────────────────┬─────────────────────────────────┘
                         │ REST / WebSocket
┌────────────────────────▼─────────────────────────────────┐
│                   FastAPI Backend                        │
│  ┌─────────────┐  ┌───────────┐  ┌──────────────────┐   │
│  │  AI Agent   │  │  Storage  │  │ Execution Engine  │   │
│  │ (OpenAI)    │  │ (JSON)    │  │ (workflows)       │   │
│  └─────────────┘  └───────────┘  └──────────────────┘   │
└────────────────────────┬─────────────────────────────────┘
                         │ MQTT publish / subscribe
              ┌──────────▼──────────┐
              │  Mosquitto Broker   │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │  ESP32 Hardware     │
              │  (LED / sensors)    │
              └─────────────────────┘
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository and create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes and add tests where applicable.
3. Run the backend tests and ensure the frontend builds without errors.
4. Open a pull request with a clear description of what was changed and why.

Please keep pull requests focused on a single concern and follow the existing code style.

## License

This project is released under the [MIT License](LICENSE).
