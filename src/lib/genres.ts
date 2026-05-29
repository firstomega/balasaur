// Unifies TMDB movie + TV genre names into a canonical list.
// One source genre can expand into multiple unified genres
// (e.g. TV's "Sci-Fi & Fantasy" maps to both "Science Fiction" and "Fantasy").
const GENRE_ALIASES: Record<string, string[]> = {
  "Sci-Fi & Fantasy": ["Science Fiction", "Fantasy"],
  "Action & Adventure": ["Action", "Adventure"],
  "War & Politics": ["War"],
  Kids: ["Family"],
  Soap: ["Drama"],
  News: ["Documentary"],
  Reality: ["Reality TV"],
};

// Canonical list of unified genres shown in the filter rail.
export const UNIFIED_GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Reality TV",
  "Romance",
  "Science Fiction",
  "Talk",
  "Thriller",
  "TV Movie",
  "War",
  "Western",
] as const;

export function unifyGenre(name: string): string[] {
  return GENRE_ALIASES[name] ?? [name];
}

export function unifyGenres(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    for (const u of unifyGenre(n)) {
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
  }
  return out;
}