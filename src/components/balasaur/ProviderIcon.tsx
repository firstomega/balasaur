import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ProviderName = "Netflix" | "Max" | "Prime" | "Apple TV+" | "Hulu";

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
    glyph: (
      <g fill="currentColor">
        <path d="M18.6 9.2c.7-.9 1.2-2.1 1-3.2-1 .05-2.2.65-2.95 1.55-.65.8-1.2 2-1.05 3.1 1.1.1 2.25-.55 3-1.45z" />
        <path d="M22.5 22.4c-.55 1.25-1.2 2.5-2.25 2.5-1 0-1.35-.6-2.55-.6s-1.55.6-2.55.6c-1.05 0-1.85-1.35-2.4-2.6-1.15-2.55-2.05-7.2.85-10.35.7-.75 1.95-1.45 3.25-1.45 1.1 0 2.05.6 2.7.6.65 0 1.85-.7 3.15-.6.55.025 2.1.225 3.05 1.65-3.1 1.9-2.55 6.1.75 7.2-.5 1.05-.85 1.4-.6.55l-3.4 2.5z" transform="scale(0.55) translate(8,8)" />
        <text
          x="16"
          y="23"
          textAnchor="middle"
          fontFamily="Archivo, system-ui, sans-serif"
          fontWeight={700}
          fontSize="7"
          fill="currentColor"
        >
          tv+
        </text>
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
};

interface ProviderIconProps {
  provider: ProviderName;
  selected?: boolean;
  onClick?: () => void;
  size?: number;
  /** Render as a non-interactive badge instead of a toggle button. */
  asBadge?: boolean;
  className?: string;
}

export function ProviderIcon({
  provider,
  selected = false,
  onClick,
  size = 36,
  asBadge = false,
  className,
}: ProviderIconProps) {
  const mark = MARKS[provider];

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
        backgroundColor: selected ? mark.bg : undefined,
        color: selected ? mark.fg : "var(--text-muted, #9ca3af)",
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        {mark.glyph}
      </svg>
    </span>
  );

  if (asBadge) {
    return (
      <span className={cn("inline-flex", className)} title={mark.label}>
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
            aria-label={mark.label}
            className={cn(
              "cursor-pointer rounded-[5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              className,
            )}
          >
            {tile}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="font-mono text-[10px] uppercase tracking-wider">
          {mark.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}