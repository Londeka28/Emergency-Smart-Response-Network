import type { Config, Context } from "@netlify/functions";
import { db } from "../../db/index.js";
import { devices, telemetryLogs } from "../../db/schema.js";
import { eq, desc } from "drizzle-orm";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParamId = context.params?.id || url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      if (pathParamId) {
        const [dev] = await db
          .select()
          .from(devices)
          .where(eq(devices.deviceId, pathParamId));

        if (!dev) {
          return Response.json(
            { error: "Device not found" },
            { status: 404, headers: corsHeaders }
          );
        }

        const deviceLogs = await db
          .select()
          .from(telemetryLogs)
          .where(eq(telemetryLogs.deviceId, pathParamId))
          .orderBy(desc(telemetryLogs.createdAt))
          .limit(20);

        return Response.json({ ...dev, recent_telemetry: deviceLogs }, { headers: corsHeaders });
      }

      const allDevices = await db
        .select()
        .from(devices)
        .orderBy(desc(devices.lastHeartbeat));

      return Response.json(allDevices, { headers: corsHeaders });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const {
        device_id,
        device_name,
        device_type = "panic_beacon",
        location_name = "Edge Sensor Node",
        latitude = "-26.2041",
        longitude = "28.0473",
        firmware_version = "v1.4.2-esp32",
        battery_level = 100,
        signal_rssi = -65,
      } = body;

      if (!device_id) {
        return Response.json(
          { error: "device_id is required" },
          { status: 400, headers: corsHeaders }
        );
      }

      const [existing] = await db
        .select()
        .from(devices)
        .where(eq(devices.deviceId, String(device_id)));

      const now = new Date();

      if (existing) {
        const [updated] = await db
          .update(devices)
          .set({
            deviceName: device_name || existing.deviceName,
            deviceType: device_type || existing.deviceType,
            locationName: location_name || existing.locationName,
            latitude: String(latitude),
            longitude: String(longitude),
            firmwareVersion: firmware_version,
            batteryLevel: Number(battery_level),
            signalRssi: Number(signal_rssi),
            lastHeartbeat: now,
          })
          .where(eq(devices.deviceId, String(device_id)))
          .returning();

        return Response.json(updated, { headers: corsHeaders });
      }

      const [created] = await db
        .insert(devices)
        .values({
          deviceId: String(device_id),
          deviceName: device_name || `ESP32 Node ${device_id}`,
          deviceType: device_type,
          locationName: location_name,
          latitude: String(latitude),
          longitude: String(longitude),
          batteryLevel: Number(battery_level),
          signalRssi: Number(signal_rssi),
          firmwareVersion: firmware_version,
          status: "online",
          lastHeartbeat: now,
          createdAt: now,
        })
        .returning();

      return Response.json(created, { status: 201, headers: corsHeaders });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  } catch (err: any) {
    console.error("Devices API error:", err);
    return Response.json(
      { error: "Internal Server Error", details: err?.message },
      { status: 500, headers: corsHeaders }
    );
  }
};

export const config: Config = {
  path: ["/api/devices", "/api/devices/:id"],
};
