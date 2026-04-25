#include <WiFi.h>
#include <PubSubClient.h>

// Wi-Fi
const char* WIFI_SSID = "Students_Wifi";
const char* WIFI_PASSWORD = "students@789";

// MQTT broker
const char* MQTT_BROKER = "10.10.24.24";  // Replace with your PC's LAN IP
const int MQTT_PORT = 1883;
const char* MQTT_CLIENT_ID = "iotclaw_esp32_dual_led";

// Device topics. These must match the devices you register in the backend.
const char* LED1_SET_TOPIC = "home/hall/light/set";
const char* LED1_STATE_TOPIC = "home/hall/light/state";
const char* LED2_SET_TOPIC = "home/hall/light2/set";
const char* LED2_STATE_TOPIC = "home/hall/light2/state";

// GPIO pins
const int LED1_PIN = 26;
const int LED2_PIN = 27;
const int STATUS_LED_PIN = 2;  // Built-in LED on many ESP32 boards

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

void setOutputState(int pin, bool on) {
  digitalWrite(pin, on ? HIGH : LOW);
}

void publishCurrentStates() {
  mqttClient.publish(LED1_STATE_TOPIC, digitalRead(LED1_PIN) == HIGH ? "ON" : "OFF", true);
  mqttClient.publish(LED2_STATE_TOPIC, digitalRead(LED2_PIN) == HIGH ? "ON" : "OFF", true);
}

void handleCommand(const String& topic, const String& payload) {
  bool validState = (payload == "ON" || payload == "OFF");
  if (!validState) {
    return;
  }

  bool turnOn = payload == "ON";

  if (topic == LED1_SET_TOPIC) {
    setOutputState(LED1_PIN, turnOn);
    mqttClient.publish(LED1_STATE_TOPIC, turnOn ? "ON" : "OFF", true);
  } else if (topic == LED2_SET_TOPIC) {
    setOutputState(LED2_PIN, turnOn);
    mqttClient.publish(LED2_STATE_TOPIC, turnOn ? "ON" : "OFF", true);
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  handleCommand(String(topic), message);
}

void connectWifi() {
  Serial.println();
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    delay(300);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  digitalWrite(STATUS_LED_PIN, HIGH);
}

void reconnectMqtt() {
  while (!mqttClient.connected()) {
    Serial.print("Connecting to Mosquitto MQTT at ");
    Serial.print(MQTT_BROKER);
    Serial.println("...");
    
    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println("MQTT connected successfully!");
      mqttClient.subscribe(LED1_SET_TOPIC, 1);
      mqttClient.subscribe(LED2_SET_TOPIC, 1);
      publishCurrentStates();
    } else {
      Serial.print("MQTT connection failed, state: ");
      Serial.println(mqttClient.state());
      Serial.println("Retrying in 2 seconds...");
      digitalWrite(STATUS_LED_PIN, LOW);
      delay(2000);
      digitalWrite(STATUS_LED_PIN, HIGH);
    }
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);

  setOutputState(LED1_PIN, false);
  setOutputState(LED2_PIN, false);
  digitalWrite(STATUS_LED_PIN, LOW);

  connectWifi();

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }

  if (!mqttClient.connected()) {
    reconnectMqtt();
  }

  mqttClient.loop();
}
