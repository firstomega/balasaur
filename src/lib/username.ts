// Username (the public @handle) rules + helpers. Pure functions, shared by the
// profile editor (client) and the profile server functions (server) so the rules
// can never drift between where we *check* and where we *enforce*.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

// Handles that collide with real routes or would be confusing/abusive. Kept
// lowercase; compare against the normalized handle.
export const RESERVED_USERNAMES = new Set<string>([
  "account",
  "profile",
  "profiles",
  "settings",
  "admin",
  "api",
  "watched",
  "lists",
  "list",
  "triage",
  "privacy",
  "terms",
  "movie",
  "movies",
  "tv",
  "person",
  "people",
  "u",
  "user",
  "users",
  "me",
  "robots",
  "sitemap",
  "login",
  "logout",
  "signin",
  "signup",
  "signout",
  "auth",
  "about",
  "help",
  "support",
  "balasaur",
  "home",
  "search",
  "explore",
  "new",
  "edit",
  "null",
  "undefined",
  "static",
  "assets",
  "public",
]);

/** Lowercase + trim. Handles are case-insensitive (citext in the DB). */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export interface UsernameCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a *normalized* handle against the format + reserved rules. Does NOT
 * check availability (that needs the DB) — see checkUsername server fn.
 */
export function validateUsername(name: string): UsernameCheck {
  if (name.length < USERNAME_MIN)
    return { ok: false, reason: `At least ${USERNAME_MIN} characters.` };
  if (name.length > USERNAME_MAX)
    return { ok: false, reason: `At most ${USERNAME_MAX} characters.` };
  if (!/^[a-z0-9_]+$/.test(name))
    return { ok: false, reason: "Only letters, numbers, and underscores." };
  if (/^_|_$/.test(name)) return { ok: false, reason: "Can't start or end with an underscore." };
  if (RESERVED_USERNAMES.has(name)) return { ok: false, reason: "That handle is reserved." };
  return { ok: true };
}

/**
 * Build a valid starter handle from an email or display name. Strips invalid
 * characters, clamps length, and guarantees the result passes validateUsername
 * (falls back to "user" if the seed is empty). Uniqueness is the caller's job.
 */
export function usernameBaseFromSeed(seed: string | null | undefined): string {
  let base = (seed ?? "")
    .toLowerCase()
    .replace(/@.*$/, "") // drop email domain
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^_+|_+$/g, "")
    .slice(0, USERNAME_MAX);
  if (base.length < USERNAME_MIN) base = `user${base}`.slice(0, USERNAME_MAX);
  return base;
}
