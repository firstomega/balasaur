import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { MediaDetail as MediaDetailType, ProviderRef } from "@/types/media";
import { ProviderIcon } from "./ProviderIcon";

const REGION_OPTIONS: { code: string; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "IE", label: "Ireland" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "NL", label: "Netherlands" },
  { code: "BR", label: "Brazil" },
  { code: "MX", label: "Mexico" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "IN", label: "India" },
];

const STORAGE_KEY = "balasaur:region";

function getInitialRegion(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(STORAGE_KEY) || fallback;
  } catch {
    return fallback;
  }
}

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-dim">
      {children}
    </div>
  );
}

function Group({
  label,
  items,
  link,
}: {
  label: string;
  items: ProviderRef[];
  link?: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-wider text-text-dim">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((p) => {
          const badge = (
            <ProviderIcon
              provider={p.name}
              logoUrl={p.logoUrl}
              label={p.name}
              selected
              size={32}
              asBadge
            />
          );
          // TMDB/JustWatch exposes a single deep link per title+region (the JustWatch
          // page listing every option), not per-provider URLs — so each chip opens
          // that page, where the user picks the service.
          return link ? (
            <a
              key={p.name}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Watch on ${p.name} — opens JustWatch`}
              className="rounded-[5px] transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            >
              {badge}
            </a>
          ) : (
            <span key={p.name}>{badge}</span>
          );
        })}
      </div>
    </div>
  );
}

export function WhereToWatch({ detail }: { detail: MediaDetailType }) {
  const providersAll = detail.providersAll;
  const defaultRegion = detail.providers?.region ?? "US";
  const [region, setRegion] = useState<string>(() => getInitialRegion(defaultRegion));

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, region);
    } catch {
      /* ignore */
    }
  }, [region]);

  if (!detail.providers && !providersAll) return null;

  const current =
    providersAll?.byRegion[region] ??
    (region === detail.providers?.region
      ? {
          stream: detail.providers.stream,
          rent: detail.providers.rent,
          buy: detail.providers.buy,
          link: detail.providers.link,
        }
      : { stream: [], rent: [], buy: [], link: undefined });

  const isEmpty =
    current.stream.length === 0 && current.rent.length === 0 && current.buy.length === 0;

  return (
    <div className="rounded-[5px] border border-border bg-panel p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <MicroLabel>Where to watch</MicroLabel>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          aria-label="Region"
          className="h-6 rounded-[4px] border border-border bg-background px-1.5 font-mono text-[10px] uppercase tracking-wider text-text-bright focus:border-border-strong focus:outline-none"
        >
          {REGION_OPTIONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.code}
            </option>
          ))}
        </select>
      </div>

      {isEmpty ? (
        <p className="font-mono text-[10.5px] text-text-dim">
          No streaming options found for {region}.
        </p>
      ) : (
        <div className="space-y-3">
          <Group label="Stream" items={current.stream} link={current.link} />
          <Group label="Rent" items={current.rent} link={current.link} />
          <Group label="Buy" items={current.buy} link={current.link} />
        </div>
      )}

      {current.link ? (
        <a
          href={current.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center gap-1 border-t border-border pt-2 font-mono text-[9px] uppercase tracking-wider text-text-dim hover:text-text-muted"
        >
          More options on JustWatch
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      ) : (
        <p className="mt-3 border-t border-border pt-2 font-mono text-[9px] uppercase tracking-wider text-text-dim">
          Streaming data by JustWatch.
        </p>
      )}
    </div>
  );
}
