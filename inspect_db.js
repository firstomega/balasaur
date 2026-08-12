import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = fs
  .readFileSync(".env", "utf8")
  .split("\n")
  .reduce((acc, line) => {
    const parts = line.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts
        .slice(1)
        .join("=")
        .trim()
        .replace(/^"(.*)"$/, "$1");
      acc[key] = val;
    }
    return acc;
  }, {});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from("media_cache")
    .select("id, detail_fetched_at")
    .eq("id", "tv-76479")
    .maybeSingle();

  if (error) {
    console.error(error);
    return;
  }

  if (data) {
    console.log("Cached detail_fetched_at:", data.detail_fetched_at);
  }
}

run();
