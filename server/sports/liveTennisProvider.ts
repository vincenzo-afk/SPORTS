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
 *
 * Request pacing: `SportsGateway` already caches every read and enforces a
 * minimum interval between provider calls, so this adapter adds no limiter of
 * its own. What the free tier implies, for whoever tunes the gateway: 30
 * requests per minute but only 100 per DAY, which averages to one call every
 * ~14 minutes over 24 hours. The per-minute ceiling is therefore never the
 * binding constraint — the daily one is, and the gateway's 30s cache TTL is
 * what keeps a browsing session inside it. A free key cannot sustain
 * continuous polling; raise the TTL rather than lowering the interval. Each
 * provider method below reads at most one page per upstream endpoint and never
 * paginates, so one refresh of the feed costs one call per lifecycle state.
 *
 * Tier gating: /matches (live, upcoming), /matches/{id}, /fixtures and
 * /tournaments are FREE. The completed-match listing is BASIC, match events
 * and the rankings table are PRO, and in-play statistics are ULTRA; each
 * answers 403 `upgrade_required` below its plan. Those reads are optional
 * enrichments here: the first refusal is remembered for the life of the
 * process, so a free key pays one 403 rather than one per read, and the app
 * degrades to the empty states its UI already has.
 */

const SPORT: SportCode = "tennis";
const DEFAULT_BASE_URL = "https://api.livetennisapi.com/api/public/v1";

/** `limit` is capped at 200 upstream; one page per read keeps the daily budget predictable. */
const MATCH_PAGE_LIMIT = 100;
const TOURNAMENT_PAGE_LIMIT = 200;
const STANDINGS_LIMIT = 50;

/** `tournament_id` is a stable numeric string, so a non-numeric league id is one of our own name slugs. */
const NUMERIC_ID = /^[0-9]{1,20}$/;
const DATE_ONLY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/* -------------------------------------------------------------------------- */
/* Upstream response shapes. Declared here, never exported, and never handed  */
/* to a caller: every provider field is read and dropped inside this file so   */
/* only `@shared/sports` types cross the adapter boundary.                    */
/* -------------------------------------------------------------------------- */

type ApiList<T> = { data?: T[] | null };

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

type ApiStatisticsSide = { measured?: { aces?: number | null; double_faults?: number | null } | null };

