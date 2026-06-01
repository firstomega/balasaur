import { useQuery } from "@tanstack/react-query";
import { getMyProfile, type ProfileDTO } from "@/lib/profile.functions";
import { useAuth } from "./useAuth";

/**
 * The signed-in user's own profile (public identity). Lazily creates one on the
 * server the first time it's fetched. Returns null when signed out.
 */
export function useMyProfile() {
  const { user } = useAuth();
  return useQuery<ProfileDTO | null>({
    queryKey: ["my-profile", user?.id ?? null],
    queryFn: async () => (user ? await getMyProfile() : null),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
