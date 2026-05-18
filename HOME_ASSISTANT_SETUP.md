# 🏠 Home Assistant Integration Guide

IoT-Claw can seamlessly integrate with **Home Assistant** to control all your HA entities directly through the IoT-Claw dashboard and AI voice commands. This guide walks you through the complete setup process.

---

## 📋 Prerequisites

- **Home Assistant** installed and running (2024.1 or later recommended)
- **Network access** between IoT-Claw and Home Assistant (same network or VPN)
- **Long-Lived Access Token** from Home Assistant
- **IoT-Claw backend** running with environment variable support

---

## 🔑 Step 1: Generate Home Assistant Token

### Option A: Using Home Assistant UI (Recommended)

1. Open Home Assistant dashboard at `http://<HA_IP>:8123/`
2. Go to **Settings → Devices & Services → Automations & Scenes**
3. Click your **profile icon** (bottom left) → **Create Long-Lived Access Token**
4. Give it a name like `iot-claw-integration`
5. Copy the token immediately — you won't see it again!

### Option B: Using Home Assistant CLI

If you have SSH access to the Home Assistant machine:

```bash
ha auth list  # Shows existing tokens
ha auth create --name "iot-claw-integration"  # Creates new token
```

---

## 🔌 Step 2: Configure IoT-Claw Backend

### Environment Variables

Add these variables to your `.env` file or system environment:

```env
# Home Assistant Connection
HA_HOST=192.168.1.100          # IP or hostname of your HA instance
HA_PORT=8123                    # Default HA port (or 443 if using HTTPS)
HA_TOKEN=eyJhbGc...            # Long-lived access token from Step 1

# Optional: Filter domains to import (comma-separated)
# If empty, imports ALL domains
# HA_DOMAIN_FILTER=light,switch,sensor,climate,cover

# Optional: HTTPS/SSL
# HA_USE_SSL=false              # Set to true if using https://
```

### Configuration in `backend/.env`

```bash
cd backend
cat > .env << 'EOF'
# Home Assistant
HA_HOST=192.168.1.100
HA_PORT=8123
HA_TOKEN=eyJhbGc...
HA_DOMAIN_FILTER=

# Other required configs
OPENAI_API_KEY=sk-...
MQTT_HOST=localhost
MQTT_PORT=1883
EOF
```

---

## 🚀 Step 3: Start IoT-Claw Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Verify Connection

Check the backend logs for successful HA connection:

```
INFO:app.services.ha_adapter:Connected to Home Assistant
INFO:app.services.ha_adapter:Synced 42 entities from Home Assistant
```

Or visit the **Status API**:

```bash
curl http://localhost:8000/api/status
```

Look for `"ha_adapter"` in the response showing connection status.

---

## 📱 Supported Home Assistant Domains

The adapter automatically imports and controls:

| Domain | Device Type | Control | Status Sync | Notes |
|--------|------------|---------|------------|-------|
| **light** | `ha_light` | ✅ | ✅ | Brightness, color, color temperature |
| **switch** | `ha_switch` | ✅ | ✅ | On/Off control |
| **climate** | `ha_climate` | ✅ | ✅ | Temperature, HVAC mode |
| **fan** | `ha_fan` | ✅ | ✅ | Speed control |
| **cover** | `ha_cover` | ✅ | ✅ | Blinds, garage doors |
| **lock** | `ha_lock` | ✅ | ✅ | Lock/Unlock |
| **media_player** | `ha_media_player` | ✅ | ✅ | Play/Pause/Volume |
| **sensor** | `ha_sensor` | ❌ | ✅ | Read-only measurements |
| **binary_sensor** | `ha_binary_sensor` | ❌ | ✅ | Motion, contact sensors |
| **scene** | `ha_scene` | ✅ | ✅ | Activate scenes |
| **script** | `ha_script` | ✅ | ✅ | Run automations |
| **camera** | `ha_camera` | ❌ | ✅ | Camera feeds |
| **alarm** | `ha_alarm` | ✅ | ✅ | Alarm control panel |

### Excluded Domains

These are automatically filtered out (too noisy):
- `device_tracker`, `zone`, `person`, `weather`, `sun`
- `persistent_notification`, `update`, `button`, `text`

---

## 🎛️ Controlling HA Entities

### Via Dashboard

1. Open the IoT-Claw frontend
2. Go to **Devices** tab
3. HA entities appear with the vendor name **"Home Assistant"**
4. Click any entity to control it (lights dim, switches toggle, etc.)

### Via Chat (Voice Command)

```
User: "Turn on the living room light"
→ IoT-Claw recognizes ha.light.living_room_light and calls the service

User: "Set kitchen temperature to 72°F"
→ Calls climate.set_temperature on the climate entity

User: "Close the garage door"
→ Calls cover.close_cover on the garage door
```

### Via Workflows

1. Create a new workflow in the **Workflow Editor**
2. Add a device action for any HA entity
3. Set up triggers (time, sensor threshold, manual)
4. Save and activate

---

## 🔄 Real-Time Sync

