// Preset/initials avatar helpers (MVP — real photo uploads come later). Kept out of
// the Avatar component file so fast-refresh only sees a component export there.

/** Each fill carries the initials colour (a CSS value, for an inline style) that reads on it at 4.5:1. White on
 *  six of the eight measured 2.15 to 3.67, so those take the ink; indigo and
 *  violet are one step deeper so white clears the floor on them. */
export const AVATAR_PRESETS: { key: string; bg: string; ink: string }[] = [
  { key: "indigo", bg: "#4f46e5", ink: "var(--paper)" },
  { key: "emerald", bg: "#10b981", ink: "var(--ink)" },
  { key: "amber", bg: "#f59e0b", ink: "var(--ink)" },
  { key: "rose", bg: "#f43f5e", ink: "var(--ink)" },
  { key: "sky", bg: "#0ea5e9", ink: "var(--ink)" },
  { key: "violet", bg: "#7c3aed", ink: "var(--paper)" },
  { key: "teal", bg: "#14b8a6", ink: "var(--ink)" },
  { key: "orange", bg: "#fb923c", ink: "var(--ink)" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function avatarPreset(username: string, preset?: string | null) {
  const found = preset ? AVATAR_PRESETS.find((p) => p.key === preset) : undefined;
  return found ?? AVATAR_PRESETS[hashString(username || "?") % AVATAR_PRESETS.length];
}

/** Resolve the background color: explicit preset if valid, else hashed from the handle. */
export function avatarBg(username: string, preset?: string | null): string {
  return avatarPreset(username, preset).bg;
}

/** The initials colour for the same fill. */
export function avatarInk(username: string, preset?: string | null): string {
  return avatarPreset(username, preset).ink;
}

/** 1–2 initials from a display name (preferred) or the handle. */
export function avatarInitials(displayName: string, username: string): string {
  const src = (displayName || username || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
