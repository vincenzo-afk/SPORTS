import { Activity, Menu, Search, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

type SportsAppLayoutProps = { children: ReactNode; onSearch?: (value: string) => void; searchValue?: string; searchPlaceholder?: string; };

export function SportsAppLayout({ children, onSearch, searchValue, searchPlaceholder = "Search teams, leagues, matches" }: SportsAppLayoutProps) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = [{ label: "Scores", href: "/" }, { label: "Fixtures", href: "/" }, { label: "Leagues", href: "/league/premier-league" }];

  return <div className="app-grid min-h-screen text-[#151515]">
    <header className="sticky top-0 z-40 border-b-[3px] border-[#151515] bg-[#fffdf8]">
      <div className="mx-auto flex min-h-[72px] max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Matchday home">
          <span className="grid h-10 w-10 place-items-center border-[3px] border-[#151515] bg-[#ff6b4a] text-[#151515] shadow-[4px_4px_0_#151515]"><Activity size={21} strokeWidth={3} /></span>
          <span className="hidden leading-none sm:block"><span className="display block text-[26px] font-black uppercase">Matchday</span><span className="block pt-1 text-[8px] font-black uppercase tracking-[.24em] text-[#1857f6]">Live score riot</span></span>
        </Link>
        <nav className="ml-2 hidden items-center gap-2 md:flex" aria-label="Primary navigation">{navItems.map((item) => <Link key={item.label} href={item.href} className={`border-[2px] border-[#151515] px-3 py-2 text-xs font-black uppercase tracking-[.09em] transition-colors ${location === item.href && item.label === "Scores" ? "bg-[#1857f6] text-white" : "bg-[#fffdf8] hover:bg-[#ffe24a]"}`}>{item.label}</Link>)}</nav>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {onSearch && <label className="hidden h-10 w-[270px] items-center gap-2 border-[2px] border-[#151515] bg-white px-3 focus-within:bg-[#ffe24a] lg:flex"><Search size={16} className="shrink-0" strokeWidth={3} /><input aria-label="Search" value={searchValue ?? ""} onChange={(event) => onSearch(event.target.value)} placeholder={searchPlaceholder} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-[#6b655c]" /><kbd className="border border-[#151515] bg-[#f4f0e5] px-1.5 py-0.5 text-[9px] font-black">/</kbd></label>}
          <span className="hidden items-center gap-1.5 border-2 border-[#151515] bg-[#ffe24a] px-2.5 py-2 text-[9px] font-black uppercase tracking-[.1em] sm:flex"><Sparkles size={12} strokeWidth={3} />Demo</span>
          <button onClick={() => setMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center border-[3px] border-[#151515] bg-[#1857f6] text-white shadow-[3px_3px_0_#151515] md:hidden" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>{menuOpen ? <X size={21} strokeWidth={3} /> : <Menu size={21} strokeWidth={3} />}</button>
        </div>
      </div>
    </header>
    {menuOpen && <div className="fixed inset-x-0 top-[72px] z-30 border-b-[3px] border-[#151515] bg-[#ffe24a] px-4 py-4 shadow-[0_6px_0_#151515] md:hidden"><nav className="mx-auto grid max-w-7xl gap-2" aria-label="Mobile navigation">{navItems.map((item) => <Link key={item.label} onClick={() => setMenuOpen(false)} href={item.href} className={`border-[3px] border-[#151515] px-4 py-3 text-sm font-black uppercase ${location === item.href && item.label === "Scores" ? "bg-[#1857f6] text-white" : "bg-[#fffdf8]"}`}>{item.label}</Link>)}</nav></div>}
    {children}
  </div>;
}
