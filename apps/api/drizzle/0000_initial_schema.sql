CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'TESLAPAY');--> statement-breakpoint
CREATE TYPE "public"."pool_status" AS ENUM('ACCEPTED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."ride_status" AS ENUM('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('PASSENGER', 'DRIVER');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_request_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount_paisa" integer NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_ride_request_id_unique" UNIQUE("ride_request_id"),
	CONSTRAINT "payments_amount_non_negative" CHECK ("payments"."amount_paisa" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"pickup_zone_code" text NOT NULL,
	"status" "pool_status" DEFAULT 'ACCEPTED' NOT NULL,
	"capacity" smallint NOT NULL,
	"seats_taken" smallint DEFAULT 0 NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"arrived_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "pools_capacity_positive" CHECK ("pools"."capacity" > 0),
	CONSTRAINT "pools_seats_within_capacity" CHECK ("pools"."seats_taken" BETWEEN 0 AND "pools"."capacity")
);
--> statement-breakpoint
CREATE TABLE "ride_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ride_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ride_request_id" uuid,
	"pool_id" uuid,
	"actor_user_id" uuid,
	"type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_events_has_subject" CHECK ("ride_events"."ride_request_id" IS NOT NULL OR "ride_events"."pool_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "ride_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passenger_id" uuid NOT NULL,
	"pool_id" uuid,
	"pickup_zone_code" text NOT NULL,
	"dropoff_zone_code" text NOT NULL,
	"seats" smallint NOT NULL,
	"status" "ride_status" DEFAULT 'REQUESTED' NOT NULL,
	"payment_method" "payment_method" DEFAULT 'CASH' NOT NULL,
	"distance_km" smallint NOT NULL,
	"fare_rule_version" text NOT NULL,
	"estimated_fare_paisa" integer NOT NULL,
	"pool_discount_paisa" integer,
	"final_fare_paisa" integer GENERATED ALWAYS AS (estimated_fare_paisa - pool_discount_paisa) STORED,
	"cancel_reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"matched_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "ride_requests_seats_range" CHECK ("ride_requests"."seats" BETWEEN 1 AND 6),
	CONSTRAINT "ride_requests_distinct_zones" CHECK ("ride_requests"."dropoff_zone_code" <> "ride_requests"."pickup_zone_code"),
	CONSTRAINT "ride_requests_distance_positive" CHECK ("ride_requests"."distance_km" > 0),
	CONSTRAINT "ride_requests_estimate_non_negative" CHECK ("ride_requests"."estimated_fare_paisa" >= 0),
	CONSTRAINT "ride_requests_discount_within_estimate" CHECK ("ride_requests"."pool_discount_paisa" BETWEEN 0 AND "ride_requests"."estimated_fare_paisa"),
	CONSTRAINT "ride_requests_status_matches_pool" CHECK (("ride_requests"."status" = 'REQUESTED' AND "ride_requests"."pool_id" IS NULL)
        OR ("ride_requests"."status" IN ('MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED') AND "ride_requests"."pool_id" IS NOT NULL)
        OR "ride_requests"."status" = 'CANCELLED')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_full_name_length" CHECK (char_length("users"."full_name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"name" text NOT NULL,
	"capacity" smallint NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"current_zone_code" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_driver_id_unique" UNIQUE("driver_id"),
	CONSTRAINT "vehicles_capacity_range" CHECK ("vehicles"."capacity" BETWEEN 1 AND 6),
	CONSTRAINT "vehicles_online_needs_zone" CHECK (NOT "vehicles"."is_online" OR "vehicles"."current_zone_code" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	CONSTRAINT "zones_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_pickup_zone_code_zones_code_fk" FOREIGN KEY ("pickup_zone_code") REFERENCES "public"."zones"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pickup_zone_code_zones_code_fk" FOREIGN KEY ("pickup_zone_code") REFERENCES "public"."zones"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_dropoff_zone_code_zones_code_fk" FOREIGN KEY ("dropoff_zone_code") REFERENCES "public"."zones"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_zone_code_zones_code_fk" FOREIGN KEY ("current_zone_code") REFERENCES "public"."zones"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pools_one_active_per_vehicle" ON "pools" USING btree ("vehicle_id") WHERE "pools"."status" IN ('ACCEPTED', 'DRIVER_ARRIVED', 'STARTED');--> statement-breakpoint
CREATE INDEX "pools_joinable_by_pickup" ON "pools" USING btree ("pickup_zone_code","accepted_at") WHERE "pools"."status" IN ('ACCEPTED', 'DRIVER_ARRIVED');--> statement-breakpoint
CREATE INDEX "pools_vehicle_history" ON "pools" USING btree ("vehicle_id","accepted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ride_events_ride_timeline" ON "ride_events" USING btree ("ride_request_id","id");--> statement-breakpoint
CREATE INDEX "ride_events_pool_timeline" ON "ride_events" USING btree ("pool_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "ride_requests_one_active_per_passenger" ON "ride_requests" USING btree ("passenger_id") WHERE "ride_requests"."status" IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED');--> statement-breakpoint
CREATE INDEX "ride_requests_waiting_by_pickup" ON "ride_requests" USING btree ("pickup_zone_code","requested_at") WHERE "ride_requests"."status" = 'REQUESTED';--> statement-breakpoint
CREATE INDEX "ride_requests_by_pool" ON "ride_requests" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "ride_requests_passenger_history" ON "ride_requests" USING btree ("passenger_id","requested_at" DESC NULLS LAST);