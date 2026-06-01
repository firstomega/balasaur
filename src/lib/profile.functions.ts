import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TablesUpdate } from "@/integrations/supabase/types";
import {
  USERNAME_MAX,
  normalizeUsername,
  usernameBaseFromSeed,
  validateUsername,
} from "@/lib/username";

// Profile = the PUBLIC identity. These server fns are the only writers, and all of
// them derive the user id from the verified auth context — never from client input.
// (Public reads are unauthenticated; everything else requires a Bearer token.)

export interface ProfileDTO {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarPreset: string | null;
  isPublic: boolean;
  favoriteGenres: string[];
  createdAt: string;
}

interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_preset: string | null;
  is_public: boolean;
  favorite_genres: string[];
  created_at: string;
}

const PROFILE_COLS =
  "id, username, display_name, bio, avatar_preset, is_public, favorite_genres, created_at";

function toDTO(r: ProfileRow): ProfileDTO {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    bio: r.bio,
    avatarPreset: r.avatar_preset,
    isPublic: r.is_public,
    favoriteGenres: r.favorite_genres ?? [],
    createdAt: r.created_at,
  };
}

/** Case-insensitive (citext) availability check. `exceptId` lets you ignore your own row. */
async function usernameTaken(username: string, exceptId?: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as { id: string } | undefined;
  return !!row && row.id !== exceptId;
}

/**
 * Return the signed-in user's profile, creating one (with a unique starter handle
 * derived from their name/email) the first time it's requested. This is how both
 * new and pre-existing users lazily get a profile without a forced onboarding step.
 */
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfileDTO> => {
    const { userId, claims } = context;

    const { data: existing, error: selErr } = await supabaseAdmin
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("id", userId)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (existing) return toDTO(existing as unknown as ProfileRow);

    const c = claims as { email?: string; user_metadata?: { name?: string } };
    const seed = c.user_metadata?.name || c.email || "";
    const base = usernameBaseFromSeed(seed);
    let candidate = base;
    let attempt = 0;
    while (await usernameTaken(candidate)) {
      attempt++;
      if (attempt > 25) {
        candidate = `user_${userId.replace(/-/g, "").slice(0, 12)}`;
        break;
      }
      const suffix = String(Math.floor(1000 + Math.random() * 9000));
      candidate = `${base.slice(0, USERNAME_MAX - suffix.length)}${suffix}`;
    }

    const { data: created, error: insErr } = await supabaseAdmin
      .from("profiles")
      .insert({ id: userId, username: candidate, display_name: c.user_metadata?.name || base })
      .select(PROFILE_COLS)
      .single();
    if (insErr) {
      // Lost a race to a concurrent first-load — just re-read.
      const { data: again } = await supabaseAdmin
        .from("profiles")
        .select(PROFILE_COLS)
        .eq("id", userId)
        .maybeSingle();
      if (again) return toDTO(again as unknown as ProfileRow);
      throw new Error(insErr.message);
    }
    return toDTO(created as unknown as ProfileRow);
  });

export interface UpdateProfileInput {
  displayName?: string;
  username?: string;
  bio?: string;
  isPublic?: boolean;
  favoriteGenres?: string[];
  avatarPreset?: string | null;
}

