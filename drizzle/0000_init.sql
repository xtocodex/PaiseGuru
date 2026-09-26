CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"hisaab_id" uuid NOT NULL,
	"sheet_id" uuid,
	"actor_user_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hisaab_id" uuid NOT NULL,
	"sheet_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"category" text,
	"date" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"paid_by_member_id" uuid,
	"to_member_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "entry_amount" CHECK ("entry"."amount_paise" > 0 and "entry"."amount_paise" <= 1000000000)
);
--> statement-breakpoint
CREATE TABLE "hisaab" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"for_label" text,
	"category" text DEFAULT 'Shared' NOT NULL,
	"kind" text DEFAULT 'monthly' NOT NULL,
	"cycle_day" integer DEFAULT 1 NOT NULL,
	"start_month" date NOT NULL,
	"join_approval" boolean DEFAULT true NOT NULL,
	"invite_token_hash" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hisaab_invite_token_hash_unique" UNIQUE("invite_token_hash"),
	CONSTRAINT "hisaab_cycle_day" CHECK ("hisaab"."cycle_day" between 1 and 28)
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hisaab_id" uuid NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "member_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_hisaab_user" UNIQUE("hisaab_id","user_id"),
	CONSTRAINT "member_hisaab_id" UNIQUE("hisaab_id","id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sheet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hisaab_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"month" date NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"weight_mode" text DEFAULT 'shares' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	CONSTRAINT "sheet_hisaab_start" UNIQUE("hisaab_id","start_date"),
	CONSTRAINT "sheet_hisaab_id" UNIQUE("hisaab_id","id")
);
--> statement-breakpoint
CREATE TABLE "sheet_participant" (
	"sheet_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"exception" text DEFAULT 'none' NOT NULL,
	"exception_paise" bigint DEFAULT 0 NOT NULL,
	"weight" integer DEFAULT 100 NOT NULL,
	CONSTRAINT "sheet_participant_sheet_id_member_id_pk" PRIMARY KEY("sheet_id","member_id"),
	CONSTRAINT "participant_amounts" CHECK ("sheet_participant"."exception_paise" >= 0 and "sheet_participant"."weight" > 0)
);
--> statement-breakpoint
CREATE TABLE "sheet_snapshot" (
	"sheet_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statement_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "statement_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "transfer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hisaab_id" uuid NOT NULL,
	"sheet_id" uuid NOT NULL,
	"from_member_id" uuid NOT NULL,
	"to_member_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by" uuid,
	"via" text,
	CONSTRAINT "transfer_amount" CHECK ("transfer"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"upi_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_hisaab_id_hisaab_id_fk" FOREIGN KEY ("hisaab_id") REFERENCES "public"."hisaab"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_hisaab_id_sheet_id_sheet_hisaab_id_id_fk" FOREIGN KEY ("hisaab_id","sheet_id") REFERENCES "public"."sheet"("hisaab_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_hisaab_id_paid_by_member_id_member_hisaab_id_id_fk" FOREIGN KEY ("hisaab_id","paid_by_member_id") REFERENCES "public"."member"("hisaab_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_hisaab_id_to_member_id_member_hisaab_id_id_fk" FOREIGN KEY ("hisaab_id","to_member_id") REFERENCES "public"."member"("hisaab_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hisaab" ADD CONSTRAINT "hisaab_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_hisaab_id_hisaab_id_fk" FOREIGN KEY ("hisaab_id") REFERENCES "public"."hisaab"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet" ADD CONSTRAINT "sheet_hisaab_id_hisaab_id_fk" FOREIGN KEY ("hisaab_id") REFERENCES "public"."hisaab"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet" ADD CONSTRAINT "sheet_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_participant" ADD CONSTRAINT "sheet_participant_sheet_id_sheet_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."sheet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_participant" ADD CONSTRAINT "sheet_participant_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_snapshot" ADD CONSTRAINT "sheet_snapshot_sheet_id_sheet_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."sheet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_token" ADD CONSTRAINT "statement_token_sheet_id_sheet_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."sheet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_token" ADD CONSTRAINT "statement_token_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_hisaab_id_sheet_id_sheet_hisaab_id_id_fk" FOREIGN KEY ("hisaab_id","sheet_id") REFERENCES "public"."sheet"("hisaab_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_hisaab_id_from_member_id_member_hisaab_id_id_fk" FOREIGN KEY ("hisaab_id","from_member_id") REFERENCES "public"."member"("hisaab_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_hisaab_id_to_member_id_member_hisaab_id_id_fk" FOREIGN KEY ("hisaab_id","to_member_id") REFERENCES "public"."member"("hisaab_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_hisaab_created_idx" ON "activity" USING btree ("hisaab_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entry_sheet_date_idx" ON "entry" USING btree ("sheet_id","date") WHERE "entry"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "member_one_admin" ON "member" USING btree ("hisaab_id") WHERE "member"."role" = 'admin';--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sheet_participant_member_idx" ON "sheet_participant" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "transfer_sheet_idx" ON "transfer" USING btree ("sheet_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");