import type { Config } from "@netlify/functions";
import { db } from "../../db/index.js";
import { devices, incidents, telemetryLogs, dispatchLogs } from "../../db/schema.js";
import { eq, desc } from "drizzle-orm";

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
    if (req.method === "GET") {
      const logs = await db
        .select()
        .from(telemetryLogs)
        .orderBy(desc(telemetryLogs.createdAt))
        .limit(50);

      return Response.json(logs, { headers: corsHeaders });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const {
        device_id,
        event_type = "heartbeat",
        alert = false,
        title,
        description,
        category = "sos_panic",
        priority = "critical",
        latitude = "0.0",
        longitude = "0.0",
        location_name = "Edge Sensor Node",
        battery = 100,
        signal_rssi = -60,
        sensor_data,
        assigned_unit,
      } = body;

      if (!device_id) {
        return Response.json(
          { error: "device_id is required" },
          { status: 400, headers: corsHeaders }
        );
      }

      const now = new Date();

      // Upsert device status
      const [existingDevice] = await db
        .select()
        .from(devices)
        .where(eq(devices.deviceId, String(device_id)));

      const deviceStatus = alert ? "alerting" : "online";

      if (existingDevice) {
        await db
          .update(devices)
          .set({
            status: deviceStatus,
            batteryLevel: Number(battery),
            signalRssi: Number(signal_rssi),
            latitude: String(latitude),
            longitude: String(longitude),
            lastHeartbeat: now,
          })
          .where(eq(devices.deviceId, String(device_id)));
      } else {
        await db.insert(devices).values({
          deviceId: String(device_id),
          deviceName: String(location_name || `ESP32 Node ${device_id}`),
          deviceType: String(category === "fire" ? "fire_detector" : "panic_beacon"),
          status: deviceStatus,
          locationName: String(location_name || "Emergency Field Node"),
          latitude: String(latitude),
          longitude: String(longitude),
          batteryLevel: Number(battery),
          signalRssi: Number(signal_rssi),
          firmwareVersion: "v1.4.2-esp32",
          lastHeartbeat: now,
        });
      }

      // Record telemetry log
      const [log] = await db
        .insert(telemetryLogs)
        .values({
          deviceId: String(device_id),
          eventType: String(event_type),
          payload: typeof sensor_data === "object" ? JSON.stringify(sensor_data) : String(sensor_data || ""),
          battery: Number(battery),
          signalRssi: Number(signal_rssi),
          latitude: String(latitude),
          longitude: String(longitude),
          createdAt: now,
        })
        .returning();

      // If an alert or panic event is triggered, automatically create/log an emergency incident
      let incidentRecord = null;
      const isEmergency =
        alert === true ||
        ["panic_alarm", "smoke_detected", "collision_impact", "sos_panic", "fire"].includes(event_type);

      if (isEmergency) {
        const timestampCode = Date.now().toString().slice(-6);
        const incidentCode = `INC-${timestampCode}`;

        const [createdIncident] = await db
          .insert(incidents)
          .values({
            incidentCode,
            title: title || `EMERGENCY ALERT: ${device_id}`,
            description:
              description ||
              `Automated emergency beacon triggered by device ${device_id} at location (${latitude}, ${longitude}). Event type: ${event_type}`,
            category: category || "sos_panic",
            priority: priority || "critical",
            status: "reported",
            latitude: String(latitude),
            longitude: String(longitude),
            locationAddress: location_name || "Device Telemetry Location",
            reportedByDeviceId: String(device_id),
            assignedUnit: assigned_unit || null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        incidentRecord = createdIncident;

        // Log initial dispatch action
        await db.insert(dispatchLogs).values({
          incidentId: createdIncident.id,
          action: "EMERGENCY_ALARM_RECEIVED",
          operator: "ESP32 Autonomous Ingestion Gateway",
          notes: `Automated distress packet received from ${device_id} (RSSI: ${signal_rssi} dBm, Battery: ${battery}%). Triage: ${priority.toUpperCase()}.`,
          createdAt: now,
        });
      }

      return Response.json(
        {
          success: true,
          message: isEmergency ? "Emergency incident initiated & logged" : "Telemetry logged successfully",
          device_id,
          telemetry_id: log?.id,
          incident: incidentRecord,
        },
        { status: 201, headers: corsHeaders }
      );
    }

    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  } catch (err: any) {
    console.error("Telemetry ingestion error:", err);
    return Response.json(
      { error: "Internal Server Error", details: err?.message },
      { status: 500, headers: corsHeaders }
    );
  }
};

export const config: Config = {
  path: "/api/telemetry",
};
