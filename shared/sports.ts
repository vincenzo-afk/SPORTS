export const SPORT_CODES = ["football", "basketball", "tennis", "cricket", "rugby", "ice-hockey", "volleyball", "baseball", "handball"] as const;

export type SportCode = (typeof SPORT_CODES)[number];
export type MatchState = "live" | "upcoming" | "finished";
export type EventKind = "goal" | "yellow-card" | "red-card" | "substitution" | "try" | "penalty" | "wicket" | "ace" | "basket" | "period";

export type Team = {
  id: string;
  name: string;
  shortName: string;
  badgeColor: string;
  logoUrl?: string;
  record?: string;
};

export type ScoreSegment = {
  label: string;
  home: string | number;
  away: string | number;
  active?: boolean;
};

export type MatchEvent = {
  id: string;
  minute: string;
  kind: EventKind;
  team: "home" | "away";
  title: string;
  detail?: string;
};

export type LineupPlayer = {
  name: string;
  number: number;
  position: string;
  captain?: boolean;
};

export type SportsMatch = {
  id: string;
  sport: SportCode;
  leagueId: string;
  leagueName: string;
  leagueCountry: string;
  leagueBadgeColor: string;
  status: MatchState;
  statusDetail: string;
  startTime: string;
  homeTeam: Team;
  awayTeam: Team;
  score: { home: string | number; away: string | number };
  scoreSegments: ScoreSegment[];
  events: MatchEvent[];
  homeLineup?: LineupPlayer[];
  awayLineup?: LineupPlayer[];
  venue?: string;
  round?: string;
};

export type SportsLeague = {
  id: string;
  sport: SportCode;
  name: string;
  country: string;
  badgeColor: string;
  season: string;
};

export type StandingRow = {
  rank: number;
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  goalDifference?: string;
  form?: Array<"W" | "D" | "L">;
};

export type SportsQuery = {
  sport?: SportCode;
  state?: MatchState;
  leagueId?: string;
  search?: string;
};

export interface SportsProvider {
  readonly name: string;
  getMatches(query?: SportsQuery): Promise<SportsMatch[]>;
  getMatchById(id: string): Promise<SportsMatch | null>;
  getLeagues(sport?: SportCode): Promise<SportsLeague[]>;
  getLeague(id: string): Promise<SportsLeague | null>;
  getStandings(leagueId: string): Promise<StandingRow[]>;
}
