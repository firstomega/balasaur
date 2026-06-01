// Preset/initials avatar helpers (MVP — real photo uploads come later). Kept out of
// the Avatar component file so fast-refresh only sees a component export there.

export const AVATAR_PRESETS: { key: string; bg: string }[] = [
  { key: "indigo", bg: "#6366f1" },
  { key: "emerald", bg: "#10b981" },
  { key: "amber", bg: "#f59e0b" },
  { key: "rose", bg: "#f43f5e" },
  { key: "sky", bg: "#0ea5e9" },
  { key: "violet", bg: "#8b5cf6" },
  { key: "teal", bg: "#14b8a6" },
  { key: "orange", bg: "#fb923c" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Resolve the background color: explicit preset if valid, else hashed from the handle. */
export function avatarBg(username: string, preset?: string | null): string {
  if (preset) {
    const found = AVATAR_PRESETS.find((p) => p.key === preset);
    if (found) return found.bg;
  }
  return AVATAR_PRESETS[hashString(username || "?") % AVATAR_PRESETS.length].bg;
}

/** 1–2 initials from a display name (preferred) or the handle. */
export function avatarInitials(displayName: string, username: string): string {
  const src = (displayName || username || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
