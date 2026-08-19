// Person-page data-prose, same house pattern as titleProse.ts: deterministic
// sentences from catalog statistics, every number reconstructable from the
// filmography rendered below it. Sentences are omitted when the fact is
// missing or too thin to mean anything.

import type { PersonDetail } from "@/types/media";

export function personProse(name: string, stats: NonNullable<PersonDetail["stats"]>): string {
  const parts: string[] = [];

  if (stats.titles >= 3) {
    const scored =
      stats.scored > 0 && stats.scored < stats.titles ? `, ${stats.scored} of them scored` : "";
    const median =
      typeof stats.medianScore === "number"
        ? ` with a median Balasaur Score of ${stats.medianScore}`
        : "";
    parts.push(`${stats.titles} titles in this catalog${scored}${median}.`);
  }

  if (
    stats.bestDecade &&
    typeof stats.bestDecadeMedian === "number" &&
    typeof stats.bestDecadeTitles === "number" &&
    stats.bestDecadeTitles >= 3 &&
    typeof stats.medianScore === "number" &&
    stats.bestDecadeMedian > stats.medianScore
  ) {
    parts.push(
      `The ${stats.bestDecade} rate best: median ${stats.bestDecadeMedian} across ${stats.bestDecadeTitles} titles.`,
    );
  }

  const collabs = stats.collaborators.filter((c) => c.together >= 3).slice(0, 3);
  if (collabs.length > 0) {
    const list = collabs
      .map((c, i) => (i === 0 ? `${c.name} (${c.together} titles)` : `${c.name} (${c.together})`))
      .join(", ");
    parts.push(`${name} appears most often alongside ${list}.`);
  }

  return parts.join(" ");
}
