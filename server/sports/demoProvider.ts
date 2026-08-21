import type { LineupPlayer, SportsLeague, SportsMatch, SportsProvider, SportsQuery, StandingRow } from "@shared/sports";

const lineup = (names: string[]): LineupPlayer[] => names.map((name, index) => ({
  name,
  number: index + 1,
  position: index === 0 ? "GK" : index < 5 ? "DEF" : index < 8 ? "MID" : "FWD",
  captain: index === 1,
}));

const leagues: SportsLeague[] = [
  { id: "premier-league", sport: "football", name: "Premier League", country: "England", badgeColor: "#8d42ec", season: "2025/26" },
  { id: "la-liga", sport: "football", name: "La Liga", country: "Spain", badgeColor: "#ff375f", season: "2025/26" },
  { id: "nba", sport: "basketball", name: "NBA", country: "United States", badgeColor: "#f05a3e", season: "2025/26" },
  { id: "atp-cincinnati", sport: "tennis", name: "ATP Masters 1000", country: "Cincinnati", badgeColor: "#39b8ff", season: "2026" },
  { id: "test-series", sport: "cricket", name: "The Ashes", country: "International", badgeColor: "#e0a311", season: "2025/26" },
  { id: "urc", sport: "rugby", name: "United Rugby Championship", country: "International", badgeColor: "#1eaf85", season: "2025/26" },
  { id: "nhl", sport: "ice-hockey", name: "NHL", country: "United States", badgeColor: "#2b8aef", season: "2025/26" },
  { id: "vnl", sport: "volleyball", name: "Volleyball Nations League", country: "International", badgeColor: "#ee7c31", season: "2026" },
];

