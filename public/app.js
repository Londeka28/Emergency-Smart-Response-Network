// Emergency Smart Response Network - Operations Command Client
// Netlify Functions + Netlify Database backend

let incidents = [];
let devices = [];
let telemetryLogs = [];
let stats = {};
let currentFilter = "active";
let searchQuery = "";
let audioEnabled = true;
let audioCtx = null;

// Audio Alerts (Web Audio API)
function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
}

function playTone(freq1, freq2, duration) {
  if (!audioEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq1, audioCtx.currentTime);
    if (freq2) {
      osc.frequency.exponentialRampToValueAtTime(freq2, audioCtx.currentTime + duration);
    }

    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.warn("Audio error:", e);
  }
}

function playAlarmChime() {
  playTone(880, 587, 0.35);
  setTimeout(() => playTone(880, 587, 0.35), 400);
}

function playChime() {
  playTone(523, 1046, 0.25);
}

// Toast Notifications
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "toast-error" : type === "success" ? "toast-success" : ""}`;
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Modal Helpers
window.openModal = function (modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add("open");
};

window.closeModal = function (modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove("open");
};

// Formatting
function formatTimeAgo(isoDate) {
  if (!isoDate) return "Just now";
  const diffSec = Math.floor((new Date() - new Date(isoDate)) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return new Date(isoDate).toLocaleDateString();
}

function formatBadgeCategory(cat) {
  const map = {
    medical: "MED EMS",
    fire: "FIRE / HAZ",
    sos_panic: "DISTRESS SOS",
    crash: "CRASH IMPACT",
    security: "PATROL",
  };
  return map[cat] || cat.toUpperCase();
}

// Clock
function updateClock() {
  const now = new Date();
  const utcStr = now.toUTCString().split(" ")[4] + " UTC";
  document.getElementById("liveClock").innerText = utcStr;
}
setInterval(updateClock, 1000);
updateClock();

// API Calls
async function fetchAllData() {
  try {
    await Promise.all([fetchStats(), fetchIncidents(), fetchDevices(), fetchTelemetry()]);
  } catch (err) {
    console.error("Fetch data error:", err);
  }
}

async function fetchStats() {
  try {
    const res = await fetch("/api/stats");
    if (!res.ok) return;
    stats = await res.json();
    renderStats();
  } catch (e) {
    console.warn("Stats error", e);
  }
}

async function fetchIncidents() {
  try {
    const res = await fetch("/api/incidents");
    if (!res.ok) return;
    incidents = await res.json();
    renderIncidents();
    renderRadar();
  } catch (e) {
    console.warn("Incidents fetch error", e);
  }
}

async function fetchDevices() {
  try {
    const res = await fetch("/api/devices");
    if (!res.ok) return;
    devices = await res.json();
    renderFleetTable();
    renderRadar();
  } catch (e) {
    console.warn("Devices fetch error", e);
  }
}

async function fetchTelemetry() {
  try {
    const res = await fetch("/api/telemetry");
    if (!res.ok) return;
    telemetryLogs = await res.json();
    renderTelemetryFeed();
  } catch (e) {
    console.warn("Telemetry fetch error", e);
  }
}

// Render Functions
function renderStats() {
  document.getElementById("statActiveIncidents").innerText = stats.active_incidents || 0;
  document.getElementById("statCriticalSub").innerText = `${stats.critical_count || 0} Critical Triage`;
  document.getElementById("statOnlineDevices").innerText = stats.online_devices || 0;
  document.getElementById("statAlertingSub").innerText = `${stats.alerting_devices || 0} In Distress`;
  document.getElementById("statDispatchedUnits").innerText = stats.active_incidents || 0;
  document.getElementById("statResolvedCount").innerText = stats.resolved_count || 0;

  const statusDot = document.getElementById("systemStatusDot");
  const statusText = document.getElementById("systemStatusText");

  if (stats.system_status === "ELEVATED_TRIAGE") {
    statusDot.className = "status-dot elevated";
    statusText.innerText = "ELEVATED ALERTS ACTIVE";
    statusText.style.color = "#f87171";
  } else {
    statusDot.className = "status-dot";
    statusText.innerText = "NOMINAL READY";
    statusText.style.color = "#fff";
  }
}

function renderIncidents() {
  const container = document.getElementById("incidentsList");
  let filtered = incidents.filter((inc) => {
    // Filter status
    if (currentFilter === "active") {
      if (!["reported", "dispatched", "on_scene"].includes(inc.status)) return false;
    } else if (currentFilter !== "all") {
      if (inc.status !== currentFilter) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        inc.incidentCode.toLowerCase().includes(q) ||
        inc.title.toLowerCase().includes(q) ||
        inc.description.toLowerCase().includes(q) ||
        inc.locationAddress.toLowerCase().includes(q) ||
        (inc.assignedUnit && inc.assignedUnit.toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M8 12h8"></path>
        </svg>
        <span>No matching incidents found.</span>
        <button class="btn btn-secondary btn-sm" onclick="seedInitialData(false)" style="margin-top: 8px;">
          Load Demo Incidents
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map((inc) => {
      const isCritical = inc.priority === "critical";
      const isResolved = inc.status === "resolved";

      return `
      <div class="incident-card priority-${inc.priority} status-${inc.status}">
        <div class="incident-top-meta">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="incident-code">${escapeHtml(inc.incidentCode)}</span>
            <span class="badge badge-${inc.priority}">${inc.priority}</span>
            <span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd;">
              ${formatBadgeCategory(inc.category)}
            </span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge badge-status ${inc.status}">${inc.status.replace("_", " ")}</span>
            <span style="font-size: 0.72rem; color: var(--text-dim); font-family: var(--font-mono);">
              ${formatTimeAgo(inc.createdAt)}
            </span>
          </div>
        </div>

        <div class="incident-title">${escapeHtml(inc.title)}</div>
        <div class="incident-desc">${escapeHtml(inc.description)}</div>

        <div class="incident-location-row">
          <span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            ${escapeHtml(inc.locationAddress)}
          </span>
          ${
            inc.reportedByDeviceId
              ? `<span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" stroke-width="2">
                    <rect x="2" y="3" width="20" height="14" rx="2"></rect>
                  </svg>
                  Beacon: ${escapeHtml(inc.reportedByDeviceId)}
                </span>`
              : ""
          }
        </div>

        <div class="incident-unit-row">
          <div class="assigned-unit-tag">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="7" r="4"></circle>
              <path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"></path>
            </svg>
            ${
              inc.assignedUnit
                ? `<span>Unit: <strong>${escapeHtml(inc.assignedUnit)}</strong></span>`
                : `<span style="color: var(--text-dim);">No Unit Assigned (Pending)</span>`
            }
          </div>

          <div class="incident-actions-btn-group">
            <button class="btn btn-secondary btn-sm" onclick="viewIncidentDetails(${inc.id})">
              Log Details
            </button>
            ${
              inc.status === "reported"
                ? `<button class="btn btn-accent btn-sm" onclick="quickDispatch(${inc.id})">Dispatch Unit</button>`
                : inc.status === "dispatched"
                ? `<button class="btn btn-secondary btn-sm" onclick="quickStatusChange(${inc.id}, 'on_scene')">Mark On-Scene</button>`
                : inc.status === "on_scene"
                ? `<button class="btn btn-primary btn-sm" onclick="quickStatusChange(${inc.id}, 'resolved')">Resolve</button>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderRadar() {
  const container = document.getElementById("radarBlipsContainer");
  const countLabel = document.getElementById("radarNodesCount");

  // Plot devices and incidents on radar
  let itemsToPlot = [];

  devices.forEach((dev) => {
    // Normalization of lat/lon to percentage (centered on Johannesburg area -26.2041, 28.0473)
    const lat = parseFloat(dev.latitude) || -26.2041;
    const lon = parseFloat(dev.longitude) || 28.0473;
    const xPct = Math.min(Math.max(50 + (lon - 28.0473) * 1200, 10), 90);
    const yPct = Math.min(Math.max(50 - (lat - -26.2041) * 1200, 10), 90);

    itemsToPlot.push({
      id: dev.deviceId,
      label: dev.deviceId,
      type: "device",
      status: dev.status,
      x: xPct,
      y: yPct,
      title: `${dev.deviceName} (${dev.status})`,
    });
  });

  countLabel.innerText = `${itemsToPlot.length} NODES PLOTTED`;

  container.innerHTML = itemsToPlot
    .map((item) => {
      const isAlerting = item.status === "alerting";
      return `
      <div class="radar-blip" style="left: ${item.x}%; top: ${item.y}%;" title="${escapeHtml(item.title)}">
        <div class="blip-circle ${isAlerting ? "alerting" : ""}"></div>
        <div class="blip-label">${escapeHtml(item.label)}</div>
      </div>
    `;
    })
    .join("");
}

function renderTelemetryFeed() {
  const container = document.getElementById("telemetryFeedContainer");
  if (!telemetryLogs || telemetryLogs.length === 0) {
    container.innerHTML = `<div class="empty-state"><span>No telemetry packets recorded yet.</span></div>`;
    return;
  }

  container.innerHTML = telemetryLogs
    .slice(0, 15)
    .map((log) => {
      const isAlert = ["panic_alarm", "smoke_detected", "collision_impact"].includes(log.eventType);
      return `
      <div class="telemetry-entry ${isAlert ? "alert" : ""}">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="telemetry-time">${formatTimeAgo(log.createdAt)}</span>
          <span class="telemetry-dev">${escapeHtml(log.deviceId)}</span>
          <span class="telemetry-type">[${escapeHtml(log.eventType)}]</span>
        </div>
        <div class="telemetry-meta">
          ${log.battery !== null ? `Bat: ${log.battery}% ` : ""}
          ${log.signalRssi !== null ? `RSSI: ${log.signalRssi}dBm` : ""}
        </div>
      </div>
    `;
    })
    .join("");
}

function renderFleetTable() {
  const tbody = document.getElementById("fleetTableBody");
  if (!devices || devices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;">No registered devices.</td></tr>`;
    return;
  }

  tbody.innerHTML = devices
    .map(
      (dev) => `
    <tr>
      <td style="font-family: var(--font-mono); font-weight: 700; color: #38bdf8;">${escapeHtml(dev.deviceId)}</td>
      <td>
        <div style="font-weight: 600;">${escapeHtml(dev.deviceName)}</div>
        <div style="font-size: 0.72rem; color: var(--text-dim);">${escapeHtml(dev.locationName)}</div>
      </td>
      <td style="font-family: var(--font-mono); font-size: 0.75rem;">${escapeHtml(dev.deviceType)}</td>
      <td>
        <span class="badge ${dev.status === "alerting" ? "badge-critical" : "badge-medium"}">
          ${dev.status.toUpperCase()}
        </span>
      </td>
      <td style="font-family: var(--font-mono);">${dev.batteryLevel !== null ? dev.batteryLevel + "%" : "N/A"}</td>
      <td style="font-family: var(--font-mono);">${dev.signalRssi !== null ? dev.signalRssi + " dBm" : "N/A"}</td>
      <td style="font-size: 0.75rem; color: var(--text-dim);">${formatTimeAgo(dev.lastHeartbeat)}</td>
    </tr>
  `
    )
    .join("");
}

