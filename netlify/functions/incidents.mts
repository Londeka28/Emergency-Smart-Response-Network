import type { Config, Context } from "@netlify/functions";
import { db } from "../../db/index.js";
import { incidents, dispatchLogs } from "../../db/schema.js";
import { eq, desc, inArray } from "drizzle-orm";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
};

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParamId = context.params?.id || url.searchParams.get("id");
  const incidentId = pathParamId ? parseInt(pathParamId, 10) : null;

  try {
    // GET: Query incidents
    if (req.method === "GET") {
      if (incidentId && !isNaN(incidentId)) {
        const [incident] = await db
          .select()
          .from(incidents)
          .where(eq(incidents.id, incidentId));

        if (!incident) {
          return Response.json(
            { error: "Incident not found" },
            { status: 404, headers: corsHeaders }
          );
        }

        const logs = await db
          .select()
          .from(dispatchLogs)
          .where(eq(dispatchLogs.incidentId, incidentId))
          .orderBy(desc(dispatchLogs.createdAt));

        return Response.json({ ...incident, logs }, { headers: corsHeaders });
      }

      const statusFilter = url.searchParams.get("status");
      let query = db.select().from(incidents).orderBy(desc(incidents.createdAt));

      let allIncidents;
      if (statusFilter === "active") {
        allIncidents = await db
          .select()
          .from(incidents)
          .where(inArray(incidents.status, ["reported", "dispatched", "on_scene"]))
          .orderBy(desc(incidents.createdAt));
      } else {
        allIncidents = await query;
      }

      return Response.json(allIncidents, { headers: corsHeaders });
    }

    // POST: Create incident or update via POST
    if (req.method === "POST" && (!incidentId || isNaN(incidentId))) {
      const body = await req.json();
      const {
        title,
        description,
        category = "medical",
        priority = "high",
        latitude = "-26.2041",
        longitude = "28.0473",
        location_address = "Reported Location",
        assigned_unit,
        contact_name,
        contact_phone,
        operator = "Netlify Central Dispatch",
      } = body;

      if (!title || !description) {
        return Response.json(
          { error: "Title and description are required" },
          { status: 400, headers: corsHeaders }
        );
      }

      const now = new Date();
      const incidentCode = `INC-${Date.now().toString().slice(-6)}`;

      const [newIncident] = await db
        .insert(incidents)
        .values({
          incidentCode,
          title,
          description,
          category,
          priority,
          status: assigned_unit ? "dispatched" : "reported",
          latitude: String(latitude),
          longitude: String(longitude),
          locationAddress: location_address,
          assignedUnit: assigned_unit || null,
          contactName: contact_name || null,
          contactPhone: contact_phone || null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // Log dispatch ticket creation
      await db.insert(dispatchLogs).values({
        incidentId: newIncident.id,
        action: assigned_unit ? "DISPATCHED" : "MANUAL_REPORT_LOGGED",
        operator,
        notes: assigned_unit
          ? `Incident reported manually and unit [${assigned_unit}] dispatched immediately.`
          : `Incident logged by operator [${operator}]. Pending unit assignment.`,
        createdAt: now,
      });

      return Response.json(newIncident, { status: 201, headers: corsHeaders });
    }

    // PATCH / PUT / POST: Update incident
    if (req.method === "PATCH" || req.method === "PUT" || (req.method === "POST" && incidentId)) {
      if (!incidentId || isNaN(incidentId)) {
        return Response.json(
          { error: "Incident ID is required for update" },
          { status: 400, headers: corsHeaders }
        );
      }

      const body = await req.json();
      const {
        status,
        priority,
        assigned_unit,
        notes,
        operator = "Netlify Central Dispatch",
      } = body;

      const [existing] = await db
        .select()
        .from(incidents)
        .where(eq(incidents.id, incidentId));

      if (!existing) {
        return Response.json(
          { error: "Incident not found" },
          { status: 404, headers: corsHeaders }
        );
      }

      const now = new Date();
      const updateData: Record<string, any> = { updatedAt: now };

      if (status) updateData.status = status;
      if (priority) updateData.priority = priority;
      if (assigned_unit !== undefined) updateData.assignedUnit = assigned_unit;

      const [updatedIncident] = await db
        .update(incidents)
        .set(updateData)
        .where(eq(incidents.id, incidentId))
        .returning();

      // Log action in dispatch logs
      let actionLabel = "UPDATE_APPLIED";
      let logMessage = notes || "Incident details updated by operator.";

      if (status && status !== existing.status) {
        actionLabel = `STATUS_${status.toUpperCase()}`;
        logMessage = notes
          ? `Status changed from ${existing.status} to ${status}. Note: ${notes}`
          : `Status changed from ${existing.status} to ${status}`;
      } else if (assigned_unit && assigned_unit !== existing.assignedUnit) {
        actionLabel = "UNIT_DISPATCHED";
        logMessage = notes
          ? `Assigned unit [${assigned_unit}]. Note: ${notes}`
          : `Assigned responder unit [${assigned_unit}].`;
      }

      await db.insert(dispatchLogs).values({
        incidentId,
        action: actionLabel,
        operator,
        notes: logMessage,
        createdAt: now,
      });

      return Response.json(updatedIncident, { headers: corsHeaders });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  } catch (err: any) {
    console.error("Incidents API error:", err);
    return Response.json(
      { error: "Internal Server Error", details: err?.message },
      { status: 500, headers: corsHeaders }
    );
  }
};

export const config: Config = {
  path: ["/api/incidents", "/api/incidents/:id"],
};