const matches: SportsMatch[] = [
  {
    id: "arsenal-manchester-city", sport: "football", leagueId: "premier-league", leagueName: "Premier League", leagueCountry: "England", leagueBadgeColor: "#8d42ec",
    status: "live", statusDetail: "67'", startTime: "2026-08-21T14:00:00.000Z", round: "Matchweek 2", venue: "Emirates Stadium",
    homeTeam: { id: "arsenal", name: "Arsenal", shortName: "ARS", badgeColor: "#d92837", record: "1–0–0" }, awayTeam: { id: "manchester-city", name: "Manchester City", shortName: "MCI", badgeColor: "#70c6e8", record: "1–0–0" },
    score: { home: 2, away: 1 }, scoreSegments: [{ label: "HT", home: 1, away: 0 }, { label: "2H", home: 1, away: 1, active: true }],
    events: [
      { id: "a1", minute: "18'", kind: "goal", team: "home", title: "Bukayo Saka", detail: "Assisted by Ødegaard" },
      { id: "a2", minute: "42'", kind: "yellow-card", team: "away", title: "Rúben Dias", detail: "Foul" },
      { id: "a3", minute: "51'", kind: "goal", team: "away", title: "Erling Haaland", detail: "Assisted by Foden" },
      { id: "a4", minute: "63'", kind: "goal", team: "home", title: "Kai Havertz", detail: "Assisted by Saka" },
    ],
    homeLineup: lineup(["David Raya", "Ben White", "William Saliba", "Gabriel", "Riccardo Calafiori", "Declan Rice", "Martin Ødegaard", "Kai Havertz", "Bukayo Saka", "Gabriel Martinelli", "Viktor Gyökeres"]),
    awayLineup: lineup(["Ederson", "Rico Lewis", "Rúben Dias", "John Stones", "Joško Gvardiol", "Rodri", "Bernardo Silva", "Phil Foden", "Jérémy Doku", "Erling Haaland", "Savinho"]),
  },
  {
    id: "celtics-lakers", sport: "basketball", leagueId: "nba", leagueName: "NBA", leagueCountry: "United States", leagueBadgeColor: "#f05a3e",
    status: "live", statusDetail: "Q3 04:18", startTime: "2026-08-21T15:30:00.000Z", round: "Preseason", venue: "TD Garden",
    homeTeam: { id: "celtics", name: "Boston Celtics", shortName: "BOS", badgeColor: "#007a33", record: "4–1" }, awayTeam: { id: "lakers", name: "Los Angeles Lakers", shortName: "LAL", badgeColor: "#5a2d81", record: "3–2" },
    score: { home: 86, away: 82 }, scoreSegments: [{ label: "Q1", home: 27, away: 24 }, { label: "Q2", home: 21, away: 26 }, { label: "Q3", home: 38, away: 32, active: true }],
    events: [{ id: "b1", minute: "Q3 04:18", kind: "basket", team: "home", title: "J. Tatum", detail: "3-point field goal" }, { id: "b2", minute: "Q3 04:33", kind: "basket", team: "away", title: "A. Davis", detail: "2-point field goal" }],
  },
  {
    id: "sinner-alcaraz", sport: "tennis", leagueId: "atp-cincinnati", leagueName: "ATP Masters 1000", leagueCountry: "Cincinnati", leagueBadgeColor: "#39b8ff",
    status: "live", statusDetail: "Set 3", startTime: "2026-08-21T16:00:00.000Z", round: "Semi-final", venue: "Center Court",
    homeTeam: { id: "sinner", name: "Jannik Sinner", shortName: "SIN", badgeColor: "#e85a47", record: "ATP #1" }, awayTeam: { id: "alcaraz", name: "Carlos Alcaraz", shortName: "ALC", badgeColor: "#f0b23d", record: "ATP #2" },
    score: { home: 1, away: 1 }, scoreSegments: [{ label: "Set 1", home: 6, away: 3 }, { label: "Set 2", home: 4, away: 6 }, { label: "Set 3", home: 2, away: 1, active: true }],
    events: [{ id: "t1", minute: "Set 3", kind: "ace", team: "home", title: "Jannik Sinner", detail: "Ace · 204 km/h" }],
  },
  {
    id: "england-australia", sport: "cricket", leagueId: "test-series", leagueName: "The Ashes", leagueCountry: "International", leagueBadgeColor: "#e0a311",
    status: "live", statusDetail: "Day 3 · 68.2 ov", startTime: "2026-08-19T09:00:00.000Z", round: "3rd Test", venue: "Headingley, Leeds",
    homeTeam: { id: "england", name: "England", shortName: "ENG", badgeColor: "#d92c45", record: "1st innings 343" }, awayTeam: { id: "australia", name: "Australia", shortName: "AUS", badgeColor: "#f0c93a", record: "1st innings 371" },
    score: { home: "224/5", away: "371" }, scoreSegments: [{ label: "1st inns", home: 343, away: 371 }, { label: "2nd inns", home: "224/5", away: "—", active: true }],
    events: [{ id: "c1", minute: "68.2 ov", kind: "wicket", team: "home", title: "B. Stokes", detail: "c Smith b Cummins · 41" }],
  },
  {
    id: "leinster-bulls", sport: "rugby", leagueId: "urc", leagueName: "United Rugby Championship", leagueCountry: "International", leagueBadgeColor: "#1eaf85",
    status: "live", statusDetail: "56'", startTime: "2026-08-21T14:15:00.000Z", round: "Round 1", venue: "Aviva Stadium",
    homeTeam: { id: "leinster", name: "Leinster", shortName: "LEI", badgeColor: "#1d4f99" }, awayTeam: { id: "bulls", name: "Vodacom Bulls", shortName: "BUL", badgeColor: "#77c2ec" },
    score: { home: 19, away: 17 }, scoreSegments: [{ label: "HT", home: 12, away: 10 }, { label: "2H", home: 7, away: 7, active: true }],
    events: [{ id: "r1", minute: "52'", kind: "try", team: "away", title: "C. Kriel", detail: "Try · Converted" }],
  },
  {
    id: "real-atletico", sport: "football", leagueId: "la-liga", leagueName: "La Liga", leagueCountry: "Spain", leagueBadgeColor: "#ff375f",
    status: "upcoming", statusDetail: "Today · 20:00", startTime: "2026-08-21T20:00:00.000Z", round: "Matchweek 2", venue: "Santiago Bernabéu",
    homeTeam: { id: "real-madrid", name: "Real Madrid", shortName: "RMA", badgeColor: "#f6f7f1", record: "1–0–0" }, awayTeam: { id: "atletico", name: "Atlético Madrid", shortName: "ATM", badgeColor: "#d62d46", record: "1–0–0" },
    score: { home: "–", away: "–" }, scoreSegments: [], events: [],
    homeLineup: lineup(["Thibaut Courtois", "Dani Carvajal", "Éder Militão", "Antonio Rüdiger", "Álvaro Carreras", "Aurélien Tchouaméni", "Federico Valverde", "Jude Bellingham", "Rodrygo", "Kylian Mbappé", "Vinícius Júnior"]),
    awayLineup: lineup(["Jan Oblak", "Marcos Llorente", "Robin Le Normand", "José María Giménez", "Javi Galán", "Koke", "Pablo Barrios", "Giuliano Simeone", "Antoine Griezmann", "Julián Alvarez", "Álex Baena"]),
  },
  {
    id: "canadiens-rangers", sport: "ice-hockey", leagueId: "nhl", leagueName: "NHL", leagueCountry: "United States", leagueBadgeColor: "#2b8aef",
    status: "upcoming", statusDetail: "Today · 22:30", startTime: "2026-08-21T22:30:00.000Z", round: "Preseason", venue: "Bell Centre",
    homeTeam: { id: "canadiens", name: "Montréal Canadiens", shortName: "MTL", badgeColor: "#bf1e2e" }, awayTeam: { id: "rangers", name: "New York Rangers", shortName: "NYR", badgeColor: "#1c4f96" },
    score: { home: "–", away: "–" }, scoreSegments: [], events: [],
  },
  {
    id: "italy-brazil", sport: "volleyball", leagueId: "vnl", leagueName: "Volleyball Nations League", leagueCountry: "International", leagueBadgeColor: "#ee7c31",
    status: "finished", statusDetail: "FT", startTime: "2026-08-21T11:00:00.000Z", round: "Final", venue: "Łódź Atlas Arena",
    homeTeam: { id: "italy", name: "Italy", shortName: "ITA", badgeColor: "#178a56" }, awayTeam: { id: "brazil", name: "Brazil", shortName: "BRA", badgeColor: "#e7bd28" },
    score: { home: 3, away: 2 }, scoreSegments: [{ label: "S1", home: 25, away: 21 }, { label: "S2", home: 22, away: 25 }, { label: "S3", home: 25, away: 18 }, { label: "S4", home: 20, away: 25 }, { label: "S5", home: 15, away: 12 }],
    events: [{ id: "v1", minute: "S5", kind: "period", team: "home", title: "Italy win the match", detail: "Final set 15–12" }],
  },
  {
    id: "barcelona-sevilla", sport: "football", leagueId: "la-liga", leagueName: "La Liga", leagueCountry: "Spain", leagueBadgeColor: "#ff375f",
    status: "finished", statusDetail: "FT", startTime: "2026-08-21T10:00:00.000Z", round: "Matchweek 2", venue: "Estadi Olímpic Lluís Companys",
    homeTeam: { id: "barcelona", name: "Barcelona", shortName: "BAR", badgeColor: "#a41945" }, awayTeam: { id: "sevilla", name: "Sevilla", shortName: "SEV", badgeColor: "#efefef" },
    score: { home: 3, away: 0 }, scoreSegments: [{ label: "HT", home: 2, away: 0 }, { label: "2H", home: 1, away: 0 }],
    events: [{ id: "f1", minute: "12'", kind: "goal", team: "home", title: "Lamine Yamal" }, { id: "f2", minute: "39'", kind: "goal", team: "home", title: "Raphinha" }, { id: "f3", minute: "81'", kind: "goal", team: "home", title: "Ferran Torres" }],
  },
];

