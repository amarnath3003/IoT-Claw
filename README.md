# 🤖 IoT Claw - Intelligent IoT Automation Platform

> Control your smart home and IoT devices with **natural language AI** — no complicated configurations required.

IoT Claw is a full-stack IoT automation platform that bridges the gap between physical devices and intelligent automation. Control lights, fans, cameras, sensors, and custom devices using conversational AI, visual workflows, and real-time monitoring from a sleek control dashboard.

## ✨ Key Features

### 🎯 AI-Powered Device Control
- **Natural Language Interface** — "Turn on the living room light" or "Blink the LED 3 times"
- **Intent Recognition** — Understands context and device relationships automatically
- **Multi-Step Automation** — "Turn on fan, wait 10 seconds, turn off" in a single command
- **Smart Device Matching** — Automatically infers which device you're referring to

### 📱 Comprehensive Device Support
- **Switches & Dimmers** — Control lights, fans, pumps, and relays
- **Sensors** — Real-time temperature, humidity, motion, and custom sensor readings
- **Security Cameras** — Built-in face and body detection with Telegram alerts
- **Custom Devices** — Easily add any MQTT-enabled device via the dashboard
- **ESP32 Hardware** — Out-of-the-box Arduino sketches for instant hardware integration

### 🔄 Visual Workflow Builder
- **Drag-and-drop Workflow Designer** — Create complex automations visually
- **Trigger Types** — Schedule (time-based), Sensor (threshold-based), Chat (voice command)
- **Multi-Step Sequences** — Chain device actions, delays, and conditions
- **Real-time Execution** — Workflows run instantly with WebSocket state sync

### 🎨 Modern Control Dashboard
- **Neumorphic Design System** — Hardware-inspired interface with glass morphism effects
- **Real-time Status Updates** — WebSocket-powered live device state
- **Device Management** — Register, configure, and monitor all devices from one place
- **Chat History** — Keep track of all automation requests and responses
- **Dark Terminal Aesthetic** — Optimized for extended monitoring sessions

### 🔌 MQTT-First Architecture
- **Broker Agnostic** — Works with any MQTT broker (Mosquitto, HiveMQ, CloudMQTT)
- **Topic-Based Organization** — Standard topic structure for easy device mapping
- **Retained State** — Devices always report their current state
- **Local Network Support** — Control devices over LAN without internet dependency

## 🚀 Quick Start

### Prerequisites
- **Python 3.8+** (Backend)
- **Node.js 16+** (Frontend)
- **MQTT Broker** (Mosquitto recommended)
- **OpenAI API Key** (for AI agent)
- **ESP32 Development Board** (optional, for hardware integration)

### Installation

#### 1. Clone & Install Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

#### 2. Configure Environment
Create `backend/.env`:
```env
OPENAI_API_KEY=sk-proj-your-key-here
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
STORAGE_FILE=storage.json
EXECUTION_ENGINE_INTERVAL=5
```

#### 3. Start MQTT Broker
```bash
# Using Mosquitto (Windows)
mosquitto -c mosquitto.conf

# Or Docker
docker run -it -p 1883:1883 eclipse-mosquitto
```

#### 4. Start Backend
```bash
cd backend
python main.py
```
Backend runs on `http://localhost:8000`

#### 5. Install & Start Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`

#### 6. Add Devices
Choose one method:

**Via Chat:**
```
Register a new device: light_control_1 in the living room
```

**Via API:**
```bash
curl -X POST http://localhost:8000/devices \
  -H "Content-Type: application/json" \
  -d '{
    "name": "light_control_1",
    "topic_base": "home/living_room/light",
    "type": "switch",
    "location": "living room",
    "description": "Main ceiling light"
  }'
```

**Via Dashboard:**
Use the Device Manager UI on the frontend

## 🛠️ Hardware Setup

### ESP32 MQTT Configuration

