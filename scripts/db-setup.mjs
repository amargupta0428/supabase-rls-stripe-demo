#!/usr/bin/env node
/**
 * Applies schema.sql then seed.sql to the Supabase Postgres using DATABASE_URL
 * from .env.local. Run: `npm run db:setup`.
 *
 * DATABASE_URL = Supabase dashboard → Project Settings → Database →
 * "Connection string" → URI (the direct/session connection, includes password).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "✗ DATABASE_URL is not set in .env.local.\n" +
      "  Get it from Supabase → Project Settings → Database → Connection string → URI.",
  );
  process.exit(1);
}

const files = ["supabase/schema.sql", "supabase/seed.sql"];
for (const f of files) {
  if (!existsSync(f)) {
    console.error(`✗ missing ${f}`);
    process.exit(1);
  }
  console.log(`→ applying ${f} …`);
  try {
    execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", f], {
      stdio: "inherit",
    });
  } catch {
    console.error(`✗ failed applying ${f}`);
    process.exit(1);
  }
}

console.log("✓ database schema + seed applied");
