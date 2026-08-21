import { SPORT_CODES } from "@shared/sports";
import { z } from "zod";
import { sportsGateway } from "../sports/gateway";
import { publicProcedure, router } from "../_core/trpc";

const queryInput = z.object({
  sport: z.enum(SPORT_CODES).optional(),
  state: z.enum(["live", "upcoming", "finished"]).optional(),
  leagueId: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().max(80).optional(),
}).optional();

export const sportsRouter = router({
  feed: publicProcedure.input(queryInput).query(async ({ input }) => ({
    matches: await sportsGateway.matches(input ?? {}),
    leagues: await sportsGateway.leagues(input?.sport),
    provider: sportsGateway.providerName,
    refreshedAt: new Date().toISOString(),
  })),
  match: publicProcedure.input(z.object({ id: z.string().trim().min(1).max(160) })).query(async ({ input }) => sportsGateway.match(input.id)),
  league: publicProcedure.input(z.object({ id: z.string().trim().min(1).max(100) })).query(async ({ input }) => sportsGateway.league(input.id)),
  standings: publicProcedure.input(z.object({ leagueId: z.string().trim().min(1).max(100) })).query(async ({ input }) => sportsGateway.standings(input.leagueId)),
});