/** Update the signed-in user's profile. Validates + enforces handle rules server-side. */
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpdateProfileInput) => input)
  .handler(async ({ data, context }): Promise<ProfileDTO> => {
    const { userId } = context;
    const patch: TablesUpdate<"profiles"> = { updated_at: new Date().toISOString() };

    if (typeof data.displayName === "string")
      patch.display_name = data.displayName.trim().slice(0, 60);
    if (typeof data.bio === "string") patch.bio = data.bio.trim().slice(0, 280);
    if (typeof data.isPublic === "boolean") patch.is_public = data.isPublic;
    if (Array.isArray(data.favoriteGenres))
      patch.favorite_genres = data.favoriteGenres.slice(0, 12).map((g) => String(g));
    if (data.avatarPreset === null || typeof data.avatarPreset === "string")
      patch.avatar_preset = data.avatarPreset;

    if (typeof data.username === "string") {
      const uname = normalizeUsername(data.username);
      const v = validateUsername(uname);
      if (!v.ok) throw new Error(v.reason ?? "Invalid username.");
      if (await usernameTaken(uname, userId)) throw new Error("That handle is already taken.");
      patch.username = uname;
    }

    const { data: updated, error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("id", userId)
      .select(PROFILE_COLS)
      .single();
    if (error) throw new Error(error.message);
    return toDTO(updated as unknown as ProfileRow);
  });

/** Live "is this handle free?" check for the editor. */
export const checkUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string }) => input)
  .handler(async ({ data, context }): Promise<{ available: boolean; reason?: string }> => {
    const uname = normalizeUsername(data.username ?? "");
    const v = validateUsername(uname);
    if (!v.ok) return { available: false, reason: v.reason };
    if (await usernameTaken(uname, context.userId))
      return { available: false, reason: "Already taken." };
    return { available: true };
  });

export interface PublicMediaItem {
  mediaId: string;
  mediaType: string;
  title: string;
  posterUrl: string | null;
  year: string | null;
}

export interface PublicProfileData {
  found: boolean;
  isPrivate?: boolean;
  profile?: {
    username: string;
    displayName: string;
    bio: string;
    avatarPreset: string | null;
    favoriteGenres: string[];
    createdAt: string;
  };
  stats?: { watched: number; liked: number; want: number };
  watched?: PublicMediaItem[];
  liked?: PublicMediaItem[];
}

/**
 * Public read for the /@handle page — NO auth required. Returns the profile plus a
 * snapshot of their watch activity, but only when the profile is public.
 */
export const getPublicProfile = createServerFn({ method: "GET" })
  .inputValidator((input: { username: string }) => input)
  .handler(async ({ data }): Promise<PublicProfileData> => {
    const uname = normalizeUsername(data.username ?? "");
    if (!uname) return { found: false };

    const { data: prof, error } = await supabaseAdmin
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("username", uname)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!prof) return { found: false };
    const p = prof as unknown as ProfileRow;

    if (!p.is_public) {
      return {
        found: true,
        isPrivate: true,
        profile: {
          username: p.username,
          displayName: p.display_name,
          bio: "",
          avatarPreset: p.avatar_preset,
          favoriteGenres: [],
          createdAt: p.created_at,
        },
      };
    }

    const { data: rows, error: rErr } = await supabaseAdmin
      .from("user_media_status")
      .select(
        "media_id, media_type, title, poster_url, year, status, sentiment, intent, updated_at",
      )
      .eq("user_id", p.id)
      .order("updated_at", { ascending: false });
    if (rErr) throw new Error(rErr.message);

    type StatusRow = {
      media_id: string;
      media_type: string;
      title: string;
      poster_url: string | null;
      year: string | null;
      status: string;
      sentiment: string | null;
      intent: string | null;
    };
    const all = (rows ?? []) as StatusRow[];
    const toItem = (r: StatusRow): PublicMediaItem => ({
      mediaId: r.media_id,
      mediaType: r.media_type,
      title: r.title,
      posterUrl: r.poster_url,
      year: r.year,
    });
    const watched = all.filter((r) => r.status === "seen");
    const liked = all.filter((r) => r.sentiment === "liked");
    const want = all.filter((r) => r.intent === "want");

    return {
      found: true,
      profile: {
        username: p.username,
        displayName: p.display_name,
        bio: p.bio,
        avatarPreset: p.avatar_preset,
        favoriteGenres: p.favorite_genres ?? [],
        createdAt: p.created_at,
      },
      stats: { watched: watched.length, liked: liked.length, want: want.length },
      watched: watched.slice(0, 60).map(toItem),
      liked: liked.slice(0, 60).map(toItem),
    };
  });
