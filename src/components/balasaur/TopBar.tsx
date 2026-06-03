import { useState } from "react";
import { Zap, LogOut, User, Pencil, Settings, Library } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { DinoMark } from "./DinoMark";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useMyProfile";
import { Avatar } from "./Avatar";
import { AuthDialog } from "./AuthDialog";
import { TopBarSearch } from "./TopBarSearch";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function TopBar() {
  const { user, signOut } = useAuth();
  const { data: profile } = useMyProfile();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-4 px-4">
        {/* Wordmark */}
        <a href="/" className="flex items-center gap-2 text-text-bright">
          <DinoMark className="h-5 w-5 text-primary" />
          <span className="font-mono text-[15px] font-medium lowercase tracking-tight">
            balasaur
          </span>
        </a>

        {/* Center search (desktop only; mobile gets a full-width row below) */}
        <div className="mx-auto hidden w-full max-w-md md:block">
          <TopBarSearch />
        </div>

        {/* Right nav */}
        <nav className="ml-auto flex items-center gap-1 md:gap-2">
          <Link
            to="/watched"
            className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-panel px-2.5 py-1.5 font-mono text-[12px] uppercase tracking-wide text-text-bright hover:border-primary hover:text-primary"
          >
            <Zap className="h-3.5 w-3.5" />
            Build
          </Link>
          <Link
            to="/lists"
            aria-label="My lists"
            className="inline-flex items-center gap-1.5 rounded-[5px] px-2 py-1.5 font-mono text-[12px] uppercase tracking-wide text-text-muted hover:text-text-bright sm:px-2.5"
          >
            <Library className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Lists</span>
          </Link>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex max-w-[200px] items-center gap-2 rounded-[5px] border border-border bg-panel px-2 py-1 font-mono text-[12px] text-text-bright hover:border-border-strong"
                >
                  {profile ? (
                    <Avatar
                      username={profile.username}
                      displayName={profile.displayName}
                      preset={profile.avatarPreset}
                      size={22}
                      className="text-[10px]"
                    />
                  ) : (
                    <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-primary text-[10px] uppercase text-primary-foreground">
                      {user.email?.[0] ?? "?"}
                    </span>
                  )}
                  <span className="hidden truncate sm:inline">
                    {profile ? profile.displayName || `@${profile.username}` : user.email}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-[210px] border-border bg-panel font-mono text-[12px] text-text-bright"
              >
                {profile ? (
                  <>
                    {/* Public identity */}
                    <DropdownMenuLabel className="flex items-center gap-2 py-2">
                      <Avatar
                        username={profile.username}
                        displayName={profile.displayName}
                        preset={profile.avatarPreset}
                        size={30}
                        className="text-[12px]"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] text-text-bright">
                          {profile.displayName || profile.username}
                        </span>
                        <span className="block truncate text-[10px] text-primary">
                          @{profile.username}
                        </span>
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-border" />
                    <DropdownMenuItem asChild className="cursor-pointer focus:bg-background">
                      <a href={`/@${profile.username}`}>
                        <User className="mr-2 h-3.5 w-3.5" />
                        View profile
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="cursor-pointer focus:bg-background">
                      <Link to="/profile">
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Edit profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-border" />
                  </>
                ) : (
                  <>
                    <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                      Signed in
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-border" />
                  </>
                )}
                {/* Private settings — deliberately separate from the public profile above */}
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-background">
                  <Link to="/account">
                    <Settings className="mr-2 h-3.5 w-3.5" />
                    Account settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => signOut()}
                  className="cursor-pointer focus:bg-background"
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="rounded-[5px] bg-primary px-3 py-1.5 font-mono text-[12px] font-medium uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign in
            </button>
          )}
        </nav>
      </div>

      {/* Search (mobile) — full-width second row, since it doesn't fit the top bar */}
      <div className="mx-auto max-w-[1600px] px-4 pb-2 md:hidden">
        <TopBarSearch />
      </div>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </header>
  );
}
