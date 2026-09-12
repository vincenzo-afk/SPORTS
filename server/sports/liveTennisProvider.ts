import type {
  MatchEvent,
  MatchState,
  ScoreSegment,
  SportCode,
  SportsLeague,
  SportsMatch,
  SportsProvider,
  SportsQuery,
  StandingRow,
  Team,
} from "@shared/sports";

/**
 * Live Tennis API adapter (https://livetennisapi.com).
 *
 * Contract source: https://docs.livetennisapi.com/openapi.yaml and
 * https://docs.livetennisapi.com/llms.txt, both read on 2026-09-12.
 * Base URL and credential header are the ones the spec publishes:
 * `servers[0].url` and the `apiKeyHeader` security scheme (`X-API-Key`).
 * The key travels in that header and never in a query string, which the API's
 * own docs warn leaks into logs, history and referrers.
 *
 * Request pacing: this adapter adds no limiter, because `SportsGateway` caches
 * every read for its TTL. Two things to know before tuning that gateway
 * against this API's free tier, which allows 30 requests per minute but only
 * 100 per DAY — an average of one call every ~14 minutes over 24 hours:
 *   - The daily cap, not the per-minute one, is the binding constraint, so the
 *     cache TTL is the control that matters. A free key cannot sustain
 *     continuous polling; raise the TTL rather than lowering the interval.
 *   - The gateway's minimum interval is applied per cached() call, while
 *     `getMatches()` with no `state` issues up to three upstream reads inside
 *     one of those slots. Budget by method, not by gateway call.
 *
 * Tier gating: /matches (live, upcoming), /matches/{id}, /fixtures and
 * /tournaments are FREE. The completed-match listing is BASIC, match events
 * and the rankings table are PRO, and in-play statistics are ULTRA; each
 * answers 403 `upgrade_required` below its plan. Those reads are gated here:
 * the first refusal is remembered for the life of the process, so a free key
 * pays one 403 rather than one per read, the app degrades to the empty states
 * its UI already has, and the tier is named once on the server log so the
 * refusal is never silent.
 */

const SPORT: SportCode = "tennis";
const DEFAULT_BASE_URL = "https://api.livetennisapi.com/api/public/v1";

/** `limit` is capped at 200 upstream, so one page is as much as one call can carry. */
const PAGE_LIMIT = 200;
const TOURNAMENT_PAGE_LIMIT = 200;
const STANDINGS_LIMIT = 50;

/**
 * `search` and a name-keyed `leagueId` can only be applied after the read, so a
 * truncated page would silently drop matches. Those reads walk a bounded number
 * of pages instead; the bound keeps the daily budget predictable and a walk that
 * still ends truncated says so on the log rather than pretending to be complete.
 */
const MAX_FILTERED_PAGES = 3;

/** `tournament_id` is a stable numeric string, so a non-numeric league id is one of our own name slugs. */
const NUMERIC_ID = /^[0-9]{1,20}$/;
const DATE_ONLY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/* -------------------------------------------------------------------------- */
/* Upstream response shapes. Declared here, never exported, and never handed   */
/* to a caller: every provider field is read and dropped inside this file so    */
/* only `@shared/sports` types cross the adapter boundary.                     */
/* -------------------------------------------------------------------------- */

type ApiListMeta = { count?: number | null; total?: number | null; has_more?: boolean | null };

type ApiList<T> = { data?: T[] | null; meta?: ApiListMeta | null };

type ApiScore = {
  sets?: number[] | null;
  games?: number[][] | null;
  points?: Array<string | null> | null;
  server?: number | null;
  is_tiebreak?: boolean | null;
};

type ApiPlayer = {
  id?: number | null;
  name?: string | null;
  country?: string | null;
  ranking?: number | null;
};

type ApiMatch = {
  id?: number | null;
  tournament?: string | null;
  tournament_id?: string | null;
  round?: string | null;
  round_code?: string | null;
  status?: string | null;
  event_status?: string | null;
  outcome?: string | null;
  scheduled_time?: string | null;
  live_at?: string | null;
  players?: { p1?: ApiPlayer | null; p2?: ApiPlayer | null } | null;
  score?: ApiScore | null;
};