### State Updates Flow

```
Home Assistant
    ↓ (WebSocket: state_changed event)
IoT-Claw Backend
    ↓ (Broadcast via WebSocket)
IoT-Claw Frontend
    ↓ (Display update)
Dashboard
```

All state changes in Home Assistant are reflected in IoT-Claw **within 100ms**.

---

## 🔍 Troubleshooting

### Connection Issues

#### ❌ "Connection refused" / "No route to host"

**Problem:** HA_HOST or HA_PORT is incorrect

**Solution:**
```bash
# Test connectivity from IoT-Claw backend
ping 192.168.1.100
curl http://192.168.1.100:8123/api/
```

**Common Fixes:**
- Use IP address instead of hostname
- Check firewall rules (Home Assistant runs on port 8123 by default)
- If using reverse proxy, use the internal IP, not the proxy URL

#### ❌ "Invalid token"

**Problem:** HA_TOKEN is expired or incorrect

**Solution:**
1. Generate a new token (follow Step 1 again)
2. Update `.env` file
3. Restart IoT-Claw backend

#### ❌ "No entities imported"

**Problem:** Domain filter is too restrictive, or HA has no entities

**Solution:**
```bash
# Remove or clear HA_DOMAIN_FILTER to import all domains
unset HA_DOMAIN_FILTER

# Check HA directly
curl -H "Authorization: Bearer $HA_TOKEN" \
  http://192.168.1.100:8123/api/states | python -m json.tool
```

### Performance Issues

#### Slow response times

1. **Too many entities:** Reduce with domain filter
   ```env
   HA_DOMAIN_FILTER=light,switch,sensor
   ```

2. **Network latency:** 
   - Use IP address instead of hostname
   - Check network speed: `ping 192.168.1.100`

3. **Home Assistant overloaded:**
   - Check HA System Monitor
   - Reduce polling frequency in HA

---

## 🛠️ Advanced Configuration

### Domain Filtering

Only import specific domains to reduce clutter:

```env
# Only import lights, switches, and sensors
HA_DOMAIN_FILTER=light,switch,sensor
```

### Custom Area Names

HA entities display with their area name automatically:
- Light in "Living Room" area → shows as `light.living_room_light (Living Room)`

To organize:
1. In Home Assistant → Settings → Areas
2. Assign devices to areas
3. Restart IoT-Claw

### Debugging

Enable debug logging:

```bash
export LOGLEVEL=DEBUG
python -m uvicorn app.main:app --log-level debug
```

Look for `HomeAssistantAdapter` debug messages.

---

## 📊 Monitoring Integration

### Check HA Status

```bash
curl -s http://localhost:8000/api/status | python -m json.tool | grep -A 10 ha_adapter
```

Output:
```json
{
  "ha_adapter": {
    "connected": true,
    "host": "192.168.1.100",
    "port": 8123,
    "entity_count": 42,
    "domain_filter": "all"
  }
}
```

### View HA Devices in IoT-Claw

```bash
# Get all devices (includes HA entities)
curl http://localhost:8000/api/devices | python -m json.tool
```

Filter for HA devices:
```python
import requests
resp = requests.get('http://localhost:8000/api/devices')
ha_devices = [d for d in resp.json().values() if d.get('ha_entity')]
print(f"Found {len(ha_devices)} Home Assistant devices")
```

---

## 🔒 Security Considerations

1. **Token Security**
   - Never commit `.env` to git
   - Use `git-secrets` hook to prevent accidental token leaks
   - Rotate token every 6 months

2. **Network Security**
   - Keep IoT-Claw and HA on same network or VPN
   - Use firewall rules to limit access
   - Consider HTTPS with valid certificates

3. **API Permissions**
   - The long-lived token has broad access
   - Consider creating a restricted service account in future HA versions

---

## 📞 Support & Debugging

### Useful Commands

```bash
# Test HA connection directly
curl -s -H "Authorization: Bearer $HA_TOKEN" \
  http://$HA_HOST:$HA_PORT/api/states | wc -l

# Check if entity exists
curl -s -H "Authorization: Bearer $HA_TOKEN" \
  http://$HA_HOST:$HA_PORT/api/states/light.living_room

# Monitor WebSocket connection
wscat -c ws://$HA_HOST:$HA_PORT/api/websocket
```

### Common Issues Checklist

- [ ] HA_HOST and HA_PORT are correct
- [ ] HA_TOKEN is valid and not expired
- [ ] Home Assistant is running and accessible
- [ ] Network connectivity confirmed (ping works)
- [ ] Backend logs show "Connected to Home Assistant"
- [ ] At least one device/entity exists in HA
- [ ] Domain filter (if set) includes desired entities

---

## 🎯 Next Steps

1. ✅ Set up HA integration
2. 📝 Create workflows using HA entities
3. 🎙️ Test voice commands with HA devices
4. 🔄 Set up automations in Workflow Editor
5. 📱 Add push notifications for HA state changes

Enjoy seamless Home Assistant integration! 🎉
