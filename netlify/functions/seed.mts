import type { Config } from "@netlify/functions";
import { db } from "../../db/index.js";
import { devices, incidents, telemetryLogs, dispatchLogs } from "../../db/schema.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const existingDevices = await db.select().from(devices).limit(1);
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";

    if (existingDevices.length > 0 && !force) {
      return Response.json(
        { message: "Database already contains data. Use ?force=true to re-seed." },
        { headers: corsHeaders }
      );
    }

    if (force) {
      await db.delete(dispatchLogs);
      await db.delete(telemetryLogs);
      await db.delete(incidents);
      await db.delete(devices);
    }

    const now = new Date();
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // 1. Seed Devices
    const [dev1] = await db
      .insert(devices)
      .values({
        deviceId: "ESP32-SOS-01",
        deviceName: "Sector 4 Civic Square Panic Beacon",
        deviceType: "panic_beacon",
        status: "alerting",
        locationName: "Civic Square Pedestrian Plaza",
        latitude: "-26.2041",
        longitude: "28.0473",
        batteryLevel: 88,
        signalRssi: -58,
        firmwareVersion: "v1.4.2-esp32",
        lastHeartbeat: now,
        createdAt: oneHourAgo,
      })
      .returning();

    const [dev2] = await db
      .insert(devices)
      .values({
        deviceId: "ESP32-FIRE-02",
        deviceName: "West Industrial Zone Thermal Sentinel",
        deviceType: "fire_detector",
        status: "alerting",
        locationName: "Substation 9 / Chemical Depot",
        latitude: "-26.2115",
        longitude: "28.0382",
        batteryLevel: 94,
        signalRssi: -62,
        firmwareVersion: "v1.4.2-esp32",
        lastHeartbeat: tenMinAgo,
        createdAt: oneHourAgo,
      })
      .returning();

    const [dev3] = await db
      .insert(devices)
      .values({
        deviceId: "ESP32-CRASH-03",
        deviceName: "Highway M1 South Impact Monitor",
        deviceType: "crash_sensor",
        status: "online",
        locationName: "M1 South km 14 Overpass",
        latitude: "-26.1950",
        longitude: "28.0551",
        batteryLevel: 79,
        signalRssi: -71,
        firmwareVersion: "v1.4.2-esp32",
        lastHeartbeat: now,
        createdAt: oneHourAgo,
      })
      .returning();

    const [dev4] = await db
      .insert(devices)
      .values({
        deviceId: "ESP32-AMB-04",
        deviceName: "Mobile Response Node Alpha-1",
        deviceType: "responder_unit",
        status: "online",
        locationName: "District General Hospital Outpost",
        latitude: "-26.2088",
        longitude: "28.0410",
        batteryLevel: 100,
        signalRssi: -52,
        firmwareVersion: "v1.4.2-esp32",
        lastHeartbeat: now,
        createdAt: oneHourAgo,
      })
      .returning();

    // 2. Seed Incidents
    const [inc1] = await db
      .insert(incidents)
      .values({
        incidentCode: "INC-892101",
        title: "Civilian Distress SOS Triggered",
        description: "Physical panic button held for >3s at Civic Square Pedestrian Plaza. Active audible alarm sounding locally.",
        category: "sos_panic",
        priority: "critical",
        status: "dispatched",
        latitude: "-26.2041",
        longitude: "28.0473",
        locationAddress: "Civic Square Pedestrian Plaza (Pillar 12)",
        reportedByDeviceId: "ESP32-SOS-01",
        assignedUnit: "Metro Patrol Unit 04",
        contactName: "Automated Edge Beacon",
        contactPhone: "N/A - Direct Radio Link",
        createdAt: tenMinAgo,
        updatedAt: now,
      })
      .returning();

    const [inc2] = await db
      .insert(incidents)
      .values({
        incidentCode: "INC-892102",
        title: "Thermal Hazard & Smoke Detection",
        description: "Optical particulate sensor exceeded 420 ppm and temperature gradient peaked at 68°C near high-voltage transformer bank.",
        category: "fire",
        priority: "critical",
        status: "reported",
        latitude: "-26.2115",
        longitude: "28.0382",
        locationAddress: "Substation 9 / Chemical Depot",
        reportedByDeviceId: "ESP32-FIRE-02",
        assignedUnit: "Engine Squad 14 (En Route)",
        createdAt: thirtyMinAgo,
        updatedAt: tenMinAgo,
      })
      .returning();

    const [inc3] = await db
      .insert(incidents)
      .values({
        incidentCode: "INC-892095",
        title: "Elderly Medical Emergency (Home Beacon)",
        description: "Wearable pendant fall-detection accelerometer activated. Patient breathing but immobile.",
        category: "medical",
        priority: "high",
        status: "on_scene",
        latitude: "-26.1985",
        longitude: "28.0510",
        locationAddress: "44 Fairview Avenue, Apt 3B",
        assignedUnit: "Ambulance EMS-08",
        contactName: "Caregiver Dispatch",
        contactPhone: "+27 11 555-0199",
        createdAt: oneHourAgo,
        updatedAt: tenMinAgo,
      })
      .returning();

    // 3. Seed Dispatch Logs
    await db.insert(dispatchLogs).values([
      {
        incidentId: inc1.id,
        action: "EMERGENCY_ALARM_RECEIVED",
        operator: "ESP32 Ingestion Gateway",
        notes: "Distress signal ingested from ESP32-SOS-01 with RSSI -58 dBm.",
        createdAt: tenMinAgo,
      },
      {
        incidentId: inc1.id,
        action: "UNIT_DISPATCHED",
        operator: "Captain L. Mokoena",
        notes: "Assigned Metro Patrol Unit 04. Estimated transit time: 4 minutes.",
        createdAt: new Date(tenMinAgo.getTime() + 2 * 60 * 1000),
      },
      {
        incidentId: inc2.id,
        action: "SENSOR_THRESHOLD_BREACH",
        operator: "Thermal Early Warning Service",
        notes: "Particulate index 420 ppm and thermal spike 68°C verified across 3 consecutive frames.",
        createdAt: thirtyMinAgo,
      },
      {
        incidentId: inc3.id,
        action: "RESPONDER_ON_SCENE",
        operator: "Paramedic Unit EMS-08",
        notes: "Responders arrived on scene. Administering vitals assessment.",
        createdAt: tenMinAgo,
      },
    ]);

    // 4. Seed Telemetry Logs
    await db.insert(telemetryLogs).values([
      {
        deviceId: "ESP32-SOS-01",
        eventType: "panic_alarm",
        payload: JSON.stringify({ button_hold_ms: 3200, tamper_pin: 0, alert_code: "PNC_01" }),
        battery: 88,
        signalRssi: -58,
        latitude: "-26.2041",
        longitude: "28.0473",
        createdAt: tenMinAgo,
      },
      {
        deviceId: "ESP32-FIRE-02",
        eventType: "smoke_detected",
        payload: JSON.stringify({ temp_c: 68.4, smoke_ppm: 422, flame_ir: 1 }),
        battery: 94,
        signalRssi: -62,
        latitude: "-26.2115",
        longitude: "28.0382",
        createdAt: thirtyMinAgo,
      },
      {
        deviceId: "ESP32-CRASH-03",
        eventType: "heartbeat",
        payload: JSON.stringify({ g_force_max: 0.12, gyro_stable: true, uptime_s: 41820 }),
        battery: 79,
        signalRssi: -71,
        latitude: "-26.1950",
        longitude: "28.0551",
        createdAt: now,
      },
    ]);

    return Response.json(
      {
        success: true,
        message: "Successfully seeded initial demonstration data for Emergency Smart Response Network",
        devices_count: 4,
        incidents_count: 3,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("Seed error:", err);
    return Response.json(
      { error: "Internal Server Error", details: err?.message },
      { status: 500, headers: corsHeaders }
    );
  }
};

export const config: Config = {
  path: "/api/seed",
};
