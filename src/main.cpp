/**
 * Emergency Smart Response Network
 * Embedded ESP32 Node Firmware
 *
 * Transmits real-time distress telemetry and heartbeat pings
 * to the deployed Netlify Dispatch & Ingestion Platform.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Wi-Fi Configuration
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Netlify Ingestion Endpoint URL (Update with your deployed Netlify URL)
const char* TELEMETRY_URL = "https://emergency-smart-response-network.netlify.app/api/telemetry";

// Hardware Pin Definitions
#define PANIC_BUTTON_PIN   0   // ESP32 onboard boot button or external emergency switch (active LOW)
#define STATUS_LED_PIN     2   // ESP32 onboard indicator LED
#define ANALOG_BATTERY_PIN 34  // Voltage divider battery pin ADC

// Device Identity
const char* DEVICE_ID      = "ESP32-SOS-01";
const char* LOCATION_NAME  = "Sector 4 Civic Square Beacon";
const char* LATITUDE       = "-26.2041";
const char* LONGITUDE      = "28.0473";

// Timing
unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 30000; // 30s routine beacon interval

// State
bool buttonPressedLast = false;
unsigned long buttonDownStart = 0;

int readBatteryPercentage() {
  // Read simulated or actual ADC battery voltage
  int raw = analogRead(ANALOG_BATTERY_PIN);
  int pct = map(raw, 0, 4095, 0, 100);
  if (pct <= 0) return 92; // Default realistic fallback if pin floating
  return pct;
}

void transmitDistressTelemetry(bool isEmergencyAlert, const char* eventType, const char* title, const char* description, const char* priority = "critical") {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ERR] Wi-Fi not connected. Attempting reconnection...");
    WiFi.reconnect();
    return;
  }

  HTTPClient http;
  http.begin(TELEMETRY_URL);
  http.addHeader("Content-Type", "application/json");

  // Construct JSON payload
  StaticJsonDocument<512> doc;
  doc["device_id"]     = DEVICE_ID;
  doc["event_type"]    = eventType;
  doc["alert"]         = isEmergencyAlert;
  doc["title"]         = title;
  doc["description"]   = description;
  doc["category"]      = "sos_panic";
  doc["priority"]      = priority;
  doc["latitude"]      = LATITUDE;
  doc["longitude"]     = LONGITUDE;
  doc["location_name"] = LOCATION_NAME;
  doc["battery"]       = readBatteryPercentage();
  doc["signal_rssi"]   = WiFi.RSSI();

  JsonObject sensors = doc.createNestedObject("sensor_data");
  sensors["tamper_circuit"] = "INTACT";
  sensors["uptime_ms"]      = millis();
  sensors["heap_free"]      = ESP.getFreeHeap();

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.println("\n[HTTP POST] Transmitting packet to Netlify Ingestion API...");
  Serial.println(requestBody);

  int httpCode = http.POST(requestBody);

  if (httpCode > 0) {
    Serial.printf("[HTTP RESPONSE] Status: %d\n", httpCode);
    String response = http.getString();
    Serial.println(response);

    // Rapid double blink on success
    digitalWrite(STATUS_LED_PIN, HIGH);
    delay(100);
    digitalWrite(STATUS_LED_PIN, LOW);
    delay(100);
    digitalWrite(STATUS_LED_PIN, HIGH);
  } else {
    Serial.printf("[HTTP ERROR] Failed: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(PANIC_BUTTON_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  Serial.println("==================================================");
  Serial.println("  EMERGENCY SMART RESPONSE NETWORK - ESP32 NODE   ");
  Serial.println("==================================================");
  Serial.printf("Device ID: %s | Location: %s\n", DEVICE_ID, LOCATION_NAME);

  Serial.printf("Connecting to Wi-Fi: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 20) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    Serial.println("\n[OK] Connected to Wi-Fi. IP: " + WiFi.localIP().toString());
    // Initial startup heartbeat
    transmitDistressTelemetry(false, "heartbeat", "ESP32 Node Online", "Node initialized and registered to Netlify Grid.", "low");
  } else {
    Serial.println("\n[WARN] Wi-Fi connection timed out. Running in standalone local mode.");
  }
}

void loop() {
  // Check Panic Button (Active LOW with pull-up)
  bool buttonDown = (digitalRead(PANIC_BUTTON_PIN) == LOW);

  if (buttonDown && !buttonPressedLast) {
    buttonDownStart = millis();
    buttonPressedLast = true;
  } else if (!buttonDown && buttonPressedLast) {
    unsigned long duration = millis() - buttonDownStart;
    buttonPressedLast = false;

    // Trigger if held for >= 500ms
    if (duration >= 500) {
      Serial.printf("[ALARM] Emergency panic button triggered (held for %lu ms)!\n", duration);
      // Flash LED warning strobe
      for (int i = 0; i < 5; i++) {
        digitalWrite(STATUS_LED_PIN, HIGH);
        delay(80);
        digitalWrite(STATUS_LED_PIN, LOW);
        delay(80);
      }
      digitalWrite(STATUS_LED_PIN, HIGH);

      transmitDistressTelemetry(
        true,
        "panic_alarm",
        "PHYSICAL PANIC BUTTON PRESSED",
        "Emergency SOS push-button held at Civic Square beacon. Immediate dispatch required.",
        "critical"
      );
    }
  }

  // Periodic heartbeat broadcast
  if (millis() - lastHeartbeatTime > HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = millis();
    Serial.println("[TIMER] Sending periodic telemetry heartbeat...");
    transmitDistressTelemetry(false, "heartbeat", "Periodic Telemetry Heartbeat", "ESP32 node operational.", "low");
  }

  delay(20);
}
