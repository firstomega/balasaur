import { cn } from "@/lib/utils";
import { avatarBg, avatarInitials } from "@/lib/avatar";

// Preset/initials avatar for the MVP — real photo uploads come later. Color is an
// explicit preset or deterministically derived from the handle. Helpers + presets
// live in @/lib/avatar so this file only exports a component (fast-refresh-friendly).
export function Avatar({
  username,
  displayName = "",
  preset,
  size = 40,
  className,
}: {
  username: string;
  displayName?: string;
  preset?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{
        background: avatarBg(username, preset),
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
      }}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-mono font-semibold leading-none text-white",
        className,
      )}
    >
      {avatarInitials(displayName, username)}
    </span>
  );
}
