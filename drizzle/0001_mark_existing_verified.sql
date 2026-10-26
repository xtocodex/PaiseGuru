-- Email verification starts now. Accounts made before it are trusted as they are (owner's decision, 2026-10-26).
UPDATE "user" SET "email_verified" = true WHERE "email_verified" = false;
