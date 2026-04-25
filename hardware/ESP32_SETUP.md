# ESP32 MQTT Setup

This project's backend currently controls devices by publishing MQTT commands to:

- `<topic_base>/set`

And it updates dashboard state when a device publishes to:

- `<topic_base>/state`

That is defined in:

- [mqtt_client.py](C:\Users\amarn\OneDrive\Desktop\kochi\The-IOT-Claw\IoT-Claw\backend\mqtt_client.py)
- [storage.py](C:\Users\amarn\OneDrive\Desktop\kochi\The-IOT-Claw\IoT-Claw\backend\storage.py)
- [ai_agent.py](C:\Users\amarn\OneDrive\Desktop\kochi\The-IOT-Claw\IoT-Claw\backend\ai_agent.py)

## Hardware you can build right now

With your current parts, the cleanest first real-world output is:

- LED 1 on GPIO 26 -> device `light_control_1`
- LED 2 on GPIO 27 -> device `light_control_2`

Each LED needs:

1. ESP32 GPIO pin -> resistor -> LED anode (+)
2. LED cathode (-) -> GND

If the LED does not turn on, rotate that LED; polarity is wrong.

## Topic mapping

Use these MQTT topics:

- `home/hall/light/set`
- `home/hall/light/state`
- `home/hall/light2/set`
- `home/hall/light2/state`

The included sketch subscribes to both `/set` topics and publishes retained `/state` updates.

## Register the devices in your backend

Your backend already has `light_control_1` registered in [storage.json](C:\Users\amarn\OneDrive\Desktop\kochi\The-IOT-Claw\IoT-Claw\backend\storage.json), using:

- `topic_base = home/hall/light`

Add the second LED device with either the UI, chat, or API:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/devices `
  -ContentType 'application/json' `
  -Body '{"name":"light_control_2","topic_base":"home/hall/light2","type":"switch","location":"hall","description":"Second ESP32 LED"}'
```

## ESP32 sketch

Use:

- [esp32_dual_led_mqtt.ino](C:\Users\amarn\OneDrive\Desktop\kochi\The-IOT-Claw\IoT-Claw\hardware\esp32_dual_led_mqtt\esp32_dual_led_mqtt.ino)

Before uploading, replace:

- `YOUR_WIFI_NAME`
- `YOUR_WIFI_PASSWORD`
- `192.168.1.100` with your PC's LAN IP

## Arduino IDE libraries

Install:

1. `PubSubClient` by Nick O'Leary

`WiFi.h` is built into the ESP32 board package.

## Broker reachability

Your backend is configured to connect to MQTT at `localhost:1883` from [backend/.env](C:\Users\amarn\OneDrive\Desktop\kochi\The-IOT-Claw\IoT-Claw\backend\.env).

That is fine for the backend, but the ESP32 cannot use `localhost`. It must connect to your PC's Wi-Fi IP, something like `192.168.1.x`.

Check your PC IP in PowerShell:

```powershell
ipconfig
```

Look under your active Wi-Fi adapter for `IPv4 Address`.

You also need Mosquitto to accept LAN clients. Depending on your Windows Mosquitto install, you may need a config like:

```conf
listener 1883
allow_anonymous true
```

If Mosquitto is only listening on loopback, the backend will work and the ESP32 will fail. That is the main thing to verify.

## End-to-end test

1. Start Mosquitto.
2. Start backend on port 8000.
3. Upload the ESP32 sketch.
4. Open the frontend.
5. Turn on LED 1:

```text
Turn on light_control_1
```

6. Turn on LED 2:

```text
Turn on light_control_2
```

7. Confirm state updates arrive in the dashboard.

## Low-level MQTT test

From your PC, verify the broker is receiving state:

```powershell
mosquitto_sub -h localhost -v -t home/hall/#
```

Then from chat or API, send:

```text
Turn off light_control_1
```

You should see:

```text
home/hall/light/set OFF
home/hall/light/state OFF
```

## Current constraint in your backend

`mqtt.publish(...)` currently returns failure if the broker is unreachable. Your logs already show failed publishes before hardware was connected. That means the software path is correct enough to test against real hardware now; the remaining work is broker reachability plus the ESP32 sketch.
