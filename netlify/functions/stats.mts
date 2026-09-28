import type { Config } from "@netlify/functions";
import { db } from "../../db/index.js";
import { devices, incidents, telemetryLogs } from "../../db/schema.js";
import { eq, inArray, sql } from "drizzle-orm";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const allIncidents = await db.select().from(incidents);
    const allDevices = await db.select().from(devices);

    const activeIncidents = allIncidents.filter((i) =>
      ["reported", "dispatched", "on_scene"].includes(i.status)
    );
    const criticalIncidents = activeIncidents.filter((i) => i.priority === "critical");
    const highIncidents = activeIncidents.filter((i) => i.priority === "high");
    const resolvedIncidents = allIncidents.filter((i) => i.status === "resolved");

    const onlineDevices = allDevices.filter((d) => d.status === "online");
    const alertingDevices = allDevices.filter((d) => d.status === "alerting");

    // Category breakdown
    const categoryCounts: Record<string, number> = {};
    for (const inc of allIncidents) {
      categoryCounts[inc.category] = (categoryCounts[inc.category] || 0) + 1;
    }

    return Response.json(
      {
        total_incidents: allIncidents.length,
        active_incidents: activeIncidents.length,
        critical_count: criticalIncidents.length,
        high_count: highIncidents.length,
        resolved_count: resolvedIncidents.length,
        total_devices: allDevices.length,
        online_devices: onlineDevices.length,
        alerting_devices: alertingDevices.length,
        category_breakdown: categoryCounts,
        system_status: alertingDevices.length > 0 || criticalIncidents.length > 0 ? "ELEVATED_TRIAGE" : "NOMINAL",
        timestamp: new Date().toISOString(),
      },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("Stats API error:", err);
    return Response.json(
      { error: "Internal Server Error", details: err?.message },
      { status: 500, headers: corsHeaders }
    );
  }
};

export const config: Config = {
  path: "/api/stats",
};
