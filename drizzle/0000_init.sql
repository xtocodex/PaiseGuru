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
	"group_id" uuid NOT NULL,
	"sheet_id" uuid,
	"actor_user_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"sheet_id" uuid,
	"fund_id" uuid,
	"kind" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"split_mode" text NOT NULL,
	"category" text,
	"date" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "expense_amount" CHECK ("expense"."amount_paise" > 0 and ("expense"."amount_paise" <= 1000000000 or "expense"."kind" = 'sheet_close')),
	CONSTRAINT "expense_fund" CHECK (("expense"."kind" = 'fund_in') <= ("expense"."fund_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "expense_payer" (
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"paid_paise" bigint NOT NULL,
	CONSTRAINT "expense_payer_expense_id_member_id_pk" PRIMARY KEY("expense_id","member_id"),
	CONSTRAINT "payer_amount" CHECK ("expense_payer"."paid_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "expense_share" (
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"exception" text DEFAULT 'none' NOT NULL,
	"exception_paise" bigint DEFAULT 0 NOT NULL,
	"weight" integer DEFAULT 100 NOT NULL,
	"owed_paise" bigint NOT NULL,
	CONSTRAINT "expense_share_expense_id_member_id_pk" PRIMARY KEY("expense_id","member_id"),
	CONSTRAINT "share_amounts" CHECK ("expense_share"."owed_paise" >= 0 and "expense_share"."exception_paise" >= 0 and "expense_share"."weight" > 0)
);
--> statement-breakpoint
CREATE TABLE "fund" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"holder_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fund_group_id" UNIQUE("group_id","id")
);
--> statement-breakpoint
CREATE TABLE "group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"settle_mode" text NOT NULL,
	"category" text DEFAULT 'Shared' NOT NULL,
	"start_month" date NOT NULL,
	"join_approval" boolean DEFAULT false NOT NULL,
	"invite_nonce" uuid,
	"invite_token_hash" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_invite_token_hash_unique" UNIQUE("invite_token_hash")
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"seq" integer GENERATED ALWAYS AS IDENTITY (sequence name "member_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"default_weight" integer DEFAULT 100 NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_group_user" UNIQUE("group_id","user_id"),
	CONSTRAINT "member_group_id" UNIQUE("group_id","id"),
	CONSTRAINT "member_default_weight" CHECK ("member"."default_weight" between 1 and 10000)
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"from_member_id" uuid NOT NULL,
	"to_member_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"via" text NOT NULL,
	"utr" text,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "payment_amount" CHECK ("payment"."amount_paise" > 0 and "payment"."from_member_id" <> "payment"."to_member_id")
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
	"group_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"month" date NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	CONSTRAINT "sheet_group_start" UNIQUE("group_id","start_date"),
	CONSTRAINT "sheet_group_id" UNIQUE("group_id","id")
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
ALTER TABLE "activity" ADD CONSTRAINT "activity_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_group_id_sheet_id_sheet_group_id_id_fk" FOREIGN KEY ("group_id","sheet_id") REFERENCES "public"."sheet"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_group_id_fund_id_fund_group_id_id_fk" FOREIGN KEY ("group_id","fund_id") REFERENCES "public"."fund"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payer" ADD CONSTRAINT "expense_payer_expense_id_expense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payer" ADD CONSTRAINT "expense_payer_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_share" ADD CONSTRAINT "expense_share_expense_id_expense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expense"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_share" ADD CONSTRAINT "expense_share_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund" ADD CONSTRAINT "fund_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund" ADD CONSTRAINT "fund_group_id_holder_member_id_member_group_id_id_fk" FOREIGN KEY ("group_id","holder_member_id") REFERENCES "public"."member"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_confirmed_by_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_group_id_from_member_id_member_group_id_id_fk" FOREIGN KEY ("group_id","from_member_id") REFERENCES "public"."member"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_group_id_to_member_id_member_group_id_id_fk" FOREIGN KEY ("group_id","to_member_id") REFERENCES "public"."member"("group_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet" ADD CONSTRAINT "sheet_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet" ADD CONSTRAINT "sheet_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_participant" ADD CONSTRAINT "sheet_participant_sheet_id_sheet_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."sheet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_participant" ADD CONSTRAINT "sheet_participant_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_snapshot" ADD CONSTRAINT "sheet_snapshot_sheet_id_sheet_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."sheet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_token" ADD CONSTRAINT "statement_token_sheet_id_sheet_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."sheet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_token" ADD CONSTRAINT "statement_token_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_group_created_idx" ON "activity" USING btree ("group_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "expense_group_date_idx" ON "expense" USING btree ("group_id","date") WHERE "expense"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "expense_sheet_idx" ON "expense" USING btree ("sheet_id") WHERE "expense"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "expense_payer_member_idx" ON "expense_payer" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "expense_share_member_idx" ON "expense_share" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_one_admin" ON "member" USING btree ("group_id") WHERE "member"."role" = 'admin';--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_group_idx" ON "payment" USING btree ("group_id") WHERE "payment"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sheet_participant_member_idx" ON "sheet_participant" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");