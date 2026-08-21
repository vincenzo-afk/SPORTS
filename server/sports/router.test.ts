import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

function createPublicCaller() {
  return appRouter.createCaller({} as TrpcContext);
}

describe("sports router", () => {
  it("returns a live feed through the server procedure", async () => {
    const caller = createPublicCaller();
    const feed = await caller.sports.feed({ state: "live" });

    expect(feed.provider).toBe("demo");
    expect(feed.matches.length).toBeGreaterThan(0);
    expect(feed.matches.every((match) => match.status === "live")).toBe(true);
  });

  it("retrieves match, league, and standings contracts without UI access to the provider", async () => {
    const caller = createPublicCaller();
    const [match, league, standings] = await Promise.all([
      caller.sports.match({ id: "arsenal-manchester-city" }),
      caller.sports.league({ id: "premier-league" }),
      caller.sports.standings({ leagueId: "premier-league" }),
    ]);

    expect(match?.homeTeam.name).toBe("Arsenal");
    expect(league).toMatchObject({ name: "Premier League", sport: "football" });
    expect(standings[0]).toMatchObject({ rank: 1, team: { name: "Liverpool" } });
  });
});
