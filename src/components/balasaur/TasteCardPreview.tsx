import { useEffect, useRef, useState, type ReactNode } from "react";
import { Image as ImageIcon, Share2 } from "lucide-react";
import { DinoMark } from "@/components/balasaur/DinoMark";
import {
  TASTE_CARD_H,
  TASTE_CARD_W,
  renderTasteCard,
  saveTasteCard,
  shareTasteCard,
  type TasteCardOptions,
  type TasteCardOutcome,
} from "@/lib/tasteCard";

/**
 * The card, drawn once and shown at the size it will be shared at. What is on
 * screen is the PNG itself, not a mock-up of it, so nobody posts something
 * they have not seen.
 *
 * The draw is deferred to an effect and its result is cached, so both buttons
 * hand over the same bytes and neither pays for a second render. Both stay
 * disabled until those bytes exist: Safari only opens the share sheet from a
 * call made inside the click itself, and a share that had to wait for a render
 * first would be refused.
 *
 * `example` is the state the taste page opens in, before it knows whose list it
 * is looking at. It draws a card from a sample shelf, says so on the image
 * frame, and hands the buttons over to whatever gets the visitor their own:
 * an example card is never shareable, because it is not about anybody.
 */
export interface TasteCardPreviewProps {
  options: TasteCardOptions;
  className?: string;
  /** Mark the card as a sample and hide the share controls. */
  example?: boolean;
  /** Replaces Share and Save. Required in the example state. */
  action?: ReactNode;
  /** One line under the card, above whatever the controls are. */
  note?: ReactNode;
}

const SHARE_BTN =
  "inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[14px] font-black tracking-[-0.01em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60";
const SAVE_BTN =
  "inline-flex cursor-pointer items-center gap-2 rounded-full border border-border-strong bg-background px-4 py-2.5 text-[14px] font-semibold text-text-bright transition-colors hover:border-primary hover:text-primary disabled:opacity-60";

function outcomeLine(o: TasteCardOutcome | null): string | null {
  if (o === "blocked") return "Allow pop-ups to open the image.";
  if (o === "failed") return "The image did not draw.";
  if (o === "opened") return "Opened in a new tab.";
  if (o === "saved") return "Saved to your downloads.";
  return null;
}

export function TasteCardPreview({
  options,
  className,
  example,
  action,
  note,
}: TasteCardPreviewProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [drawFailed, setDrawFailed] = useState(false);
  const [busy, setBusy] = useState<"share" | "save" | null>(null);
  const [outcome, setOutcome] = useState<TasteCardOutcome | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const key = JSON.stringify(options);
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setSrc(null);
    setDrawFailed(false);
    blobRef.current = null;
    (async () => {
      try {
        const blob = await renderTasteCard(options);
        if (cancelled) return;
        blobRef.current = blob;
        url = URL.createObjectURL(blob);
        setSrc(url);
      } catch {
        if (!cancelled) setDrawFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // `key` is the serialized options; the object identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const run = async (which: "share" | "save") => {
    setBusy(which);
    setOutcome(null);
    const result =
      which === "share"
        ? await shareTasteCard(options, blobRef.current ?? undefined)
        : await saveTasteCard(options, blobRef.current ?? undefined);
    setBusy(null);
    setOutcome(result === "shared" || result === "cancelled" ? null : result);
  };

  const alt = `${example ? "Example card. " : ""}${options.name}. ${options.evidence} ${options.counts.liked} Loved, ${options.counts.watched} watched, ${options.counts.want} on the watchlist.`;

  return (
    <div className={className}>
      <div
        className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-[10px] border border-border bg-panel"
        style={{ aspectRatio: `${TASTE_CARD_W} / ${TASTE_CARD_H}` }}
      >
        {src ? (
          <img src={src} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <DinoMark size={40} mood={drawFailed ? "sleep" : "calm"} className="text-primary/70" />
            <p className="text-[13px] text-text-muted">
              {drawFailed ? "This browser did not draw the card." : "Drawing the card."}
            </p>
          </div>
        )}
        {example && (
          <span className="absolute right-3 top-3 rounded-full bg-background/85 px-3 py-1 text-[11.5px] font-black tracking-[-0.01em] text-text-muted">
            Example
          </span>
        )}
      </div>

      {note && (
        <p className="mx-auto mt-4 max-w-[420px] text-center text-[13px] leading-relaxed text-text-dim">
          {note}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {example ? (
          action
        ) : (
          <>
            <button
              type="button"
              onClick={() => run("share")}
              disabled={!!busy || !src}
              className={SHARE_BTN}
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              {busy === "share" ? "Sharing" : "Share"}
            </button>
            <button
              type="button"
              onClick={() => run("save")}
              disabled={!!busy || !src}
              className={SAVE_BTN}
            >
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
              {busy === "save" ? "Saving" : "Save image"}
            </button>
          </>
        )}
      </div>

      {!example && outcomeLine(outcome) && (
        <p className="mt-2 text-center text-[12.5px] text-text-muted">{outcomeLine(outcome)}</p>
      )}
    </div>
  );
}