const premierStandings: StandingRow[] = [
  [1, "Liverpool", "LIV", "#e22836", 2, 2, 0, 0, 6, "+5", ["W", "W"]],
  [2, "Arsenal", "ARS", "#d92837", 2, 2, 0, 0, 6, "+4", ["W", "W"]],
  [3, "Manchester City", "MCI", "#70c6e8", 2, 1, 1, 0, 4, "+3", ["W", "D"]],
  [4, "Chelsea", "CHE", "#2564a7", 2, 1, 1, 0, 4, "+2", ["D", "W"]],
  [5, "Tottenham", "TOT", "#f2f4f7", 2, 1, 0, 1, 3, "+1", ["L", "W"]],
].map(([rank, name, shortName, badgeColor, played, won, drawn, lost, points, goalDifference, form]) => ({ rank: Number(rank), team: { id: String(name).toLowerCase().replaceAll(" ", "-"), name: String(name), shortName: String(shortName), badgeColor: String(badgeColor) }, played: Number(played), won: Number(won), drawn: Number(drawn), lost: Number(lost), points: Number(points), goalDifference: String(goalDifference), form: form as Array<"W" | "D" | "L"> }));

export class DemoSportsProvider implements SportsProvider {
  readonly name = "demo";

  async getMatches(query: SportsQuery = {}) {
    const search = query.search?.toLowerCase().trim();
    return matches.filter((match) => {
      const matchesSearch = !search || [match.homeTeam.name, match.awayTeam.name, match.leagueName].join(" ").toLowerCase().includes(search);
      return (!query.sport || match.sport === query.sport) && (!query.state || match.status === query.state) && (!query.leagueId || match.leagueId === query.leagueId) && matchesSearch;
    });
  }

  async getMatchById(id: string) { return matches.find((match) => match.id === id) ?? null; }
  async getLeagues(sport?: SportsQuery["sport"]) { return sport ? leagues.filter((league) => league.sport === sport) : leagues; }
  async getLeague(id: string) { return leagues.find((league) => league.id === id) ?? null; }
  async getStandings(leagueId: string) { return leagueId === "premier-league" ? premierStandings : []; }
}
