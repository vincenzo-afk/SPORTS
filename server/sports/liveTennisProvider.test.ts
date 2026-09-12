import { describe, expect, it, vi } from "vitest";
import type { SportsMatch } from "@shared/sports";
import { SportsGateway } from "./gateway";
import { LiveTennisApiError, LiveTennisSportsProvider } from "./liveTennisProvider";
import { createSportsProvider } from "./providerRegistry";

/** Every response in this file is canned: the adapter's fetch boundary is replaced, so no live call is made. */
type Route = { status?: number; body?: unknown; raw?: string };

function stubFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetchImpl = async (input: string) => {
    const url = new URL(input);
    const key = `${url.pathname.replace("/api/public/v1", "")}${url.search}`;
    calls.push(key);
    const route = routes[key] ?? routes[url.pathname.replace("/api/public/v1", "")];
    if (!route) throw new Error(`unexpected request: ${key}`);
    const status = route.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (route.raw !== undefined) return JSON.parse(route.raw);
        return route.body;
      },
    };
  };
  return { fetchImpl, calls };
}

function provider(routes: Record<string, Route>) {
  const { fetchImpl, calls } = stubFetch(routes);
  return { adapter: new LiveTennisSportsProvider({ apiKey: "test-key", fetchImpl }), calls };
}

const liveMatch = {
  id: 187701,
  tournament: "ATP Masters 1000 Cincinnati",
  tournament_id: "1217",
  tour: "atp",
  round: "Semi-final",
  round_code: "SF",
  status: "live",
  event_status: null,
  outcome: null,
  scheduled_time: "2026-09-12T16:00:00.000Z",
  live_at: "2026-09-12T16:04:00.000Z",
  players: {
    p1: { id: 501, name: "Jannik Sinner", country: "ita", ranking: 1 },
    p2: { id: 502, name: "Carlos Alcaraz", country: "esp", ranking: 2 },
  },
  // Player-major: [[6,4,2],[3,6,1]] reads 6-3, 4-6, 2-1.
  score: { sets: [1, 1], games: [[6, 4, 2], [3, 6, 1]], points: ["40", "30"], server: 1, is_tiebreak: false },
};

const fixtureRow = {
  id: 187999,
  event_date: "2026-09-13",
  start_time: "2026-09-13T11:30:00.000Z",
  player1_id: 601,
  player2_id: null,
  player1_name: "Aryna Sabalenka",
  player2_name: "Qualifier",
  tournament: "WTA 1000 Guadalajara",
  round: "Round of 16",
  round_code: "R16",
  status: "upcoming",
};

const emptyList = { body: { data: [], meta: { limit: 100, offset: 0, count: 0 } } };