type ApiFixture = {
  id?: number | null;
  event_date?: string | null;
  start_time?: string | null;
  player1_id?: number | null;
  player2_id?: number | null;
  player1_name?: string | null;
  player2_name?: string | null;
  tournament?: string | null;
  round?: string | null;
  round_code?: string | null;
  status?: string | null;
};

type ApiEvent = {
  type?: string | null;
  player?: number | null;
  timestamp?: string | null;
  at?: string | null;
  basis?: string | null;
  reason?: string | null;
  duration_seconds?: number | null;
  score?: ApiScore | null;
};

type ApiMeasured = { aces?: number | null; double_faults?: number | null };

type ApiStatisticsSide = { measured?: ApiMeasured | null };

type ApiStatistics = {
  coverage?: string | null;
  /** Per-family coverage. The spec says to branch on this, not on the summary above it. */
  freshness?: { measured?: { coverage?: string | null } | null } | null;
  players?: { p1?: ApiStatisticsSide | null; p2?: ApiStatisticsSide | null } | null;
};

type ApiTournament = {
  id?: string | null;
  name?: string | null;
  tour?: string | null;
  city?: string | null;
  country?: string | null;
};

type ApiRanking = {
  player_id?: number | null;
  player_name?: string | null;
  rank?: number | null;
  points?: number | null;
  previous_rank?: number | null;
};

/* -------------------------------------------------------------------------- */
/* Presentation helpers                                                       */
/* -------------------------------------------------------------------------- */

/** The app asks every team for a crest colour; tennis has none, so derive a stable one. */
const BADGE_COLORS = ["#39b8ff", "#e85a47", "#f0b23d", "#1eaf85", "#8d42ec", "#ff375f", "#2b8aef", "#ee7c31"];

function badgeColor(seed: string): string {
  let hash = 7;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) % 1_000_003;
  return BADGE_COLORS[hash % BADGE_COLORS.length];
}

