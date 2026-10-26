ALTER TABLE "member" ADD COLUMN "invite_email" text;--> statement-breakpoint
CREATE UNIQUE INDEX "member_group_invite_email" ON "member" USING btree ("group_id","invite_email") WHERE "member"."user_id" is null;--> statement-breakpoint
CREATE INDEX "member_invite_email_idx" ON "member" USING btree ("invite_email") WHERE "member"."user_id" is null;