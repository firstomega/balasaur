interface DinoMarkProps {
  className?: string;
}

// Friendly, minimalist dino glyph — rounded, characterful, NOT prehistoric/fossil.
export function DinoMark({ className }: DinoMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* body + head */}
      <path d="M4 17c0-3 2-5 5-5h2c2 0 3-1 3-3 0-2 2-3 4-3 1.5 0 3 1 3 3v2c0 4-3 7-7 7H6c-1 0-2-.5-2-1z" />
      {/* tail */}
      <path d="M4 17l-2 2" />
      {/* legs */}
      <path d="M8 17v3M12 17v3" />
      {/* eye */}
      <circle cx="18" cy="9" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}