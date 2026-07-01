import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import type { BreadcrumbEntry } from "@/lib/breadcrumbTrail";

/** A playful trail of the views a user has wandered through this session (each
 *  step from a click on a genre/theme/origin chip, or a filter change) — click any
 *  earlier step to jump straight back to it instead of hammering the back button.
 *  Hidden until there's an actual trail (more than just the current view). */
export function Breadcrumbs({ trail, onClear }: { trail: BreadcrumbEntry[]; onClear: () => void }) {
  if (trail.length <= 1) return null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1 font-mono text-[10.5px] uppercase tracking-wider text-text-dim">
      {trail.map((entry, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">›</span>}
            {isLast ? (
              <span className="text-text-bright">{entry.label}</span>
            ) : (
              <Link
                to="/"
                search={entry.search}
                className="transition-colors hover:text-primary hover:underline"
              >
                {entry.label}
              </Link>
            )}
          </span>
        );
      })}
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear trail"
        className="ml-1 cursor-pointer text-text-dim hover:text-text-bright"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