// Actions
window.quickDispatch = async function (incidentId) {
  const unit = prompt("Enter Responder Unit to Dispatch (e.g., 'EMS Unit 02', 'Engine Squad 9'):");
  if (!unit) return;

  try {
    const res = await fetch(`/api/incidents/${incidentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "dispatched",
        assigned_unit: unit,
        notes: `Unit [${unit}] dispatched by central command.`,
      }),
    });

    if (res.ok) {
      playChime();
      showToast(`Dispatched ${unit} successfully!`, "success");
      fetchAllData();
    }
  } catch (err) {
    showToast("Failed to dispatch unit", "error");
  }
};

window.quickStatusChange = async function (incidentId, newStatus) {
  try {
    const res = await fetch(`/api/incidents/${incidentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: newStatus,
        notes: `Status changed to ${newStatus}.`,
      }),
    });

    if (res.ok) {
      playChime();
      showToast(`Incident status updated to ${newStatus}`, "success");
      fetchAllData();
    }
  } catch (err) {
    showToast("Update failed", "error");
  }
};

window.viewIncidentDetails = async function (incidentId) {
  try {
    const res = await fetch(`/api/incidents/${incidentId}`);
    if (!res.ok) return;
    const inc = await res.json();

    document.getElementById("detailModalTitle").innerText = `${inc.incidentCode}: ${inc.title}`;

    const body = document.getElementById("detailModalBody");
    body.innerHTML = `
      <div style="display: flex; gap: 8px; align-items: center;">
        <span class="badge badge-${inc.priority}">${inc.priority}</span>
        <span class="badge badge-status ${inc.status}">${inc.status}</span>
        <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-dim);">
          Reported: ${new Date(inc.createdAt).toLocaleString()}
        </span>
      </div>

      <div style="background: rgba(0,0,0,0.25); padding: 12px; border-radius: 4px; border: 1px solid var(--border-subtle);">
        <strong>Description:</strong>
        <p style="margin-top: 4px; color: var(--text-muted); font-size: 0.85rem;">${escapeHtml(inc.description)}</p>
      </div>

      <div class="form-row">
        <div>
          <span style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Location:</span>
          <div>${escapeHtml(inc.locationAddress)}</div>
          <div style="font-family: var(--font-mono); font-size: 0.75rem; color: #60a5fa;">(${inc.latitude}, ${inc.longitude})</div>
        </div>
        <div>
          <span style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Assigned Unit:</span>
          <div style="color: #38bdf8; font-weight: 600;">${escapeHtml(inc.assignedUnit || "None")}</div>
        </div>
      </div>

      <div style="margin-top: 10px;">
        <h4 style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; color: var(--text-muted);">
          Dispatch Audit Trail
        </h4>
        <div style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;">
          ${
            inc.logs && inc.logs.length > 0
              ? inc.logs
                  .map(
                    (log) => `
              <div style="background: rgba(15, 23, 42, 0.7); padding: 8px 10px; border-left: 2px solid var(--accent-blue); font-size: 0.75rem;">
                <div style="display: flex; justify-content: space-between; color: var(--text-dim); font-family: var(--font-mono); margin-bottom: 2px;">
                  <span>${escapeHtml(log.action)} - ${escapeHtml(log.operator)}</span>
                  <span>${new Date(log.createdAt).toLocaleTimeString()}</span>
                </div>
                <div>${escapeHtml(log.notes)}</div>
              </div>
            `
                  )
                  .join("")
              : `<div style="color: var(--text-dim); font-size: 0.75rem;">No dispatch log entries yet.</div>`
          }
        </div>
      </div>
    `;

    openModal("incidentDetailModal");
  } catch (err) {
    console.error("View incident error", err);
  }
};

