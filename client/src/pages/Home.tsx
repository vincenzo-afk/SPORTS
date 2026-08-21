import type { MatchState, SportCode } from "@shared/sports";
import { MatchCard, MatchCardSkeleton, FavoriteEmpty } from "@/components/sports/MatchCard";
import { FeedEmpty, FeedError } from "@/components/sports/ViewStates";
import { SportsAppLayout } from "@/components/SportsAppLayout";
import { useFavoriteMatches } from "@/hooks/useFavoriteMatches";
import { trpc } from "@/lib/trpc";
import { BellRing, CalendarDays, ChevronRight, CircleDot, Flame, Search, Star, Trophy, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

type SportFilter = "all" | SportCode;

const sports: Array<{ id: SportFilter; label: string; glyph: string }> = [
  { id: "all", label: "All Sports", glyph: "✦" }, { id: "football", label: "Football", glyph: "FT" }, { id: "basketball", label: "Basketball", glyph: "BK" }, { id: "tennis", label: "Tennis", glyph: "TN" }, { id: "cricket", label: "Cricket", glyph: "CR" }, { id: "rugby", label: "Rugby", glyph: "RG" }, { id: "ice-hockey", label: "Ice Hockey", glyph: "IH" }, { id: "volleyball", label: "Volleyball", glyph: "VB" }];
const stateTabs: Array<{ id: MatchState; label: string }> = [{ id: "live", label: "Live" }, { id: "upcoming", label: "Upcoming" }, { id: "finished", label: "Finished" }];

export default function Home() {
  const [state, setState] = useState<MatchState>("live");
  const [sport, setSport] = useState<SportFilter>("all");
  const [search, setSearch] = useState("");
  const { favoriteIds, isReady, toggleFavorite } = useFavoriteMatches();
  const hasSearch = Boolean(search.trim());
  const feedInput = useMemo(() => ({ state: hasSearch ? undefined : state, sport: sport === "all" ? undefined : sport, search: search.trim() || undefined }), [hasSearch, state, sport, search]);
  const feed = trpc.sports.feed.useQuery(feedInput, { refetchInterval: 45_000, refetchIntervalInBackground: false, staleTime: 20_000 });

  const favoriteMatches = useMemo(() => (feed.data?.matches ?? []).filter((match) => favoriteIds.includes(match.id)), [feed.data?.matches, favoriteIds]);
  const liveCount = (feed.data?.matches ?? []).filter((match) => match.status === "live").length;
  const pageLabel = hasSearch ? "search" : state === "live" ? "live" : state === "upcoming" ? "upcoming" : "finished";

  return <SportsAppLayout onSearch={setSearch} searchValue={search}>
    <main className="mx-auto w-full max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-[26px] border border-[#31535a] bg-[linear-gradient(112deg,#112d30,#0e222c_48%,#192c20)] px-5 py-5 shadow-[0_20px_70px_rgba(0,0,0,0.19)] sm:px-7 sm:py-6">
        <div className="absolute right-[-36px] top-[-64px] h-48 w-48 rounded-full border-[26px] border-[#a6ff00]/10" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#bde684]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#a6ff00]" />Streaming now</div><h1 className="display text-4xl font-bold uppercase leading-none tracking-[0.015em] text-white sm:text-5xl">Every match. <span className="text-[#b7ff42]">One rhythm.</span></h1><p className="mt-2 max-w-lg text-sm text-[#9fbbbd]">Live scores, lineups, and momentum — curated around the sports you care about.</p></div>
          <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-[#629252]/35 bg-[#0a1c1e]/55 p-3.5 backdrop-blur"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#a6ff00] text-[#102318]"><Flame size={21} /></span><span><span className="display block text-3xl font-bold leading-none text-white">{liveCount.toString().padStart(2, "0")}</span><span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#9bb7a2]">Live now</span></span></div>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-[#29454c] bg-[#0e2026]/90 p-3 edge-glow">
        <div className="mb-2 flex items-center gap-2 px-1"><Star size={14} className="text-[#b6ff47]" fill="currentColor" /><h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#c5d7d8]">Pinned matches</h2>{favoriteMatches.length > 0 && <span className="rounded-full bg-[#a6ff00]/12 px-1.5 py-0.5 text-[10px] font-bold text-[#b8ff4b]">{favoriteMatches.length}</span>}</div>
        <div className="scrollbar-none flex gap-3 overflow-x-auto pb-0.5">{!isReady || feed.isLoading ? <><div className="h-[90px] min-w-[254px] animate-pulse rounded-xl bg-[#193238]" /><div className="hidden h-[90px] min-w-[254px] animate-pulse rounded-xl bg-[#193238] sm:block" /></> : favoriteMatches.length > 0 ? favoriteMatches.map((match) => <MatchCard key={match.id} match={match} isFavorite onToggleFavorite={toggleFavorite} compact />) : <FavoriteEmpty />}</div>
      </section>

      <div className="mt-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#243f44] text-[#a6ff00]"><CircleDot size={15} /></span><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#a3bec0]">Scoreboard</p></div><h2 className="display mt-1 text-3xl font-bold uppercase tracking-wide text-white">Today&apos;s action</h2></div>
        <div className="flex items-center gap-3"><span className="hidden text-xs text-[#80999d] sm:inline">Refreshed {feed.data ? "just now" : "—"}</span><button onClick={() => feed.refetch()} className="flex items-center gap-1.5 rounded-xl border border-[#335259] bg-[#13272d] px-3 py-2 text-xs font-semibold text-[#d8e8e8] hover:border-[#4d777f]"><Zap size={13} className="text-[#b8ff48]" />Refresh</button></div>
      </div>

      <section className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none" aria-label="Sport filters">{sports.map((item) => <button key={item.id} onClick={() => setSport(item.id)} className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition-colors ${sport === item.id ? "border-[#a6ff00]/55 bg-[#a6ff00]/12 text-[#cbff82]" : "border-[#2b464d] bg-[#11262c] text-[#9bb4b7] hover:border-[#45646a] hover:text-white"}`}><span className={`grid h-5 min-w-5 place-items-center rounded-md text-[8px] ${sport === item.id ? "bg-[#a6ff00] text-[#14231a]" : "bg-[#213b40] text-[#bbd4d5]"}`}>{item.glyph}</span>{item.label}</button>)}</section>

      <section className="mt-5 flex flex-col gap-3 border-b border-[#2b464d] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-xl border border-[#2d474d] bg-[#0d1d22] p-1">{stateTabs.map((tab) => <button key={tab.id} onClick={() => setState(tab.id)} className={`rounded-lg px-4 py-2 text-xs font-bold transition-colors ${state === tab.id ? "bg-[#28464a] text-[#effff0] shadow-sm" : "text-[#819da1] hover:text-white"}`}>{tab.id === "live" && <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${state === tab.id ? "bg-[#a6ff00]" : "bg-[#597377]"}`} />}{tab.label}</button>)}</div>
        <div className="flex items-center gap-3"><label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-[#2c484f] bg-[#10242a] px-3 lg:hidden"><Search size={15} className="text-[#849fa2]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search score center" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#70898d]" /></label><button className="hidden items-center gap-2 rounded-xl border border-[#2c484f] bg-[#10242a] px-3 py-2.5 text-xs font-semibold text-[#b8ced0] sm:flex"><CalendarDays size={14} />Today <ChevronRight size={13} /></button></div>
      </section>

      <section className="mt-5"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold text-[#e5f1ed]"><span className="mr-2 text-[#86a1a5]">{hasSearch ? `Search results for “${search.trim()}”` : state === "live" ? "Live matches" : state === "upcoming" ? "Coming up" : "Final scores"}</span>{feed.data && <span className="rounded-full bg-[#244147] px-2 py-0.5 text-[10px] text-[#c4d7d7]">{feed.data.matches.length}</span>}</p><span className="text-[11px] text-[#769095]">{hasSearch ? "All match states" : "Updates every 45 seconds"}</span></div>
        {feed.isLoading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><MatchCardSkeleton /><MatchCardSkeleton /><MatchCardSkeleton /></div> : feed.isError ? <FeedError onRetry={() => feed.refetch()} /> : (feed.data?.matches.length ?? 0) === 0 ? <FeedEmpty label={pageLabel} /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{feed.data?.matches.map((match) => <MatchCard key={match.id} match={match} isFavorite={favoriteIds.includes(match.id)} onToggleFavorite={toggleFavorite} />)}</div>}
      </section>

      {feed.data && <section className="mt-9 rounded-2xl border border-[#2c494e] bg-[#10262b]/70 px-4 py-3.5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-xs leading-5 text-[#98b2b4]">Explore leagues for tables, fixtures, and match context. The current feed runs through the <b className="font-semibold text-[#dceceb]">{feed.data.provider}</b> provider adapter.</p><div className="flex gap-2 overflow-x-auto scrollbar-none">{feed.data.leagues.slice(0, 4).map((league) => <Link key={league.id} href={`/league/${league.id}`} className="shrink-0 rounded-lg bg-[#1e3a40] px-2.5 py-1.5 text-[11px] font-bold text-[#c4dcdd] hover:bg-[#294e52]">{league.name}</Link>)}</div></div></section>}
    </main>
    <footer className="border-t border-[#213e45] px-4 py-6 text-center text-[11px] text-[#708b8e]">Matchday uses a secure server-side sports data adapter. Scores shown in this preview are demo data.</footer>
  </SportsAppLayout>;
}
