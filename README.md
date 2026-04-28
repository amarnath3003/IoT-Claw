# IoT-Claw

![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688?logo=fastapi)
![MQTT](https://img.shields.io/badge/MQTT-Mosquitto-660066?logo=eclipsemosquitto)
![License](https://img.shields.io/badge/License-MIT-green)

IoT-Claw is an open-source IoT dashboard that lets you monitor and control smart home devices through a conversational AI interface. It connects a React frontend to a FastAPI backend that manages MQTT-based devices, automation workflows, and a simulated security camera.

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