// Seed demo data
async function seedInitialData(force = false) {
  try {
    showToast("Seeding demonstration emergency records...", "info");
    const res = await fetch(`/api/seed${force ? "?force=true" : ""}`, { method: "POST" });
    const data = await res.json();
    playChime();
    showToast(data.message || "Seeding complete!", "success");
    await fetchAllData();
  } catch (e) {
    showToast("Failed to seed demo data", "error");
  }
}

// Escape HTML utility
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ESP32 PlatformIO Firmware Snippet Generator
function getESP32FirmwareSnippet() {
  const origin = window.location.origin;
  return `/**
 * Emergency Smart Response Network
 * ESP32 Node Firmware (PlatformIO)
 * Target: ESP32 Dev Module
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Wi-Fi Credentials
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Netlify Ingestion Endpoint
const char* TELEMETRY_URL = "${origin}/api/telemetry";

// Hardware Pin Configuration
const int PANIC_BUTTON_PIN = 0;   // Boot button on ESP32 or external pull-up switch
const int STATUS_LED_PIN   = 2;   // Onboard LED

// Device Metadata
const char* DEVICE_ID      = "ESP32-SOS-01";
const char* LOCATION_NAME  = "Sector 4 Civic Square Beacon";
const char* LATITUDE       = "-26.2041";
const char* LONGITUDE      = "28.0473";

unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000; // 30 seconds

void sendDistressSignal(bool isAlert, const char* eventType, const char* title, const char* description) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[ERR] Wi-Fi disconnected. Cannot send distress packet.");
    return;
  }

  HTTPClient http;
  http.begin(TELEMETRY_URL);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<512> doc;
  doc["device_id"]     = DEVICE_ID;
  doc["event_type"]    = eventType;
  doc["alert"]         = isAlert;
  doc["title"]         = title;
  doc["description"]   = description;
  doc["category"]      = "sos_panic";
  doc["priority"]      = "critical";
  doc["latitude"]      = LATITUDE;
  doc["longitude"]     = LONGITUDE;
  doc["location_name"] = LOCATION_NAME;
  doc["battery"]       = 92;
  doc["signal_rssi"]   = WiFi.RSSI();

  JsonObject sensors = doc.createNestedObject("sensor_data");
  sensors["tamper_ok"] = true;
  sensors["button_held_ms"] = 3000;

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.println("[NETLIFY] Transmitting telemetry packet...");
  int httpCode = http.POST(requestBody);

  if (httpCode > 0) {
    Serial.printf("[NETLIFY] Response Code: %d\\n", httpCode);
    String response = http.getString();
    Serial.println(response);
  } else {
    Serial.printf("[ERR] HTTP POST Failed: %s\\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(PANIC_BUTTON_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  Serial.println("\\n=== EMERGENCY SMART RESPONSE NETWORK ===");
  Serial.printf("Connecting to Wi-Fi SSID: %s\\n", WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
  }

  digitalWrite(STATUS_LED_PIN, HIGH);
  Serial.println("\\n[OK] Wi-Fi Connected. IP: " + WiFi.localIP().toString());

  // Send initial registration heartbeat
  sendDistressSignal(false, "heartbeat", "ESP32 Node Online", "Node rebooted and registered.");
}

void loop() {
  // Check Panic Button (active low)
  if (digitalRead(PANIC_BUTTON_PIN) == LOW) {
    Serial.println("[ALARM] Panic Button Pressed! Initiating SOS Dispatch...");
    digitalWrite(STATUS_LED_PIN, HIGH);
    sendDistressSignal(true, "panic_alarm", "PHYSICAL SOS BUTTON PRESSED", "Panic beacon triggered locally.");
    delay(2000); // Debounce / prevent flood
  }

  // Periodic heartbeat
  if (millis() - lastHeartbeatTime > HEARTBEAT_INTERVAL) {
    lastHeartbeatTime = millis();
    sendDistressSignal(false, "heartbeat", "Periodic Heartbeat", "ESP32 node operational.");
  }

  delay(50);
}
`;
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  fetchAllData();
  setInterval(fetchAllData, 8000);

  // Audio Toggle
  const audioBtn = document.getElementById("btnAudioToggle");
  audioBtn.addEventListener("click", () => {
    initAudio();
    audioEnabled = !audioEnabled;
    document.getElementById("audioStatusText").innerText = audioEnabled ? "Sound On" : "Muted";
    audioBtn.className = audioEnabled ? "btn btn-secondary btn-sm" : "btn btn-secondary btn-sm opacity-50";
  });

  // Filters
  const filterBtns = document.querySelectorAll("#statusFilterGroup .filter-pill");
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.getAttribute("data-filter");
      renderIncidents();
    });
  });

  // Search
  const searchInput = document.getElementById("searchIncidentsInput");
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderIncidents();
  });

  // Refresh
  document.getElementById("btnRefreshIncidents").addEventListener("click", () => {
    fetchAllData();
    showToast("Incident queue refreshed", "info");
  });

  // Modal open buttons
  document.getElementById("btnOpenSimulator").addEventListener("click", () => openModal("simulatorModal"));
  document.getElementById("btnOpenFleet").addEventListener("click", () => openModal("fleetModal"));
  document.getElementById("btnOpenFirmware").addEventListener("click", () => {
    document.getElementById("firmwareCodeDisplay").innerText = getESP32FirmwareSnippet();
    openModal("firmwareModal");
  });
  document.getElementById("btnOpenNewIncident").addEventListener("click", () => openModal("newIncidentModal"));
  document.getElementById("btnSeedData").addEventListener("click", () => seedInitialData(true));

  // Copy firmware code
  document.getElementById("btnCopyFirmwareCode").addEventListener("click", () => {
    navigator.clipboard.writeText(getESP32FirmwareSnippet());
    showToast("ESP32 C++ Code copied to clipboard!", "success");
  });

  // Simulator Device dropdown custom option
  const simDevSelect = document.getElementById("simDeviceId");
  simDevSelect.addEventListener("change", (e) => {
    const customGroup = document.getElementById("simCustomDeviceGroup");
    if (e.target.value === "ESP32-NEW-CUSTOM") {
      customGroup.style.display = "flex";
    } else {
      customGroup.style.display = "none";
    }
  });

  // Simulator Submit
  document.getElementById("btnSendSimulatedTelemetry").addEventListener("click", async () => {
    let devId = simDevSelect.value;
    if (devId === "ESP32-NEW-CUSTOM") {
      devId = document.getElementById("simCustomDeviceId").value.trim() || "ESP32-CUSTOM-01";
    }

    const eventType = document.getElementById("simEventType").value;
    const isAlert = eventType !== "heartbeat";
    const title = document.getElementById("simTitle").value;
    const description = document.getElementById("simDescription").value;
    const location = document.getElementById("simLocation").value;
    const priority = document.getElementById("simPriority").value;
    const lat = document.getElementById("simLat").value;
    const lon = document.getElementById("simLon").value;
    const battery = parseInt(document.getElementById("simBattery").value, 10);
    const rssi = parseInt(document.getElementById("simRssi").value, 10);

    try {
      const payload = {
        device_id: devId,
        event_type: eventType,
        alert: isAlert,
        title,
        description,
        location_name: location,
        priority,
        latitude: lat,
        longitude: lon,
        battery,
        signal_rssi: rssi,
        sensor_data: {
          simulated_at: new Date().toISOString(),
          trigger_mode: "simulator",
        },
      };

      const res = await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        closeModal("simulatorModal");
        if (isAlert) {
          playAlarmChime();
          showToast(`EMERGENCY INGESTED: ${title}`, "error");
        } else {
          playChime();
          showToast(`Telemetry logged for ${devId}`, "success");
        }
        fetchAllData();
      } else {
        const err = await res.json();
        showToast(err.error || "Telemetry ingestion error", "error");
      }
    } catch (err) {
      showToast("Network error transmitting telemetry", "error");
    }
  });

  // Manual Incident Submit
  document.getElementById("btnSubmitNewIncident").addEventListener("click", async () => {
    const title = document.getElementById("newIncTitle").value.trim();
    const desc = document.getElementById("newIncDesc").value.trim();
    const category = document.getElementById("newIncCategory").value;
    const priority = document.getElementById("newIncPriority").value;
    const address = document.getElementById("newIncAddress").value.trim();
    const unit = document.getElementById("newIncUnit").value.trim();
    const contact = document.getElementById("newIncContact").value.trim();

    if (!title || !desc) {
      alert("Please provide an incident title and description.");
      return;
    }

    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: desc,
          category,
          priority,
          location_address: address || "City Center",
          assigned_unit: unit || null,
          contact_name: contact || null,
        }),
      });

      if (res.ok) {
        closeModal("newIncidentModal");
        playAlarmChime();
        showToast("Emergency incident ticket created & dispatched!", "success");
        fetchAllData();
        // Clear fields
        document.getElementById("newIncTitle").value = "";
        document.getElementById("newIncDesc").value = "";
        document.getElementById("newIncAddress").value = "";
        document.getElementById("newIncUnit").value = "";
      } else {
        showToast("Error creating incident ticket", "error");
      }
    } catch (err) {
      showToast("Network error", "error");
    }
  });
});