type ApiStatistics = {
  coverage?: string | null;
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

function setCount(score: ApiScore | null | undefined): number {
  return Math.max(score?.games?.[0]?.length ?? 0, score?.games?.[1]?.length ?? 0);
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
    segments.push({ label: `Set ${index + 1}`, home: home[index] ?? 0, away: away[index] ?? 0, active: live && index === sets - 1 });
  }
  const points = live ? gamePoints(score) : null;
  if (points) segments.push({ label: score?.is_tiebreak ? "Tie-break" : "Game", home: points[0], away: points[1], active: true });
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

  /** Operator-facing notices already stated; a line repeated per request is noise, not information. */
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
  /* Transport                                                             */
  /* ---------------------------------------------------------------------- */

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
   * A read the key's plan may not cover. A tier refusal is remembered, so a free
   * key pays one 403 per process rather than one per read, and a 404 is an
   * honest absence. Every other failure is raised: "the request failed" must
   * never reach the UI as "there is nothing here".
   */
  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(message);
  }

  private async gated<T>(feature: string, work: () => Promise<T>): Promise<T | null> {
    if (this.refused.has(feature)) return null;
    try {
      return await work();
    } catch (error) {
      if (error instanceof LiveTennisApiError && error.isTierRefusal) {
        this.refused.add(feature);
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
  /* SportsProvider                                                        */
  /* ---------------------------------------------------------------------- */

  async getMatches(query: SportsQuery = {}): Promise<SportsMatch[]> {
    if (query.sport && query.sport !== SPORT) return [];

    const tournamentId = query.leagueId && NUMERIC_ID.test(query.leagueId) ? query.leagueId : undefined;
    const collected: SportsMatch[] = [];

    if (!query.state || query.state === "live") {
      const live = await this.read<ApiList<ApiMatch>>("/matches", { status: "live", limit: MATCH_PAGE_LIMIT, tournament_id: tournamentId });
      collected.push(...(live.data ?? []).map(row => this.mapMatch(row)));
    }

    if (!query.state || query.state === "upcoming") {
      const fixtures = await this.read<ApiList<ApiFixture>>("/fixtures", { limit: MATCH_PAGE_LIMIT });
      collected.push(...(fixtures.data ?? []).map(row => this.mapFixture(row)));
    }

    if (!query.state || query.state === "finished") {
      // The completed listing is part of the paid history product (BASIC).
      const finished = await this.gated("matches:completed", () =>
        this.read<ApiList<ApiMatch>>("/matches", { status: "completed", limit: MATCH_PAGE_LIMIT, tournament_id: tournamentId }),
      );
      collected.push(...(finished?.data ?? []).map(row => this.mapMatch(row)));
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
    match.events = await this.matchEvents(id, match);
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
   * working. So that the refusal is not silent, the tier is stated once on the
   * server log, where the operator who set the key can act on it.
   */
  async getStandings(leagueId: string): Promise<StandingRow[]> {
    const tournament = await this.resolveTournament(leagueId);
    const system = rankingSystem(tournament?.tour);
    if (!system) return [];

    const rankings = await this.gated("rankings", () =>
      this.read<ApiList<ApiRanking>>("/rankings", { system, limit: STANDINGS_LIMIT }),
    );

    if (!rankings) {
      if (this.refused.has("rankings")) {
        this.warnOnce(
          "rankings",
          "Live Tennis API: the rank-ordered /rankings listing is a PRO feature and this key was refused it (403 upgrade_required). Standings stay empty until the key is PRO or above; every other view is unaffected.",
        );
      }
      return [];
    }

    return (rankings.data ?? []).map((row, index) => mapStandingRow(row, index));
  }

  /* ---------------------------------------------------------------------- */
  /* Filtering                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * League and free-text filtering run over the page just read. `/fixtures`
   * accepts no tournament filter and publishes no `tournament_id`, so a
   * numeric league id is compared against that tournament's name as well.
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
    return matches.filter(match => {
      const league = !leagueId || match.leagueId === leagueId || (wantedSlug !== null && slug(match.leagueName) === wantedSlug);
      const text = !search || [match.homeTeam.name, match.awayTeam.name, match.leagueName].join(" ").toLowerCase().includes(search);
      return league && text;
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Enrichment                                                            */
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
  private async matchEvents(id: string, match: SportsMatch): Promise<MatchEvent[]> {
    const timeline = await this.enrichment("matches:events", () =>
      this.read<ApiList<ApiEvent>>(`/matches/${id}/events`, { limit: MATCH_PAGE_LIMIT }),
    );

    // Upstream is newest first; a timeline reads better oldest first.
    const events = (timeline?.data ?? [])
      .slice()
      .reverse()
      .map((row, index) => mapEvent(row, id, index));

    const statistics = await this.enrichment("matches:statistics", () => this.read<ApiStatistics>(`/matches/${id}/statistics`));
    return [...events, ...aceTotals(statistics, id, match)];
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
        // Cache a definite "no such tournament"; leave a transient failure uncached.
        if (error instanceof LiveTennisApiError && error.status === 404) {
          this.tournaments.set(leagueId, null);
          return null;
        }
        if (error instanceof LiveTennisApiError) return null;
        throw error;
      }
    }

    let found: ApiList<ApiTournament>;
    try {
      found = await this.read<ApiList<ApiTournament>>("/tournaments", { search: leagueId.replace(/-/g, " "), limit: TOURNAMENT_PAGE_LIMIT });
    } catch (error) {
      // A transient failure is not evidence the slug names nothing, so it is not cached.
      if (error instanceof LiveTennisApiError) return null;
      throw error;
    }

    const matched = (found.data ?? []).find(row => row.name && slug(row.name) === leagueId) ?? null;
    this.tournaments.set(leagueId, matched);
    return matched;
  }

  /* ---------------------------------------------------------------------- */
  /* Mapping                                                               */
  /* ---------------------------------------------------------------------- */

  private mapMatch(raw: ApiMatch): SportsMatch {
    const state = lifecycle(raw.status);
    const leagueName = raw.tournament?.trim() || "Tennis";
    const startTime = instant(raw.live_at, raw.scheduled_time);
    const sets = raw.score?.sets ?? [];

    return {
      id: String(raw.id ?? ""),
      sport: SPORT,
      leagueId: raw.tournament_id ?? slug(leagueName),
      leagueName,
      leagueCountry: "",
      leagueBadgeColor: badgeColor(raw.tournament_id ?? leagueName),
      status: state,
      statusDetail: matchStatusDetail(raw, state, startTime),
      startTime,
      homeTeam: mapTeam(raw.players?.p1, null, `${raw.id ?? "match"}-p1`),
      awayTeam: mapTeam(raw.players?.p2, null, `${raw.id ?? "match"}-p2`),
      score: state === "upcoming" ? { home: "–", away: "–" } : { home: sets[0] ?? 0, away: sets[1] ?? 0 },
      scoreSegments: scoreSegments(raw.score, state === "live"),
      events: [],
      round: raw.round?.trim() || raw.round_code || undefined,
    };
  }

  /**
   * Upcoming play comes from `/fixtures`, the dedicated earliest-first schedule.
   * `/matches?status=upcoming` is the other FREE source and carries a
   * `tournament_id`, which a fixture does not — the cost of this choice is the
   * name-slug league resolution in `filter` and `resolveTournament`. What makes
   * it safe is that the API documents ONE id space across every match route
   * (`matchId` parameter: "the same value works everywhere"), so a fixture id
   * taken from this list resolves at `/matches/{id}` and the detail page a card
   * links to works before the match starts.
   */
  private mapFixture(raw: ApiFixture): SportsMatch {
    const state = fixtureLifecycle(raw.status);
    const leagueName = raw.tournament?.trim() || "Tennis";
    const clock = instant(raw.start_time);
    const startTime = clock || instant(raw.event_date);

    return {
      id: String(raw.id ?? ""),
      sport: SPORT,
      // A fixture publishes a tournament name but no `tournament_id`; `getLeague` resolves this slug.
      leagueId: slug(leagueName),
      leagueName,
      leagueCountry: "",
      leagueBadgeColor: badgeColor(leagueName),
      status: state,
      statusDetail: clock ? `${clock.slice(11, 16)} UTC` : "Scheduled",
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
  if (state === "upcoming") return startTime ? `${startTime.slice(11, 16)} UTC` : "Scheduled";
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
    // Curated host city and country; either can be absent and neither is guessed upstream.
    country: raw.country?.trim() || raw.city?.trim() || "",
    badgeColor: badgeColor(id),
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
    raw.reason ? raw.reason.replace(/_/g, " ") : null,
    raw.duration_seconds != null ? `${raw.duration_seconds}s` : null,
    raw.basis === "inferred" ? "inferred from our point clocks" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id: `${matchId}-${type}-${index}`,
    minute: setCount(raw.score) > 0 ? currentSetLabel(raw.score) : moment ? `${moment.slice(11, 16)} UTC` : "—",
    // The event vocabulary is structural — breaks, sets, games and stoppages — and holds no ace.
    kind: "period",
    // A whole-match stoppage names no player, and the contract has no neutral side.
    team: raw.player === 2 ? "away" : "home",
    title: EVENT_TITLES[type] ?? type.replace(/_/g, " "),
    detail: detail || undefined,
  };
}

/**
 * Aces, as a match total per player. They are counted upstream rather than
 * derived from the point record, which is exactly why no per-point ace event
 * exists to map: the API's event vocabulary has none and its per-point rows
 * carry only server, winner and score. `coverage` gates this — `none` has no
 * figures and `diverged` means the two statistic families disagree.
 */
function aceTotals(statistics: ApiStatistics | null, matchId: string, match: SportsMatch): MatchEvent[] {
  const coverage = statistics?.coverage ?? "none";
  if (!statistics || coverage === "none" || coverage === "diverged") return [];

  // A whole-match rollup, so the timeline column says "Match" rather than naming a
  // set the count was never broken down by. There are no per-set measured figures.
  const label = "Match";
  const sides: Array<{ side: ApiStatisticsSide | null | undefined; team: "home" | "away"; name: string }> = [
    { side: statistics.players?.p1, team: "home", name: match.homeTeam.name },
    { side: statistics.players?.p2, team: "away", name: match.awayTeam.name },
  ];

  return sides.flatMap(({ side, team, name }) => {
    const aces = side?.measured?.aces;
    // Every measured field is optional and an absent one means "not measured"; a present 0 is real.
    if (typeof aces !== "number" || aces <= 0) return [];
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