describe("LiveTennisSportsProvider", () => {
  it("maps a live match onto the shared sports contract", async () => {
    const { adapter } = provider({
      "/matches?status=live&limit=100": { body: { data: [liveMatch], meta: { count: 1 } } },
    });

    const [match] = await adapter.getMatches({ sport: "tennis", state: "live" });

    expect(match).toMatchObject({
      id: "187701",
      sport: "tennis",
      leagueId: "1217",
      leagueName: "ATP Masters 1000 Cincinnati",
      status: "live",
      statusDetail: "Set 3",
      startTime: "2026-09-12T16:04:00.000Z",
      round: "Semi-final",
      score: { home: 1, away: 1 },
    });
    expect(match.homeTeam).toMatchObject({ id: "501", name: "Jannik Sinner", shortName: "SIN", record: "Rank #1" });
    expect(match.awayTeam).toMatchObject({ id: "502", name: "Carlos Alcaraz", shortName: "ALC", record: "Rank #2" });
  });

  it("turns player-major games into one score segment per set, plus the game in progress", async () => {
    const { adapter } = provider({
      "/matches?status=live&limit=100": { body: { data: [liveMatch], meta: { count: 1 } } },
    });

    const [match] = await adapter.getMatches({ state: "live" });

    expect(match.scoreSegments).toEqual([
      { label: "Set 1", home: 6, away: 3, active: false },
      { label: "Set 2", home: 4, away: 6, active: false },
      { label: "Set 3", home: 2, away: 1, active: true },
      { label: "Game", home: "40", away: "30", active: true },
    ]);
  });

  it("keeps the in-game points segment away from a completed match, whose points can be null", async () => {
    const finished = { ...liveMatch, status: "completed", outcome: "retired", score: { sets: [2, 0], games: [[6, 6], [3, 4]], points: [null, null], server: null, is_tiebreak: false } };
    const { adapter } = provider({
      "/matches?status=completed&limit=100": { body: { data: [finished], meta: { count: 1 } } },
    });

    const [match] = await adapter.getMatches({ state: "finished" });

    expect(match.status).toBe("finished");
    expect(match.statusDetail).toBe("RET");
    expect(match.scoreSegments).toEqual([
      { label: "Set 1", home: 6, away: 3, active: false },
      { label: "Set 2", home: 6, away: 4, active: false },
    ]);
  });

  it("maps a completed match whose points are null and whose games arrays are empty", async () => {
    // The documented shape of a completed match observed live: null points, empty games.
    const finished = { ...liveMatch, status: "completed", outcome: "completed", score: { sets: [2, 1], games: [], points: [null, null], server: null, is_tiebreak: false } };
    const { adapter } = provider({
      "/matches?status=completed&limit=100": { body: { data: [finished], meta: { count: 1 } } },
    });

    const [match] = await adapter.getMatches({ state: "finished" });

    expect(match).toMatchObject({ status: "finished", statusDetail: "FT", score: { home: 2, away: 1 } });
    // Nothing to break into periods, and no in-game point to invent.
    expect(match.scoreSegments).toEqual([]);
  });

  it("maps fixtures to upcoming matches with a league slug the catalogue can resolve", async () => {
    const { adapter } = provider({ "/fixtures?limit=100": { body: { data: [fixtureRow], meta: { count: 1 } } } });

    const [match] = await adapter.getMatches({ state: "upcoming" });

    expect(match).toMatchObject({
      id: "187999",
      status: "upcoming",
      statusDetail: "11:30 UTC",
      startTime: "2026-09-13T11:30:00.000Z",
      leagueId: "wta-1000-guadalajara",
      leagueName: "WTA 1000 Guadalajara",
      score: { home: "–", away: "–" },
    });
    expect(match.scoreSegments).toEqual([]);
    expect(match.awayTeam.name).toBe("Qualifier");
  });

  it("keeps a fixture upcoming when its free-text status is not a lifecycle word", async () => {
    const { adapter } = provider({
      "/fixtures?limit=100": { body: { data: [{ ...fixtureRow, status: "Not Started" }, { ...fixtureRow, id: 4, status: null }], meta: { count: 2 } } },
    });

    expect((await adapter.getMatches({ state: "upcoming" })).map(match => match.status)).toEqual(["upcoming", "upcoming"]);
  });

  it("passes no provider-specific field into anything the client receives", async () => {
    const { adapter } = provider({
      "/matches?status=live&limit=100": { body: { data: [liveMatch], meta: { count: 1 } } },
    });

    const [match] = await adapter.getMatches({ state: "live" });
    const allowed: Array<keyof SportsMatch> = [
      "id", "sport", "leagueId", "leagueName", "leagueCountry", "leagueBadgeColor", "status", "statusDetail",
      "startTime", "homeTeam", "awayTeam", "score", "scoreSegments", "events", "homeLineup", "awayLineup", "venue", "round",
    ];

    expect(Object.keys(match).filter(key => !allowed.includes(key as keyof SportsMatch))).toEqual([]);
    expect(Object.keys(match.homeTeam)).toEqual(["id", "name", "shortName", "badgeColor", "record"]);
    // Upstream names that must never survive the mapping.
    expect(JSON.stringify(match)).not.toMatch(/tournament_id|scheduled_time|live_at|is_tiebreak|round_code|event_status/);
  });

  it("reads every lifecycle state when the query names none", async () => {
    const { adapter, calls } = provider({
      "/matches?status=live&limit=100": { body: { data: [liveMatch], meta: { count: 1 } } },
      "/fixtures?limit=100": { body: { data: [fixtureRow], meta: { count: 1 } } },
      "/matches?status=completed&limit=100": emptyList,
    });

    const matches = await adapter.getMatches();

    expect(matches.map(match => match.status)).toEqual(["live", "upcoming"]);
    expect(calls).toEqual(["/matches?status=live&limit=100", "/fixtures?limit=100", "/matches?status=completed&limit=100"]);
  });

  it("returns nothing for a sport this provider does not serve, without calling upstream", async () => {
    const { adapter, calls } = provider({});

    expect(await adapter.getMatches({ sport: "football" })).toEqual([]);
    expect(await adapter.getLeagues("cricket")).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("narrows a numeric league id upstream and needs no name lookup to do it", async () => {
    const { adapter, calls } = provider({
      "/matches?status=live&limit=100&tournament_id=1217": { body: { data: [liveMatch], meta: { count: 1 } } },
    });

    expect((await adapter.getMatches({ state: "live", leagueId: "1217" })).map(match => match.id)).toEqual(["187701"]);
    expect(calls).toEqual(["/matches?status=live&limit=100&tournament_id=1217"]);
  });

  it("matches a fixture to a numeric league id through the tournament's name", async () => {
    const { adapter } = provider({
      "/fixtures?limit=100": { body: { data: [fixtureRow, { ...fixtureRow, id: 3, tournament: "Challenger Como" }], meta: { count: 2 } } },
      "/tournaments/1450": { body: { id: "1450", name: "WTA 1000 Guadalajara", tour: "wta" } },
    });

    // A fixture publishes no tournament_id, so the id is compared against the catalogue name.
    expect((await adapter.getMatches({ state: "upcoming", leagueId: "1450" })).map(match => match.id)).toEqual(["187999"]);
  });

  it("filters the page it read by free text", async () => {
    const other = { ...liveMatch, id: 2, tournament: "Challenger Como", tournament_id: "990", players: { p1: { id: 7, name: "Flavio Cobolli" }, p2: { id: 8, name: "Luca Nardi" } } };
    const { adapter } = provider({
      "/matches?status=live&limit=100": { body: { data: [liveMatch, other], meta: { count: 2 } } },
    });

    expect((await adapter.getMatches({ state: "live", search: "nardi" })).map(match => match.id)).toEqual(["2"]);
    expect((await adapter.getMatches({ state: "live", search: "cincinnati" })).map(match => match.id)).toEqual(["187701"]);
  });

  it("returns an empty feed when the upstream page holds no rows", async () => {
    const { adapter } = provider({ "/matches?status=live&limit=100": emptyList, "/fixtures?limit=100": emptyList, "/matches?status=completed&limit=100": emptyList });

    expect(await adapter.getMatches()).toEqual([]);
  });

  it("treats a body with no data array as an empty feed", async () => {
    const { adapter } = provider({ "/matches?status=live&limit=100": { body: {} } });

    expect(await adapter.getMatches({ state: "live" })).toEqual([]);
  });

  it("surfaces a non-2xx response as a typed error carrying the upstream code", async () => {
    const { adapter } = provider({
      "/matches?status=live&limit=100": { status: 401, body: { error: "unauthorized", detail: "unknown key" } },
    });

    await expect(adapter.getMatches({ state: "live" })).rejects.toBeInstanceOf(LiveTennisApiError);
    await expect(adapter.getMatches({ state: "live" })).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });

  it("surfaces a 5xx response rather than reporting an empty feed", async () => {
    const { adapter } = provider({ "/matches?status=live&limit=100": { status: 503, body: {} } });

    await expect(adapter.getMatches({ state: "live" })).rejects.toThrow(/failed with 503/);
  });

  it("surfaces a 200 whose body is not JSON", async () => {
    const { adapter } = provider({ "/matches?status=live&limit=100": { raw: "<html>maintenance</html>" } });

    await expect(adapter.getMatches({ state: "live" })).rejects.toThrow(/not JSON/);
  });

  it("degrades to the free tier when a paid endpoint answers upgrade_required, and asks only once", async () => {
    const { adapter, calls } = provider({
      "/matches?status=completed&limit=100": { status: 403, body: { error: "upgrade_required" } },
    });

    expect(await adapter.getMatches({ state: "finished" })).toEqual([]);
    expect(await adapter.getMatches({ state: "finished" })).toEqual([]);
    expect(calls).toEqual(["/matches?status=completed&limit=100"]);
  });

  it("raises a transient failure on a plan-gated read instead of reporting an empty feed", async () => {
    const { adapter } = provider({ "/matches?status=completed&limit=100": { status: 502, body: {} } });

    // 403 means "your plan does not include this"; 502 means "we do not know", which the UI must see.
    await expect(adapter.getMatches({ state: "finished" })).rejects.toThrow(/failed with 502/);
  });

  it("keeps serving a match when the timeline read fails for any reason", async () => {
    const { adapter } = provider({
      "/matches/187701": { body: liveMatch },
      "/matches/187701/events?limit=100": { status: 500, body: {} },
      "/matches/187701/statistics": { raw: "not json" },
    });

    const match = await adapter.getMatchById("187701");

    expect(match?.id).toBe("187701");
    expect(match?.events).toEqual([]);
  });

  it("builds the match timeline from events and takes the ace kind from measured statistics", async () => {
    const { adapter } = provider({
      "/matches/187701": { body: liveMatch },
      "/matches/187701/events?limit=100": {
        body: {
          data: [
            { type: "medical_timeout_start", player: 2, at: "2026-09-12T17:02:00.000Z", basis: "observed", reason: "medical_timeout", score: { games: [[6, 4, 2], [3, 6, 1]] } },
            { type: "break", player: 1, at: "2026-09-12T16:40:00.000Z", score: { games: [[6, 4], [3, 6]] } },
          ],
          meta: { count: 2 },
        },
      },
      "/matches/187701/statistics": {
        body: { coverage: "live", players: { p1: { measured: { aces: 12, double_faults: 2 } }, p2: { measured: { aces: 1 } } } },
      },
    });

    const match = await adapter.getMatchById("187701");

    expect(match?.events).toEqual([
      { id: "187701-break-0", minute: "Set 2", kind: "period", team: "home", title: "Break of serve", detail: undefined },
      { id: "187701-medical_timeout_start-1", minute: "Set 3", kind: "period", team: "away", title: "Medical timeout", detail: "medical timeout" },
      // A measured ace figure is a whole-match rollup, so it is labelled "Match" and never a set.
      { id: "187701-aces-home", minute: "Match", kind: "ace", team: "home", title: "Jannik Sinner", detail: "Match total · 12 aces · 2 double faults" },
      { id: "187701-aces-away", minute: "Match", kind: "ace", team: "away", title: "Carlos Alcaraz", detail: "Match total · 1 ace" },
    ]);
    // Only the vocabulary shared/sports.ts already declares.
    expect(match?.events.every(event => event.kind === "period" || event.kind === "ace")).toBe(true);
  });

  it("serves a match detail without a timeline when the plan does not cover one", async () => {
    const { adapter } = provider({
      "/matches/187701": { body: liveMatch },
      "/matches/187701/events?limit=100": { status: 403, body: { error: "upgrade_required" } },
      "/matches/187701/statistics": { status: 403, body: { error: "upgrade_required" } },
    });

    const match = await adapter.getMatchById("187701");

    expect(match?.id).toBe("187701");
    expect(match?.events).toEqual([]);
  });

  it("reports an unknown, merged, or non-numeric match id as absent", async () => {
    const { adapter, calls } = provider({
      "/matches/1": { status: 404, body: { error: "not_found" } },
      "/matches/2": { status: 410, body: { error: "merged", merged_into: 3 } },
    });

    expect(await adapter.getMatchById("1")).toBeNull();
    expect(await adapter.getMatchById("2")).toBeNull();
    expect(await adapter.getMatchById("arsenal-manchester-city")).toBeNull();
    expect(calls).toEqual(["/matches/1", "/matches/2"]);
  });

  it("maps the tournament catalogue to leagues and one tournament to a league", async () => {
    const { adapter } = provider({
      "/tournaments?limit=200": {
        body: { data: [{ id: "1217", name: "ATP Masters 1000 Cincinnati", tour: "atp", city: "Cincinnati", country: "US" }], meta: { count: 1 } },
      },
    });

    const [league] = await adapter.getLeagues("tennis");

    expect(league).toMatchObject({ id: "1217", sport: "tennis", name: "ATP Masters 1000 Cincinnati", country: "US" });
    expect(league.season).toBe(String(new Date().getUTCFullYear()));
    expect(Object.keys(league)).toEqual(["id", "sport", "name", "country", "badgeColor", "season"]);
    // The catalogue read already resolved this id, so the league lookup costs no second call.
    expect(await adapter.getLeague("1217")).toMatchObject({ id: "1217" });
  });

  it("resolves a fixture's league slug through the catalogue search", async () => {
    const { adapter } = provider({
      "/tournaments?search=wta+1000+guadalajara&limit=200": {
        body: { data: [{ id: "1450", name: "WTA 1000 Guadalajara", tour: "wta", country: "MX" }], meta: { count: 1 } },
      },
    });

    expect(await adapter.getLeague("wta-1000-guadalajara")).toMatchObject({ id: "1450", name: "WTA 1000 Guadalajara" });
  });

  it("maps the ranking table to standings, chosen by the league's own tour", async () => {
    const { adapter, calls } = provider({
      "/tournaments/1217": { body: { id: "1217", name: "ATP Masters 1000 Cincinnati", tour: "atp" } },
      "/rankings?system=atp&limit=50": {
        body: {
          data: [
            { player_id: 501, player_name: "Jannik Sinner", rank: 1, points: 11830, previous_rank: 1 },
            { player_id: null, player_name: "Carlos Alcaraz", rank: 2, points: 9590, previous_rank: 4 },
          ],
          meta: { count: 2 },
        },
      },
    });

    const standings = await adapter.getStandings("1217");

    expect(calls).toEqual(["/tournaments/1217", "/rankings?system=atp&limit=50"]);
    expect(standings[0]).toMatchObject({ rank: 1, points: 11830, played: 0, won: 0, drawn: 0, lost: 0, goalDifference: "0" });
    expect(standings[0].team).toMatchObject({ id: "501", name: "Jannik Sinner", shortName: "SIN" });
    // A player outside the roster has no id upstream, so the row still needs a stable one.
    expect(standings[1]).toMatchObject({ rank: 2, goalDifference: "+2", team: { id: "carlos-alcaraz-2" } });
  });

  it("claims no ranking table for a tour whose table is ambiguous or absent", async () => {
    const { adapter, calls } = provider({ "/tournaments/1300": { body: { id: "1300", name: "M25 Vale do Lobo", tour: "itf" } } });

    expect(await adapter.getStandings("1300")).toEqual([]);
    expect(calls).toEqual(["/tournaments/1300"]);
  });

  it("returns no standings when the rankings table is above the plan, and names the tier once", async () => {
    const { adapter, calls } = provider({
      "/tournaments/1217": { body: { id: "1217", name: "ATP Masters 1000 Cincinnati", tour: "atp" } },
      "/rankings?system=atp&limit=50": { status: 403, body: { error: "upgrade_required" } },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      // Empty, not thrown: League.tsx replaces the whole page on a standings error.
      expect(await adapter.getStandings("1217")).toEqual([]);
      expect(await adapter.getStandings("1217")).toEqual([]);

      // The operator is told which tier is missing, once, and the 403 is paid once.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/PRO feature.*403 upgrade_required/);
      expect(calls.filter(call => call.startsWith("/rankings"))).toEqual(["/rankings?system=atp&limit=50"]);
    } finally {
      warn.mockRestore();
    }
  });

  it("serves the adapter through the gateway, which caches and paces the provider calls", async () => {
    const { fetchImpl, calls } = stubFetch({ "/matches?status=live&limit=100": { body: { data: [liveMatch], meta: { count: 1 } } } });
    const gateway = new SportsGateway(new LiveTennisSportsProvider({ apiKey: "test-key", fetchImpl }), 1_000, 0);

    const first = await gateway.matches({ sport: "tennis", state: "live" });
    const second = await gateway.matches({ sport: "tennis", state: "live" });

    expect(gateway.providerName).toBe("livetennis");
    expect(first[0].id).toBe("187701");
    expect(second).toBe(first);
    expect(calls).toHaveLength(1);
  });

  it("refuses to start without a key, and leaves demo as the default provider", () => {
    const key = process.env.LIVETENNIS_API_KEY;
    delete process.env.LIVETENNIS_API_KEY;
    try {
      expect(() => createSportsProvider("livetennis")).toThrow(/LIVETENNIS_API_KEY is required/);
      expect(createSportsProvider().name).toBe("demo");

      process.env.LIVETENNIS_API_KEY = "test-key";
      expect(createSportsProvider("livetennis").name).toBe("livetennis");
    } finally {
      if (key === undefined) delete process.env.LIVETENNIS_API_KEY;
      else process.env.LIVETENNIS_API_KEY = key;
    }
  });
});
