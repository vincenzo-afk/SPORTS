import { Activity, Menu, Search, Sparkles, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import type { ReactNode } from "react";
import { useState } from "react";

type SportsAppLayoutProps = {
  children: ReactNode;
  onSearch?: (value: string) => void;
  searchValue?: string;
  searchPlaceholder?: string;
};

export function SportsAppLayout({ children, onSearch, searchValue, searchPlaceholder = "Search teams, leagues, matches" }: SportsAppLayoutProps) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-grid min-h-screen bg-[#071116] text-[#eef7ee]">
      <header className="sticky top-0 z-40 border-b border-[#29424c]/70 bg-[#091419]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="Matchday home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#a6ff00] text-[#0d2019] shadow-[0_0_24px_rgba(166,255,0,0.18)] transition-transform duration-200 group-hover:rotate-[-8deg]">
              <Activity size={20} strokeWidth={2.7} />
            </span>
            <span className="hidden leading-none xs:block">
              <span className="display block text-[22px] font-bold uppercase tracking-[0.08em] text-white">Matchday</span>
              <span className="block pt-1 text-[8px] font-bold uppercase tracking-[0.25em] text-[#89a3a8]">Live Sports Center</span>
            </span>
          </Link>

          <nav className="ml-2 hidden items-center gap-1 md:flex">
            <Link href="/" className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${location === "/" ? "bg-[#1b343a] text-[#d9ff9d]" : "text-[#9cb1b4] hover:bg-[#14272d] hover:text-white"}`}>Scores</Link>
            <Link href="/" className="rounded-lg px-3 py-2 text-sm font-semibold text-[#9cb1b4] transition-colors hover:bg-[#14272d] hover:text-white">Fixtures</Link>
            <Link href="/" className="rounded-lg px-3 py-2 text-sm font-semibold text-[#9cb1b4] transition-colors hover:bg-[#14272d] hover:text-white">Leagues</Link>
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            {onSearch && <label className="hidden h-10 w-[260px] items-center gap-2 rounded-xl border border-[#2b444b] bg-[#12252b]/75 px-3 transition-colors focus-within:border-[#a6ff00]/65 lg:flex">
              <Search size={16} className="shrink-0 text-[#90aaad]" />
              <input aria-label="Search" value={searchValue ?? ""} onChange={(event) => onSearch(event.target.value)} placeholder={searchPlaceholder} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#71898d]" />
              <kbd className="rounded border border-[#345057] px-1.5 py-0.5 text-[10px] font-semibold text-[#779094]">/</kbd>
            </label>}
            <span className="hidden items-center gap-1.5 rounded-full border border-[#355159] bg-[#11262d] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#bbd5d7] sm:flex">
              <Sparkles size={12} className="text-[#a6ff00]" /> Demo feed
            </span>
            <button onClick={() => setMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-xl border border-[#2b444b] bg-[#12252b] text-[#d6e4e5] md:hidden" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
          </div>
        </div>
      </header>
      {menuOpen && <div className="fixed inset-x-0 top-[68px] z-30 border-b border-[#34535a] bg-[#0c1b20]/98 px-4 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl md:hidden">
        <nav className="mx-auto grid max-w-7xl gap-1" aria-label="Mobile navigation">
          <Link onClick={() => setMenuOpen(false)} href="/" className={`rounded-xl px-4 py-3 text-sm font-bold ${location === "/" ? "bg-[#2a4b50] text-[#d8ff9d]" : "text-[#b3cbcd]"}`}>Scores</Link>
          <Link onClick={() => setMenuOpen(false)} href="/" className="rounded-xl px-4 py-3 text-sm font-bold text-[#b3cbcd] hover:bg-[#19343a]">Fixtures</Link>
          <Link onClick={() => setMenuOpen(false)} href="/league/premier-league" className="rounded-xl px-4 py-3 text-sm font-bold text-[#b3cbcd] hover:bg-[#19343a]">Leagues</Link>
        </nav>
      </div>}
      {children}
    </div>
  );
}
