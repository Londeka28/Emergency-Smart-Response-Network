import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id").notNull().unique(),
  deviceName: text("device_name").notNull(),
  deviceType: text("device_type").notNull(),
  status: text("status").notNull().default("online"),
  locationName: text("location_name").notNull(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  batteryLevel: integer("battery_level").default(100),
  signalRssi: integer("signal_rssi").default(-65),
  firmwareVersion: text("firmware_version").default("v1.0.0-esp32"),
  lastHeartbeat: timestamp("last_heartbeat").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  incidentCode: text("incident_code").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  priority: text("priority").notNull().default("critical"),
  status: text("status").notNull().default("reported"),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  locationAddress: text("location_address").notNull(),
  reportedByDeviceId: text("reported_by_device_id"),
  assignedUnit: text("assigned_unit"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const telemetryLogs = pgTable("telemetry_logs", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: text("payload"),
  battery: integer("battery"),
  signalRssi: integer("signal_rssi"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dispatchLogs = pgTable("dispatch_logs", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull(),
  action: text("action").notNull(),
  operator: text("operator").notNull().default("Netlify Central Dispatch"),
  notes: text("notes").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
