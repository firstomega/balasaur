import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { tmdbImage } from "@/lib/tmdbImage";

export type ProviderName = "Netflix" | "Max" | "Prime" | "Apple TV+" | "Hulu" | "Disney+";

interface ProviderMark {
  label: string;
  /** Brand background color when selected. */
  bg: string;
  /** Foreground/glyph color when selected. */
  fg: string;
  /** Inner SVG content (viewBox 0 0 32 32). */
  glyph: React.ReactNode;
}

const MARKS: Record<ProviderName, ProviderMark> = {
  Netflix: {
    label: "Netflix",
    bg: "#000000",
    fg: "#E50914",
    glyph: (
      <g>
        <rect x="8" y="5" width="4.2" height="22" fill="currentColor" />
        <rect x="19.8" y="5" width="4.2" height="22" fill="currentColor" />
        <polygon points="8,5 12.2,5 24,27 19.8,27" fill="currentColor" />
      </g>
    ),
  },
  Max: {
    label: "Max",
    bg: "#0B0B0B",
    fg: "#A78BFA",
    glyph: (
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fontFamily="Archivo, system-ui, sans-serif"
        fontWeight={800}
        fontSize="14"
        fill="currentColor"
        letterSpacing="-0.5"
      >
        MAX
      </text>
    ),
  },
  Prime: {
    label: "Prime Video",
    bg: "#00050D",
    fg: "#00A8E1",
    glyph: (
      <g>
        <text
          x="16"
          y="17"
          textAnchor="middle"
          fontFamily="Archivo, system-ui, sans-serif"
          fontWeight={700}
          fontSize="8"
          fill="currentColor"
        >
          prime
        </text>
        <path
          d="M6 22 Q16 28 26 22"
          stroke="currentColor"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M24 21.2 l2 0.6 l-0.6 2"
          stroke="currentColor"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    ),
  },
  "Apple TV+": {
    label: "Apple TV+",
    bg: "#000000",
    fg: "#FFFFFF",
    // Clean Apple mark (fallback only — the real logo loads when TMDB has it).
    glyph: (
      <g fill="currentColor" transform="translate(4 4)">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </g>
    ),
  },
  Hulu: {
    label: "Hulu",
    bg: "#0B0B0B",
    fg: "#1CE783",
    glyph: (
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fontFamily="Archivo, system-ui, sans-serif"
        fontWeight={900}
        fontSize="13"
        fill="currentColor"
        letterSpacing="-0.5"
      >
        hulu
      </text>
    ),
  },
  "Disney+": {
    label: "Disney+",
    bg: "#0B1A3A",
    fg: "#FFFFFF",
    glyph: (
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fontFamily="Archivo, system-ui, sans-serif"
        fontWeight={800}
        fontSize="13"
        fill="currentColor"
        letterSpacing="-0.5"
      >
        D+
      </text>
    ),
  },
};

interface ProviderIconProps {
  provider: ProviderName | string;
  /** Fallback logo URL when provider is not in the built-in MARKS map. */
  logoUrl?: string;
  /** Display label override (used for tooltip / aria-label). */
  label?: string;
  selected?: boolean;
  onClick?: () => void;
  size?: number;
  /** Render as a non-interactive badge instead of a toggle button. */
  asBadge?: boolean;
  className?: string;
}

export function ProviderIcon({
  provider,
  logoUrl,
  label,
  selected = false,
  onClick,
  size = 36,
  asBadge = false,
  className,
}: ProviderIconProps) {
  const mark = (MARKS as Record<string, ProviderMark | undefined>)[provider];
  const displayLabel = label ?? mark?.label ?? provider;

  const tile = (
    <span
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-[5px] border transition-all",
        selected
          ? "border-primary ring-1 ring-primary/60 shadow-[0_0_0_1px_var(--tw-shadow-color)] shadow-primary/20"
          : "border-border bg-panel grayscale opacity-60 hover:opacity-100 hover:border-border-strong hover:grayscale-0",
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: selected && mark && !logoUrl ? mark.bg : undefined,
        color: selected && mark && !logoUrl ? mark.fg : "var(--text-muted, #9ca3af)",
      }}
      aria-hidden="true"
    >
      {/* Prefer the real (official) logo; fall back to the built-in glyph, then initials. */}
      {logoUrl ? (
        <img
          src={tmdbImage(logoUrl, "w92")}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : mark ? (
        <svg viewBox="0 0 32 32" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
          {mark.glyph}
        </svg>
      ) : (
        <span className="font-mono text-[8px] uppercase tracking-wider">
          {displayLabel.slice(0, 3)}
        </span>
      )}
    </span>
  );

  if (asBadge) {
    return (
      <span className={cn("inline-flex", className)} title={displayLabel}>
        {tile}
      </span>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            aria-label={displayLabel}
            className={cn(
              "cursor-pointer rounded-[5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              className,
            )}
          >
            {tile}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="font-mono text-[10px] uppercase tracking-wider">
          {displayLabel}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