**Wiring (for dual LED control):**
- GPIO 26 → Resistor (220Ω) → LED1 Anode → LED1 Cathode → GND
- GPIO 27 → Resistor (220Ω) → LED2 Anode → LED2 Cathode → GND

**Upload Sketch:**
1. Open `hardware/esp32_dual_led_mqtt/esp32_dual_led_mqtt.ino` in Arduino IDE
2. Replace:
   - `YOUR_WIFI_NAME` with your WiFi SSID
   - `YOUR_WIFI_PASSWORD` with your WiFi password
   - `192.168.1.100` with your PC's LAN IP (check with `ipconfig`)
3. Install `PubSubClient` library (Tools → Manage Libraries)
4. Upload to ESP32

**Verify Connection:**
```bash
mosquitto_sub -h localhost -t home/hall/#
```

Then via chat: *"Turn on light_control_1"*

Expected output:
```
home/hall/light/set ON
home/hall/light/state ON
```

## 🏠 Home Assistant Integration

IoT-Claw can integrate with **Home Assistant** to control all your HA entities directly through the dashboard and AI commands. All HA devices are auto-imported and synced in real-time.

**Supported Domains:** Lights, switches, climate, fans, covers, locks, media players, cameras, scenes, and more.

**Quick Setup:**
1. Generate a long-lived access token in Home Assistant
2. Add environment variables to `backend/.env`:
   ```env
   HA_HOST=192.168.1.100
   HA_PORT=8123
   HA_TOKEN=eyJhbGc...
   ```
3. Restart backend → All HA entities appear in IoT-Claw

**Full Guide:** See [HOME_ASSISTANT_SETUP.md](HOME_ASSISTANT_SETUP.md) for detailed setup, configuration, troubleshooting, and advanced options.

## 💬 Chat Examples

### Device Control
```
User: Turn on the living room light
Agent: ✓ Turned on living_room_light

User: Dim the bedroom light to 40%
Agent: ✓ Set bedroom_light brightness to 40%

User: Blink the red LED 5 times
Agent: ✓ Blinking red_led 5 times
```

### Automation
```
User: Create a morning routine that turns on all lights at 7 AM
Agent: ✓ Created workflow: morning_routine
        Trigger: Schedule 07:00
        Actions: [turn on living_room_light, turn on bedroom_light]

User: Turn on the fan and turn it off after 10 seconds
Agent: ✓ Executed sequence
        1. Turned on fan
        2. Wait 10 seconds
        3. Turned off fan
```

### Status & Monitoring
```
User: What devices do I have?
Agent: You have 5 devices:
       • living_room_light (switch) - ON
       • bedroom_light (dimmable_switch) - OFF
       • ceiling_fan (switch) - ON
       • temperature_sensor (sensor) - 24.5°C
       • security_camera (camera) - ONLINE

User: Read the temperature
Agent: Current temperature: 24.5°C (comfortable)
```

## 📁 Project Structure

```
IoT-Claw/
├── backend/
│   ├── main.py                 # FastAPI app & endpoints
│   ├── ai_agent.py             # OpenAI integration & chat logic
│   ├── mqtt_client.py          # MQTT publish/subscribe
│   ├── storage.py              # Device registry & persistence
│   ├── execution_engine.py     # Workflow execution scheduler
│   ├── security_camera.py      # Camera simulator & detection
│   └── requirements.txt        # Python dependencies
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Main app component
│   │   ├── pages/              # Dashboard, device mgmt, chat
│   │   ├── components/         # Neumorphic UI components
│   │   └── styles/             # Tailwind & design system
│   ├── package.json            # Node dependencies
│   └── vite.config.js          # Build configuration
│
├── hardware/
│   ├── ESP32_SETUP.md          # Hardware guide
│   └── esp32_dual_led_mqtt/    # Arduino sketch
│
└── README.md                   # This file
```

## 🔌 API Reference

### Device Management

**Get All Devices**
```bash
GET /state
```

**Register Device**
```bash
POST /devices
{
  "name": "living_room_light",
  "topic_base": "home/living_room/light",
  "type": "switch",
  "location": "living room",
  "description": "Main ceiling light"
}
```