/** Folds accents away so an id stays stable however a name is spelled upstream. */
function asciiFold(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function slug(value: string): string {
  return asciiFold(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A substring of the original name that survives slugging, for the catalogue's
 * substring `search`. Turning a slug back into a name is not possible —
 * `slug()` collapses every run of punctuation to `-`, so "roland-garros" could
 * have come from "Roland-Garros" or "Roland Garros" — but one whole token is a
 * substring of the name either way, and the candidate is then confirmed by
 * slug, so a loose probe cannot return the wrong tournament.
 *
 * The one case this cannot reach is a name whose letters ASCII-folding changed
 * ("Düsseldorf" slugs to a token the name does not contain), where the lookup
 * returns nothing rather than a guess. Only a fixture-derived league link
 * depends on this path; a match row carries the numeric `tournament_id` and
 * resolves directly.
 */
function searchProbe(leagueSlug: string): string {
  return leagueSlug.split("-").reduce((longest, part) => (part.length > longest.length ? part : longest), "");
}

/** A three-letter crest label; the card slices to three characters anyway. */
function shortCode(name: string): string {
  const singles = name.split("/")[0].trim();
  const words = singles.split(/\s+/).filter(Boolean);
  const surname = words.length > 1 ? words[words.length - 1] : words[0] ?? "";
  const letters = asciiFold(surname).replace(/[^A-Za-z0-9]/g, "");
  return (letters.slice(0, 3) || "TBC").toUpperCase();
}

/**
 * First stated instant, normalised to ISO. A bare `YYYY-MM-DD` fixture date is
 * a real upstream state, so it becomes that day at midnight UTC; when nothing
 * is stated the result is empty rather than an invented start time.
 */
function instant(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(DATE_ONLY.test(candidate) ? `${candidate}T00:00:00.000Z` : candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return "";
}

function clockLabel(isoInstant: string): string {
  return `${isoInstant.slice(11, 16)} UTC`;
}

function setCount(score: ApiScore | null | undefined): number {
  return Math.max(score?.games?.[0]?.length ?? 0, score?.games?.[1]?.length ?? 0);
}

/** Whether the feed has actually reported play, as opposed to a match that never started. */
function hasPlay(score: ApiScore | null | undefined): boolean {
  return (score?.sets?.length ?? 0) > 0 || setCount(score) > 0;
}

/** `points` entries are nullable upstream — on completed matches in particular. */
function gamePoints(score: ApiScore | null | undefined): [string, string] | null {
  const home = score?.points?.[0];
  const away = score?.points?.[1];
  if (typeof home !== "string" || typeof away !== "string") return null;
  return [home, away];
}

/** `games` is player-major: `[[6,3],[4,4]]` is 6-4 then 3-4. */
function scoreSegments(score: ApiScore | null | undefined, live: boolean): ScoreSegment[] {
  const home = score?.games?.[0] ?? [];
  const away = score?.games?.[1] ?? [];
  const sets = Math.max(home.length, away.length);
  const segments: ScoreSegment[] = [];
  for (let index = 0; index < sets; index += 1) {
    segments.push({ label: `Set ${index + 1}`, home: home[index] ?? 0, away: away[index] ?? 0, active: false });
  }

  const points = live ? gamePoints(score) : null;
  if (points) {
    // The game in progress is the live row; during a tiebreak `points` is its running count.
    segments.push({ label: score?.is_tiebreak ? "Tie-break" : "Game", home: points[0], away: points[1], active: true });
  } else if (live && segments.length > 0) {
    // No game state, so the set in progress is the live row. Exactly one row is ever active.
    segments[segments.length - 1].active = true;
  }

  return segments;
}

function currentSetLabel(score: ApiScore | null | undefined): string {
  const sets = setCount(score);
  return sets > 0 ? `Set ${sets}` : "In play";
}

/** `outcome` is a closed vocabulary that may gain values within v1; unknown ones read as a plain finish. */
const OUTCOME_LABELS: Record<string, string> = {
  completed: "FT",
  retired: "RET",
  walkover: "W/O",
  default: "DEF",
  abandoned: "ABD",
  unresolved: "UNRESOLVED",
};

/** `Match.status` is a closed enum: live, upcoming, completed or cancelled, and the last two are terminal. */
function lifecycle(status: string | null | undefined): MatchState {
  const value = (status ?? "").toLowerCase();
  if (value === "live") return "live";
  if (value === "upcoming") return "upcoming";
  return "finished";
}

/**
 * A fixture's status is free text upstream, not that enum, and `/fixtures`
 * serves scheduled play — so anything the words do not place elsewhere is still
 * upcoming. Defaulting the other way would file "Not Started" under results.
 */
function fixtureLifecycle(status: string | null | undefined): MatchState {
  const value = (status ?? "").toLowerCase();
  if (value === "live") return "live";
  if (value === "completed" || value === "cancelled") return "finished";
  return "upcoming";
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class LiveTennisApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "LiveTennisApiError";
  }

  /** 403 `upgrade_required` means the endpoint is above the key's plan, not that the call was wrong. */
  get isTierRefusal(): boolean {
    return this.status === 403;
  }
}

/** What a refusal costs the app, named for the operator who can fix it by changing the key. */
const TIER_NOTES: Record<string, string> = {
  "matches:completed": "the completed-match listing needs BASIC, so finished matches stay empty",
  "matches:events": "the match timeline needs PRO, so match events stay empty",
  "matches:statistics": "in-play statistics need ULTRA, so ace totals are omitted",
  rankings: "the rank-ordered rankings listing needs PRO, so standings stay empty",
};

type FetchLike = (input: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export type LiveTennisProviderOptions = {
  apiKey?: string;
  baseUrl?: string;
  /** Injected in tests so no live call is ever made. */
  fetchImpl?: FetchLike;
};

/* -------------------------------------------------------------------------- */
/* Adapter                                                                    */
/* -------------------------------------------------------------------------- */

export class LiveTennisSportsProvider implements SportsProvider {
  readonly name = "livetennis";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike | undefined;

  /** Endpoints this key's plan has already refused; each costs one 403 per process, not one per read. */
  private readonly refused = new Set<string>();

  /** Operational notes already logged, so a recurring condition is stated once. */
  private readonly warned = new Set<string>();

  /** Tournament identity is documented as stable across seasons, so resolve each id once. */
  private readonly tournaments = new Map<string, ApiTournament | null>();

  constructor(options: LiveTennisProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.LIVETENNIS_API_KEY ?? "";
    if (!apiKey) throw new Error("LIVETENNIS_API_KEY is required when SPORTS_PROVIDER=livetennis. See .env.example.");
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? process.env.LIVETENNIS_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl;
  }

  /* ---------------------------------------------------------------------- */
  /* Transport                                                              */
  /* ---------------------------------------------------------------------- */

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(message);
  }

  private async read<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }

    const doFetch = this.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    const response = await doFetch(url.toString(), { headers: { "X-API-Key": this.apiKey, Accept: "application/json" } });

    if (!response.ok) {
      const code = await errorCode(response);
      throw new LiveTennisApiError(`Live Tennis API GET ${path} failed with ${response.status}${code ? ` (${code})` : ""}`, response.status, code);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new LiveTennisApiError(`Live Tennis API GET ${path} returned a body that is not JSON`, response.status);
    }
  }

  /**
   * Reads up to `pages` pages of a listing, stopping as soon as `meta.has_more`
   * says the set is exhausted. `has_more` is the documented end-of-data signal —
   * comparing count to limit is not — and a walk that ends while more remains is
   * reported, because a filter applied to a truncated page would otherwise
   * return "no matches" for "we did not look at all of them".
   */
  private async readPages<T>(path: string, params: Record<string, string | number | undefined>, pages: number): Promise<T[]> {
    const rows: T[] = [];
    for (let page = 0; page < pages; page += 1) {
      const body = await this.read<ApiList<T>>(path, { ...params, limit: PAGE_LIMIT, offset: page > 0 ? page * PAGE_LIMIT : undefined });
      rows.push(...(body.data ?? []));
      if (!body.meta?.has_more) return rows;
    }

    this.warnOnce(
      `truncated:${path}`,
      `Live Tennis API: ${path} still reported more rows after ${pages} page(s) of ${PAGE_LIMIT}. A name search or league filter over this listing may be incomplete.`,
    );
    return rows;
  }

  /**
   * A read the key's plan may not cover. A tier refusal is remembered, so a free
   * key pays one 403 per process rather than one per read, and a 404 is an
   * honest absence. Every other failure is raised: "the request failed" must
   * never reach the UI as "there is nothing here".
   */
  private async gated<T>(feature: string, work: () => Promise<T>): Promise<T | null> {
    if (this.refused.has(feature)) return null;
    try {
      return await work();
    } catch (error) {
      if (error instanceof LiveTennisApiError && error.isTierRefusal) {
        this.refused.add(feature);
        this.warnOnce(
          feature,
          `Live Tennis API: ${TIER_NOTES[feature] ?? `${feature} is above this key's plan`} (403 upgrade_required). Every other view is unaffected.`,
        );
        return null;
      }
      if (error instanceof LiveTennisApiError && error.status === 404) return null;
      throw error;
    }
  }

  /**
   * Decoration on top of a match the free endpoints already answered. A missing
   * timeline is worth less than the match, so no upstream failure here fails
   * the read.
   */
  private async enrichment<T>(feature: string, work: () => Promise<T>): Promise<T | null> {
    try {
      return await this.gated(feature, work);
    } catch (error) {
      if (error instanceof LiveTennisApiError) return null;
      throw error;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* SportsProvider                                                         */
  /* ---------------------------------------------------------------------- */

  async getMatches(query: SportsQuery = {}): Promise<SportsMatch[]> {
    if (query.sport && query.sport !== SPORT) return [];

    const tournamentId = query.leagueId && NUMERIC_ID.test(query.leagueId) ? query.leagueId : undefined;
    // Anything the upstream query cannot express has to be filtered after the read.
    const pages = query.search || query.leagueId ? MAX_FILTERED_PAGES : 1;
    const collected: SportsMatch[] = [];

    if (!query.state || query.state === "live") {
      const live = await this.readPages<ApiMatch>("/matches", { status: "live", tournament_id: tournamentId }, pages);
      collected.push(...live.map(row => this.mapMatch(row)));
    }

    if (!query.state || query.state === "upcoming") {
      const fixtures = await this.readPages<ApiFixture>("/fixtures", {}, pages);
      collected.push(...fixtures.map(row => this.mapFixture(row)));
    }

    if (!query.state || query.state === "finished") {
      // The completed listing is part of the paid history product (BASIC).
      const finished = await this.gated("matches:completed", () =>
        this.readPages<ApiMatch>("/matches", { status: "completed", tournament_id: tournamentId }, pages),
      );
      collected.push(...(finished ?? []).map(row => this.mapMatch(row)));
    }

    return this.filter(collected, query);
  }

  async getMatchById(id: string): Promise<SportsMatch | null> {
    if (!NUMERIC_ID.test(id)) return null;

    let detail: ApiMatch;
    try {
      detail = await this.read<ApiMatch>(`/matches/${id}`);
    } catch (error) {
      // 404 is "no such match" and 410 is "this id was merged into another"; both are an absent match here.
      if (error instanceof LiveTennisApiError && (error.status === 404 || error.status === 410)) return null;
      throw error;
    }

    const match = this.mapMatch(detail);
    match.events = await this.matchEvents(id, match, detail.score);
    return match;
  }

  async getLeagues(sport?: SportCode): Promise<SportsLeague[]> {
    if (sport && sport !== SPORT) return [];
    const catalogue = await this.read<ApiList<ApiTournament>>("/tournaments", { limit: TOURNAMENT_PAGE_LIMIT });
    return (catalogue.data ?? []).map(row => {
      if (row.id) this.tournaments.set(row.id, row);
      return mapLeague(row);
    });
  }

  async getLeague(id: string): Promise<SportsLeague | null> {
    const tournament = await this.resolveTournament(id);
    return tournament ? mapLeague(tournament) : null;
  }

  /**
   * Tennis has no league table: the standing of a tennis player is their
   * ranking, which is published per TOUR rather than per tournament. So the
   * league's own tour decides which official table to serve. A ranking table
   * carries no played/won/drawn/lost record, so those read 0 and the signed
   * weekly rank movement goes in the one delta field the contract offers.
   *
   * The rank-ordered `/rankings` listing is a PRO feature, so a FREE or BASIC
   * key is refused it. That refusal returns an empty table rather than
   * throwing, deliberately: `client/src/pages/League.tsx` reads
   * `standings.isError` alongside the league and the feed and replaces the
   * WHOLE page with its error state, so a thrown error would take the league
   * header and the fixture list down with the table. An empty array lands in
   * the app's own "No table yet" panel and leaves the rest of the page
   * working, and `gated` names the tier once on the server log.
   */
  async getStandings(leagueId: string): Promise<StandingRow[]> {
    const tournament = await this.resolveTournament(leagueId);
    const system = rankingSystem(tournament?.tour);
    if (!system) return [];

    const rankings = await this.gated("rankings", () =>
      this.read<ApiList<ApiRanking>>("/rankings", { system, limit: STANDINGS_LIMIT }),
    );

    return (rankings?.data ?? []).map((row, index) => mapStandingRow(row, index));
  }

  /* ---------------------------------------------------------------------- */
  /* Filtering                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Applies what the upstream query could not. `/fixtures` accepts no
   * tournament filter and publishes no `tournament_id`, so a numeric league id
   * is compared against that tournament's name as well; a row with no stated
   * start time is dropped, because `SportsMatch.startTime` is a required string
   * with no way to say "unknown" and the cards format it as a date; and rows
   * are de-duplicated because every match route shares one id space, so a match
   * that has just gone live can appear in both listings read above.
   */
  private async filter(matches: SportsMatch[], query: SportsQuery): Promise<SportsMatch[]> {
    const leagueId = query.leagueId;
    let wantedSlug: string | null = null;

    // `/matches` already narrowed by `tournament_id`, so only rows keyed by a name
    // slug — the fixtures — still need that id turned into a name to compare.
    if (leagueId && matches.some(match => match.leagueId !== leagueId)) {
      const named = NUMERIC_ID.test(leagueId) ? await this.resolveTournament(leagueId) : null;
      wantedSlug = named?.name ? slug(named.name) : NUMERIC_ID.test(leagueId) ? null : leagueId;
    }

    const search = query.search?.toLowerCase().trim();
    const seen = new Set<string>();

    return matches.filter(match => {
      if (!match.startTime || !match.id) return false;
      if (seen.has(match.id)) return false;

      const league = !leagueId || match.leagueId === leagueId || (wantedSlug !== null && slug(match.leagueName) === wantedSlug);
      const state = !query.state || match.status === query.state;
      const text = !search || [match.homeTeam.name, match.awayTeam.name, match.leagueName].join(" ").toLowerCase().includes(search);
      if (!league || !state || !text) return false;

      seen.add(match.id);
      return true;
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Enrichment                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * The timeline. `/matches/{id}/events` (PRO) publishes breaks, set and game
   * wins, momentum runs and the stoppage family — there is no ace in that
   * vocabulary, so every one of them maps to the neutral `period` kind and the
   * text carries the meaning. The only ace figure the API holds anywhere is the
   * measured match total on `/matches/{id}/statistics` (ULTRA), which is where
   * the `ace` kind comes from; it is labelled as a total so it cannot read as a
   * single point. No new EventKind is introduced.
   */
  private async matchEvents(id: string, match: SportsMatch, score: ApiScore | null | undefined): Promise<MatchEvent[]> {
    const timeline = await this.enrichment("matches:events", () =>
      this.read<ApiList<ApiEvent>>(`/matches/${id}/events`, { limit: PAGE_LIMIT }),
    );

    // Upstream is newest first; a timeline reads better oldest first.
    const events = (timeline?.data ?? [])
      .slice()
      .reverse()
      .map((row, index) => mapEvent(row, id, index));

    const statistics = await this.enrichment("matches:statistics", () => this.read<ApiStatistics>(`/matches/${id}/statistics`));
    return [...events, ...aceTotals(statistics, id, match, score)];
  }

  /** Resolves either a numeric `tournament_id` or one of our name slugs to a catalogue row. */
  private async resolveTournament(leagueId: string): Promise<ApiTournament | null> {
    const cached = this.tournaments.get(leagueId);
    if (cached !== undefined) return cached;

    if (NUMERIC_ID.test(leagueId)) {
      try {
        const tournament = await this.read<ApiTournament>(`/tournaments/${leagueId}`);
        this.tournaments.set(leagueId, tournament);
        return tournament;
      } catch (error) {
        // Only a 404 proves there is no such tournament. Anything else is an outage,
        // and reporting that as "no such league" would hide it behind an empty page.
        if (error instanceof LiveTennisApiError && error.status === 404) {
          this.tournaments.set(leagueId, null);
          return null;
        }
        throw error;
      }
    }

    const found = await this.read<ApiList<ApiTournament>>("/tournaments", {
      search: searchProbe(leagueId),
      limit: TOURNAMENT_PAGE_LIMIT,
    });
    const matched = (found.data ?? []).find(row => row.name && slug(row.name) === leagueId) ?? null;
    this.tournaments.set(leagueId, matched);
    return matched;
  }

  /* ---------------------------------------------------------------------- */
  /* Mapping                                                                */
  /* ---------------------------------------------------------------------- */

  private mapMatch(raw: ApiMatch): SportsMatch {
    const state = lifecycle(raw.status);
    const leagueName = raw.tournament?.trim() || "Tennis";
    const startTime = instant(raw.live_at, raw.scheduled_time);
    const sets = raw.score?.sets ?? [];
    // A cancelled or never-played match has no score to show, only a status.
    const played = state !== "upcoming" && hasPlay(raw.score);

    return {
      id: String(raw.id ?? ""),
      sport: SPORT,
      leagueId: raw.tournament_id ?? slug(leagueName),
      leagueName,
      leagueCountry: "",
      // Seeded by name, not by id, so the same competition keeps one colour whether
      // the row arrived with a `tournament_id` (a match) or without one (a fixture).
      leagueBadgeColor: badgeColor(slug(leagueName)),
      status: state,
      statusDetail: matchStatusDetail(raw, state, startTime),
      startTime,
      homeTeam: mapTeam(raw.players?.p1, null, `${raw.id ?? "match"}-p1`),
      awayTeam: mapTeam(raw.players?.p2, null, `${raw.id ?? "match"}-p2`),
      score: played ? { home: sets[0] ?? 0, away: sets[1] ?? 0 } : { home: "–", away: "–" },
      scoreSegments: scoreSegments(raw.score, state === "live"),
      events: [],
      round: raw.round?.trim() || raw.round_code || undefined,
    };
  }

  private mapFixture(raw: ApiFixture): SportsMatch {
    const state = fixtureLifecycle(raw.status);
    const leagueName = raw.tournament?.trim() || "Tennis";
    const clock = instant(raw.start_time);
    const startTime = clock || instant(raw.event_date);

    return {
      id: String(raw.id ?? ""),
      sport: SPORT,
      // A fixture publishes a tournament name but no `tournament_id`, so its league
      // id is a slug of that name and `getLeague` resolves it through the catalogue.
      leagueId: slug(leagueName),
      leagueName,
      leagueCountry: "",
      leagueBadgeColor: badgeColor(slug(leagueName)),
      status: state,
      // A date-only fixture is a real state: the order of play has not set a time yet.
      statusDetail: clock ? clockLabel(clock) : "Scheduled",
      startTime,
      homeTeam: mapTeam({ id: raw.player1_id, name: raw.player1_name }, raw.player1_name, `${raw.id ?? "fixture"}-p1`),
      awayTeam: mapTeam({ id: raw.player2_id, name: raw.player2_name }, raw.player2_name, `${raw.id ?? "fixture"}-p2`),
      score: { home: "–", away: "–" },
      scoreSegments: [],
      events: [],
      round: raw.round?.trim() || raw.round_code || undefined,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Pure mappers                                                               */
/* -------------------------------------------------------------------------- */

function matchStatusDetail(raw: ApiMatch, state: MatchState, startTime: string): string {
  if (state === "live") return `${currentSetLabel(raw.score)}${raw.score?.is_tiebreak ? " · TB" : ""}`;
  if (state === "upcoming") return startTime ? clockLabel(startTime) : "Scheduled";
  if ((raw.status ?? "").toLowerCase() === "cancelled") return raw.event_status === "Postponed" ? "POSTPONED" : "CANCELLED";
  return OUTCOME_LABELS[raw.outcome ?? ""] ?? "FT";
}

/**
 * `player.ranking` is the official singles position, taken from whichever of
 * the ATP or WTA tables the player holds. The tour that published it is not
 * derivable without parsing `player.tour`, which the API documents as opaque,
 * so the crest line states the position without naming a table.
 */
function mapTeam(player: ApiPlayer | null | undefined, fallbackName: string | null | undefined, fallbackId: string): Team {
  const name = player?.name?.trim() || fallbackName?.trim() || "Unknown player";
  const id = player?.id != null ? String(player.id) : slug(name) || fallbackId;
  return {
    id,
    name,
    shortName: shortCode(name),
    badgeColor: badgeColor(id),
    record: player?.ranking != null ? `Rank #${player.ranking}` : undefined,
  };
}

function mapLeague(raw: ApiTournament): SportsLeague {
  const name = raw.name?.trim() || "Tennis";
  const id = raw.id ?? slug(name);
  return {
    id,
    sport: SPORT,
    name,
    // Curated host country (ISO-3166 alpha-2), null where not curated. The city is a
    // different field and is not substituted for it.
    country: raw.country?.trim() || "",
    badgeColor: badgeColor(slug(name)),
    // A catalogue row is one tournament across every season, so the season shown is the current one.
    season: String(new Date().getUTCFullYear()),
  };
}

/**
 * Which official ranking table stands behind a tournament's tour. A Challenger
 * man holds his ATP position, so `challenger` reads the ATP table. `itf` is
 * left out on purpose: the ITF publishes separate men's and women's tables and
 * the tour value does not say which this event is, so no table is claimed.
 */
function rankingSystem(tour: string | null | undefined): string | null {
  switch ((tour ?? "").toLowerCase()) {
    case "atp":
    case "challenger":
      return "atp";
    case "wta":
      return "wta";
    case "juniors":
      return "itf_jt";
    default:
      return null;
  }
}

function mapStandingRow(raw: ApiRanking, index: number): StandingRow {
  const rank = raw.rank ?? index + 1;
  const name = raw.player_name?.trim() || "Unknown player";
  const id = raw.player_id != null ? String(raw.player_id) : `${slug(name) || "player"}-${rank}`;
  const movement = raw.previous_rank != null && raw.rank != null ? raw.previous_rank - raw.rank : null;

  return {
    rank,
    team: { id, name, shortName: shortCode(name), badgeColor: badgeColor(id) },
    // A ranking table records no fixtures, so there is no played/won/drawn/lost to report.
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    points: raw.points ?? 0,
    // The signed movement since the previous published week — the one delta a ranking table has.
    goalDifference: movement === null ? undefined : movement > 0 ? `+${movement}` : String(movement),
  };
}

const EVENT_TITLES: Record<string, string> = {
  break: "Break of serve",
  set_won: "Set won",
  game_won: "Game won",
  momentum_run: "Momentum run",
  stoppage_start: "Play stopped",
  stoppage_end: "Play resumed",
  pause_start: "Play paused",
  pause_end: "Play resumed",
  medical_timeout_start: "Medical timeout",
  medical_timeout_end: "Medical timeout over",
  trainer_called: "Trainer called",
  trainer_called_end: "Trainer left the court",
  toilet_break_start: "Toilet break",
  toilet_break_end: "Toilet break over",
};

function mapEvent(raw: ApiEvent, matchId: string, index: number): MatchEvent {
  const type = raw.type ?? "event";
  const moment = instant(raw.at, raw.timestamp);
  const detail = [
    // A whole-match stoppage names no player, and the contract has no neutral side, so
    // say so in the text rather than letting the column imply one player was involved.
    raw.player == null ? "match-wide" : null,
    raw.reason ? raw.reason.replace(/_/g, " ") : null,
    raw.duration_seconds != null ? `${raw.duration_seconds}s` : null,
    raw.basis === "inferred" ? "inferred from our point clocks" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    // Keyed by the event's own instant where it has one: the page holds only the newest
    // events, so a position in that page names a different event as the match goes on.
    id: `${matchId}-${type}-${moment || index}`,
    minute: setCount(raw.score) > 0 ? currentSetLabel(raw.score) : moment ? clockLabel(moment) : "—",
    // The event vocabulary is structural — breaks, sets, games and stoppages — and holds no ace.
    kind: "period",
    team: raw.player === 2 ? "away" : "home",
    title: EVENT_TITLES[type] ?? type.replace(/_/g, " "),
    detail: detail || undefined,
  };
}

/**
 * Aces, as a match total per player. They are counted upstream rather than
 * derived from the point record, which is exactly why no per-point ace event
 * exists to map: the API's event vocabulary has none and its per-point rows
 * carry only server, winner and score.
 *
 * Coverage is read from `freshness.measured`, the family that actually holds
 * these counts — the spec says to branch on that rather than on the top-level
 * `coverage`, which only summarises the response, so a response marked
 * `diverged` overall can still carry final measured figures.
 */
function aceTotals(statistics: ApiStatistics | null, matchId: string, match: SportsMatch, score: ApiScore | null | undefined): MatchEvent[] {
  if (!statistics) return [];
  const coverage = statistics.freshness?.measured?.coverage ?? statistics.coverage ?? "none";
  if (coverage === "none" || coverage === "diverged") return [];

  const label = setCount(score) > 0 ? currentSetLabel(score) : "Match";
  const sides: Array<{ side: ApiStatisticsSide | null | undefined; team: "home" | "away"; name: string }> = [
    { side: statistics.players?.p1, team: "home", name: match.homeTeam.name },
    { side: statistics.players?.p2, team: "away", name: match.awayTeam.name },
  ];

  return sides.flatMap(({ side, team, name }) => {
    const aces = side?.measured?.aces;
    // Every measured field is optional: an absent one was not measured, and a present
    // 0 is a real measured zero, which is a different statement and is kept.
    if (typeof aces !== "number") return [];
    const faults = side?.measured?.double_faults;
    const detail = [`Match total · ${aces} ace${aces === 1 ? "" : "s"}`, typeof faults === "number" ? `${faults} double fault${faults === 1 ? "" : "s"}` : null]
      .filter(Boolean)
      .join(" · ");
    return [{ id: `${matchId}-aces-${team}`, minute: label, kind: "ace" as const, team, title: name, detail }];
  });
}

/** The error body carries a stable machine-readable code; a body we cannot read is not an error of its own. */
async function errorCode(response: { json(): Promise<unknown> }): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: unknown } | null;
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}
