-- Session revocation.
--
-- Additive and safe on a live database: the column has a default, so existing
-- rows get 0 and every JWT already in circulation continues to validate. No
-- user is signed out by this migration.
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
