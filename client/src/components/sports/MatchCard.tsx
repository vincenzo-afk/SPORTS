import type { SportsMatch } from "@shared/sports";
import { Clock3, Heart, MapPin, Star } from "lucide-react";
import { Link } from "wouter";

type MatchCardProps = {
  match: SportsMatch;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  compact?: boolean;
};

function Crest({ name, shortName, color, size = "md" }: { name: string; shortName: string; color: string; size?: "sm" | "md" }) {
  return <span title={name} aria-label={`${name} crest`} className={`${size === "sm" ? "h-7 w-7 text-[9px]" : "h-10 w-10 text-[11px]"} grid shrink-0 place-items-center rounded-[13px] border border-white/15 font-bold tracking-tight text-white shadow-inner`} style={{ background: `linear-gradient(145deg, ${color}, #10252b)` }}>{shortName.slice(0, 3)}</span>;
}

function StatusPill({ match }: { match: SportsMatch }) {
  if (match.status === "live") return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ceff73]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#caff77]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#a6ff00]" />{match.statusDetail}</span>;
  if (match.status === "finished") return <span className="rounded-full bg-[#e9f3f4]/7 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9db6b8]">{match.statusDetail}</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-[#55c8ff]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#7dd9ff]"><Clock3 size={10} />{match.statusDetail}</span>;
}

export function MatchCard({ match, isFavorite, onToggleFavorite, compact = false }: MatchCardProps) {
  return (
    <article className={`group relative overflow-hidden rounded-2xl border border-[#2a444a] bg-[#102126]/86 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#3d6169] hover:bg-[#14282e] ${compact ? "min-w-[246px]" : ""}`}>
      {match.status === "live" && <span className="absolute inset-y-0 left-0 w-0.5 bg-[#a6ff00]" />}
      <div className="flex items-center justify-between gap-3 border-b border-[#284249]/65 px-4 py-3">
        <Link href={`/league/${match.leagueId}`} className="flex min-w-0 items-center gap-2 hover:text-white">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[8px] font-extrabold text-white" style={{ background: match.leagueBadgeColor }}>{match.leagueName.slice(0, 1)}</span>
          <span className="truncate text-[11px] font-bold text-[#b9cecf]">{match.leagueName}</span>
          <span className="hidden text-[10px] text-[#708b8e] sm:inline">· {match.leagueCountry}</span>
        </Link>
        <StatusPill match={match} />
      </div>

      <Link href={`/match/${match.id}`} className="block px-4 py-3.5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
          <div className="flex min-w-0 items-center justify-end gap-2.5 text-right">
            <span className="min-w-0"><span className="block truncate text-sm font-bold text-[#f4f9f6]">{match.homeTeam.name}</span>{match.homeTeam.record && <span className="mt-0.5 block text-[10px] text-[#789195]">{match.homeTeam.record}</span>}</span>
            <Crest name={match.homeTeam.name} shortName={match.homeTeam.shortName} color={match.homeTeam.badgeColor} />
          </div>
          <div className="min-w-[56px] text-center">
            <div className={`display text-[31px] font-bold leading-none tracking-wide ${match.status === "live" ? "text-[#d8ff9c]" : "text-white"}`}><span>{match.score.home}</span><span className="mx-1 text-[#638187]">–</span><span>{match.score.away}</span></div>
            {match.status === "upcoming" && <span className="mt-1 block text-[10px] font-medium text-[#7e989b]">{new Date(match.startTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
          </div>
          <div className="flex min-w-0 items-center gap-2.5"><Crest name={match.awayTeam.name} shortName={match.awayTeam.shortName} color={match.awayTeam.badgeColor} /><span className="min-w-0"><span className="block truncate text-sm font-bold text-[#f4f9f6]">{match.awayTeam.name}</span>{match.awayTeam.record && <span className="mt-0.5 block text-[10px] text-[#789195]">{match.awayTeam.record}</span>}</span></div>
        </div>
        {match.scoreSegments.length > 0 && <div className="mt-3 flex justify-center gap-1.5"><span className="text-[10px] text-[#799498]">{match.scoreSegments.map((segment) => `${segment.label} ${segment.home}–${segment.away}`).join("  ·  ")}</span></div>}
      </Link>

      <div className="flex items-center justify-between border-t border-[#284249]/65 px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-[#799397]">{match.venue ? <><MapPin size={11} className="shrink-0" /><span className="truncate">{match.venue}</span></> : <span>{match.round ?? "Match center"}</span>}</span>
        <button onClick={() => onToggleFavorite(match.id)} aria-label={isFavorite ? `Remove ${match.homeTeam.name} versus ${match.awayTeam.name} from favorites` : `Favorite ${match.homeTeam.name} versus ${match.awayTeam.name}`} className={`grid h-7 w-7 place-items-center rounded-lg transition-colors ${isFavorite ? "bg-[#a6ff00]/15 text-[#b7ff3e]" : "text-[#759094] hover:bg-[#203a40] hover:text-[#dceced]"}`}>
          <Heart size={15} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>
    </article>
  );
}

export function MatchCardSkeleton() {
  return <div className="overflow-hidden rounded-2xl border border-[#29434a] bg-[#102126]/80"><div className="h-11 animate-pulse border-b border-[#29434a] bg-[#1b333a]" /><div className="h-[104px] animate-pulse bg-[linear-gradient(90deg,#102126,#1a3338,#102126)] bg-[length:200%_100%]" /><div className="h-10 animate-pulse border-t border-[#29434a] bg-[#142a30]" /></div>;
}

export function FavoriteEmpty() { return <div className="flex min-w-[220px] items-center gap-3 rounded-2xl border border-dashed border-[#345158] bg-[#11252b]/65 px-4 py-3 text-[#97afb1]"><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#203a3f]"><Star size={15} /></span><span className="text-xs leading-snug">Keep an eye on a match. <br /><b className="font-semibold text-[#d8e8e8]">Tap the heart to pin it here.</b></span></div>; }
