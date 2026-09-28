CREATE TABLE "devices" (
	"id" serial PRIMARY KEY,
	"device_id" text NOT NULL UNIQUE,
	"device_name" text NOT NULL,
	"device_type" text NOT NULL,
	"status" text DEFAULT 'online' NOT NULL,
	"location_name" text NOT NULL,
	"latitude" text NOT NULL,
	"longitude" text NOT NULL,
	"battery_level" integer DEFAULT 100,
	"signal_rssi" integer DEFAULT -65,
	"firmware_version" text DEFAULT 'v1.0.0-esp32',
	"last_heartbeat" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dispatch_logs" (
	"id" serial PRIMARY KEY,
	"incident_id" integer NOT NULL,
	"action" text NOT NULL,
	"operator" text DEFAULT 'Netlify Central Dispatch' NOT NULL,
	"notes" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" serial PRIMARY KEY,
	"incident_code" text NOT NULL UNIQUE,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"priority" text DEFAULT 'critical' NOT NULL,
	"status" text DEFAULT 'reported' NOT NULL,
	"latitude" text NOT NULL,
	"longitude" text NOT NULL,
	"location_address" text NOT NULL,
	"reported_by_device_id" text,
	"assigned_unit" text,
	"contact_name" text,
	"contact_phone" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "telemetry_logs" (
	"id" serial PRIMARY KEY,
	"device_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" text,
	"battery" integer,
	"signal_rssi" integer,
	"latitude" text,
	"longitude" text,
	"created_at" timestamp DEFAULT now()
);
