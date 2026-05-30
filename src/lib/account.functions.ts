import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Export the signed-in user's account + activity as JSON.
 * Returns a plain DTO; client wraps it in a Blob.
 */
export const exportMyData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const { data: statuses, error } = await supabase
      .from("user_media_status")
      .select("*")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return {
      exported_at: new Date().toISOString(),
      account: {
        id: userId,
        email: (claims as { email?: string })?.email ?? null,
      },
      user_media_status: statuses ?? [],
    };
  });

/**
 * Delete all of the signed-in user's user_media_status rows. Keeps the account.
 */
export const clearMyActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_media_status")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Permanently delete the signed-in user. User id is derived from the
 * verified server-side auth context — never trust a client-supplied id.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    // Remove user activity first (FK-free, but keeps storage tidy).
    const { error: rowsErr } = await supabaseAdmin
      .from("user_media_status")
      .delete()
      .eq("user_id", userId);
    if (rowsErr) throw new Error(rowsErr.message);

    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authErr) throw new Error(authErr.message);
    return { ok: true };
  });