# 🚀 Future Work: IoT-Claw Roadmap

To transition **IoT-Claw** from a powerful project showcase into a production-grade, real-world usable platform, the following features are proposed. These focus on security, interoperability, long-term data management, and user experience.

---

## 🔒 1. Security & Access Control
Moving beyond a single-tenant model to support secure, shared environments.
- **Role-Based Access Control (RBAC):** Implement JWT-based authentication in the React dashboard with roles like *Admin* (full control) and *Guest* (view-only or limited toggle access).
- **MQTT over TLS (MQTTS):** Secure the communication between ESP32 devices and the Mosquitto broker using SSL/TLS certificates to prevent credential sniffing and man-in-the-middle attacks.

## 🌐 2. Commercial Hardware & Protocol Integration
Expanding the ecosystem beyond custom-flashed ESP32s.
- **Matter & Zigbee Support:** Integrate `zigbee2mqtt` or Matter-compatible bridges. This allows the AI Agent to control standard commercial devices (Philips Hue, IKEA, Aqara) natively.
- **RTSP IP Camera Integration:** Embed live camera streams into the dashboard. Use a Vision Language Model (VLM) for automated security analysis (e.g., "Alert me if a delivery person is at the door").

## 🧠 3. Advanced AI & User Experience (UX)
Making the system more intuitive and accessible.
- **Local Voice Assistant:** Integrate a local wake-word engine (like Porcupine) and Speech-to-Text (STT) for hands-free AI interaction.
- **Visual Workflow Builder:** A drag-and-drop node editor (similar to Node-RED or React Flow) for complex automation logic, providing a non-code alternative to MicroPython scripting.
- **PWA & Native Notifications:** Convert the dashboard into a Progressive Web App (PWA) with Web Push Notifications for critical alerts (e.g., "Leak detected in kitchen").

## 📈 4. Infrastructure & Reliability
Scaling the backend for long-term production use.
- **Time-Series Database (InfluxDB/SQLite):** Migrate telemetry from in-memory buffers to a persistent database. This enables long-term historical analysis and trend reporting.
- **Energy Monitoring & Analytics:** Track device uptime and power ratings to provide real-time energy consumption dashboards and monthly cost estimation.
- **Core Firmware OTA:** A secure mechanism to update the core `micropython_edge_agent.py` logic across all devices remotely without physical USB access.

---

## 🎯 Next Priority Candidates
- **Vision AI Integration:** High "wow" factor with practical security benefits.
- **Persistent Telemetry (Time-Series DB):** Essential for moving from a "real-time only" view to a data-rich historical dashboard.
