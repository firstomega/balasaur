import { useState } from "react";
import { Search, Zap, LogOut, User } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { DinoMark } from "./DinoMark";
import { useAuth } from "@/hooks/useAuth";
import { AuthDialog } from "./AuthDialog";
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

        {/* Center search */}
        <div className="mx-auto hidden w-full max-w-md md:block">
          <label className="relative block">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search titles, people, genres…"
              className="h-8 w-full rounded-[5px] border border-border bg-panel pl-8 pr-3 font-mono text-[12px] text-foreground placeholder:text-text-dim focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </label>
        </div>

        {/* Right nav */}
        <nav className="ml-auto flex items-center gap-1 md:gap-2">
          <Link
            to="/triage"
            className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-panel px-2.5 py-1.5 font-mono text-[12px] uppercase tracking-wide text-text-bright hover:border-primary hover:text-primary"
          >
            <Zap className="h-3.5 w-3.5" />
            Triage
          </Link>
          <Link
            to="/lists"
            className="hidden rounded-[5px] px-2.5 py-1.5 font-mono text-[12px] uppercase tracking-wide text-text-muted hover:text-text-bright sm:inline-block"
          >
            Lists
          </Link>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex max-w-[180px] items-center gap-1.5 rounded-[5px] border border-border bg-panel px-2.5 py-1.5 font-mono text-[12px] text-text-bright hover:border-border-strong"
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] uppercase text-primary-foreground">
                    {user.email?.[0] ?? "?"}
                  </span>
                  <span className="hidden truncate sm:inline">{user.email}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="border-border bg-panel font-mono text-[12px] text-text-bright"
              >
                <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                  Signed in
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-background">
                  <Link to="/account">
                    <User className="mr-2 h-3.5 w-3.5" />
                    Account
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
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </header>
  );
}