import { useState } from "react";
import { Zap, LogOut, User, Pencil, Settings, Library, Menu, Bookmark } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { DinoMark } from "./DinoMark";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useMyProfile";
import { Avatar } from "./Avatar";
import { AuthDialog } from "./AuthDialog";
import { TopBarSearch } from "./TopBarSearch";
import { useWatchlistCount } from "@/hooks/useWatchlistCount";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function TopBar() {
  const { user, signOut } = useAuth();
  const { data: profile } = useMyProfile();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Signed in with at least one title saved; otherwise the chip has no number.
  const saved = useWatchlistCount();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-grid items-center gap-4 px-4">
        {/* Mobile and tablet menu — below 1024px the bar can't fit five nav
            links beside search, so places live in a drawer and the search row
            breathes. */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Menu"
              className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-text-bright hover:bg-panel lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          {/* aria-describedby is explicitly cleared: the drawer is a nav list
              with no description, and Radix warns loudly when the prop is
              simply absent. */}
          <SheetContent
            side="left"
            aria-describedby={undefined}
            className="w-[260px] border-border bg-background p-0"
          >
            <SheetTitle className="px-4 pb-1 pt-4 font-display text-xl font-extrabold leading-none tracking-tight text-text-dim">
              Menu
            </SheetTitle>
            <nav aria-label="Primary" className="flex flex-col">
              <MenuLink to="/" label="Browse" exact onNavigate={() => setMenuOpen(false)} />
              <MenuLink
                to="/collections"
                label="Collections"
                onNavigate={() => setMenuOpen(false)}
              />
              <MenuLink to="/calendar" label="Calendar" onNavigate={() => setMenuOpen(false)} />
              <MenuLink to="/play" label="Play" onNavigate={() => setMenuOpen(false)} />
              <MenuLink to="/night" label="Movie Night" onNavigate={() => setMenuOpen(false)} />
              <div className="mx-4 my-2 border-t border-border" />
              <MenuLink
                to="/watched"
                label="Rate titles"
                icon={<Zap className="h-3.5 w-3.5" />}
                onNavigate={() => setMenuOpen(false)}
              />
              <MenuLink
                to="/library"
                label="My Library"
                icon={<Library className="h-3.5 w-3.5" />}
                onNavigate={() => setMenuOpen(false)}
              />
            </nav>
          </SheetContent>
        </Sheet>

        {/* Wordmark */}
        <Link to="/" className="flex shrink-0 items-center gap-2 text-text-bright">
          <DinoMark className="h-6 w-6 text-primary" />
          {/* Below 400px the glyph carries the brand alone, so the bar never
              outgrows the screen. */}
          <span className="font-display text-2xl font-extrabold lowercase leading-none tracking-tight max-[399px]:hidden">
            balasaur
          </span>
        </Link>

        {/* Primary nav — places (content spaces). Personal actions stay right.
            Hidden below 1024px: five places plus wordmark, search, and actions
            outgrow a tablet row, and forcing it made the whole PAGE scroll
            sideways. The places move to the drawer instead. */}
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          <NavPlace to="/" label="Browse" exact />
          <NavPlace to="/collections" label="Collections" />
          <NavPlace to="/calendar" label="Calendar" />
          <NavPlace to="/play" label="Play" />
          <NavPlace to="/night" label="Movie Night" />
        </nav>

        {/* Center search (tablet and up; phones get a full-width row below).
            min-w-0 lets it give ground first, so the bar itself can never push
            the page wider than the screen. */}
        <div className="mx-auto hidden w-full min-w-0 max-w-md md:block">
          <TopBarSearch />
        </div>

        {/* Right nav */}
        <nav className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
          <Link
            to="/watched"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-text-bright px-3 py-1 text-base font-bold text-text-bright transition-colors duration-fast hover:bg-text-bright hover:text-background"
          >
            <Zap className="h-3.5 w-3.5" />
            Rate
          </Link>
          {/* The Watchlist lives in the library. The count appears only for a
              signed-in visitor with something saved: a 0 tells a first-time
              visitor nothing. It is read after mount, never in cached HTML. */}
          <Link
            to="/library"
            aria-label={saved ? `Watchlist, ${saved} saved` : "Watchlist"}
            className="hidden items-center gap-1.5 rounded-full px-3 py-1 text-base font-semibold text-text-bright transition-colors duration-fast hover:bg-panel md:inline-flex"
          >
            <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden xl:inline">Watchlist</span>
            {saved ? (
              <span className="rounded-full bg-text-bright px-1.5 font-mono text-sm tabular-nums text-background">
                {saved}
              </span>
            ) : null}
          </Link>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex max-w-[200px] items-center gap-2 rounded-full border border-border-strong bg-background py-1 pl-1 pr-3 text-base font-semibold text-text-bright hover:bg-panel"
                >
                  {profile ? (
                    <Avatar
                      username={profile.username}
                      displayName={profile.displayName}
                      preset={profile.avatarPreset}
                      size={22}
                      className="text-[12px]"
                    />
                  ) : (
                    <span className="ph-no-capture inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-primary text-[11px] uppercase text-primary-foreground">
                      {user.email?.[0] ?? "?"}
                    </span>
                  )}
                  <span className="ph-no-capture hidden truncate sm:inline">
                    {profile ? profile.displayName || `@${profile.username}` : user.email}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-[210px] border-border bg-panel text-[13px] text-text-bright"
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
                        <span className="block truncate text-[12px] text-primary">
                          @{profile.username}
                        </span>
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-border" />
                    <DropdownMenuItem asChild className="cursor-pointer focus:bg-background">
                      <Link to="/$handle" params={{ handle: `@${profile.username}` }}>
                        <User className="mr-2 h-3.5 w-3.5" />
                        View profile
                      </Link>
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
                    <DropdownMenuLabel className="text-[12px] font-semibold text-text-dim">
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
              className="whitespace-nowrap rounded-full bg-primary px-3.5 py-1.5 text-base font-bold text-primary-foreground transition-colors duration-fast hover:bg-primary/85"
            >
              Sign in
            </button>
          )}
        </nav>
      </div>

      {/* Mobile second row: search alone, full width. The places moved into
          the drawer, which is what lets search breathe on a phone. */}
      <div className="mx-auto max-w-grid px-4 pb-2 md:hidden">
        <TopBarSearch />
      </div>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </header>
  );
}

// A primary-nav "place" link; the current place is an ink pill. `exact` keeps Browse
// from lighting up on every route (it only owns "/").
function NavPlace({ to, label, exact = false }: { to: string; label: string; exact?: boolean }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      activeProps={{ className: "bg-text-bright text-background" }}
      inactiveProps={{ className: "text-text-bright hover:bg-panel" }}
      className="whitespace-nowrap rounded-full px-3 py-1.5 text-base font-semibold transition-colors duration-fast"
    >
      {label}
    </Link>
  );
}

// A drawer row: same place, bigger touch target, active edge on the left.
function MenuLink({
  to,
  label,
  exact = false,
  icon,
  onNavigate,
}: {
  to: string;
  label: string;
  exact?: boolean;
  icon?: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      activeOptions={{ exact }}
      activeProps={{ className: "border-primary bg-panel text-text-bright" }}
      inactiveProps={{ className: "border-transparent text-text-muted hover:text-text-bright" }}
      className="flex items-center gap-2 border-l-2 px-4 py-2.5 text-lg font-bold transition-colors"
    >
      {icon}
      {label}
    </Link>
  );
}