**Control Device**
```bash
POST /chat
{
  "message": "Turn on living_room_light",
  "history": []
}
```

### WebSocket

**Real-time State Updates**
```javascript
const ws = new WebSocket('ws://localhost:8000/ws');
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'state') {
    console.log('Devices:', message.data);
  }
};
```

## 🎨 Design System

The UI uses a **Neumorphic Hardware Console** aesthetic:
- Deep black backgrounds (`#1a1d21`)
- Warm orange accents (`#ff6b00`)
- Glass morphism effects for depth
- Monospace terminal fonts for logs
- LED-style status indicators with glows

See `skill.md` for the complete design component library.

## 🔐 Security Features

- **API Key Management** — Secure OpenAI API key storage via `.env`
- **CORS Protection** — Restricted to whitelisted frontend origins
- **Local MQTT** — No cloud dependency; devices communicate locally
- **State Persistence** — Encrypted device storage with backup

## 🧪 Testing

### Manual Testing Checklist

1. **Backend Health**
   ```bash
   curl http://localhost:8000/state
   ```

2. **Chat Interface**
   - Send message: "What devices do I have?"
   - Verify: AI responds with device list

3. **Device Control**
   - Via chat: "Turn on light_control_1"
   - Check dashboard: State updates in real-time

4. **MQTT Verification**
   ```bash
   mosquitto_sub -h localhost -t home/#
   ```
   Then control device via chat and verify message appears

## 📊 Monitoring

### View Logs
```bash
# Backend
tail -f backend.log

# MQTT
mosquitto_sub -h localhost -t '#' -v
```

### Check Device State
```bash
# API call
curl http://localhost:8000/state | jq

# WebSocket
nc -l localhost 8000  # Connect and watch messages
```

## 🚀 Deployment

### Docker Deployment

**docker-compose.yml**
```yaml
version: '3'
services:
  mqtt:
    image: eclipse-mosquitto
    ports:
      - "1883:1883"
  
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - MQTT_BROKER_HOST=mqtt
    depends_on:
      - mqtt
  
  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
```

Run with:
```bash
docker-compose up
```

## 🛣️ Roadmap

- [ ] Mobile app (React Native)
- [ ] Cloud sync with local fallback
- [ ] Advanced workflow conditions (if/else logic)
- [ ] Device grouping (rooms, zones)
- [ ] Voice control via speech-to-text
- [x] Integration with Home Assistant ✅ (See [HOME_ASSISTANT_SETUP.md](HOME_ASSISTANT_SETUP.md))
- [ ] Energy monitoring & analytics
- [ ] Webhook triggers for external services

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License — see the LICENSE file for details.

## 💡 Tips & Tricks

### Reducing MQTT Latency
Set `EXECUTION_ENGINE_INTERVAL=1` in `.env` for faster automation execution (default is 5 seconds)

### Adding Custom Device Types
Edit `backend/storage.py` and add new type to the `DEVICE_TYPES` constant

### Debugging Chat Commands
Enable verbose logging by running backend with:
```bash
DEBUG=true python main.py
```

### Persistent State Across Restarts
Device state is automatically saved to `storage.json` and restored on startup

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| ESP32 not connecting to MQTT | Check PC firewall; ensure Mosquitto is listening on `0.0.0.0:1883` |
| Devices show OFF but LED is ON | MQTT state is stale; send `Turn off device_name` to sync |
| Chat returns 401 error | Check OpenAI API key in `.env` |
| WebSocket connection fails | Ensure frontend and backend are on same origin |
| Workflow not executing | Verify execution engine interval in `.env` (default 5s) |

## 📞 Support

- 📧 Email: amarnathdevraj2005@gmail.com
- 🐛 Issues: Open an issue on GitHub
- 💬 Discussions: Use GitHub Discussions for feature requests

---

**Made with ❤️ by the IoT Claw Team**
