import { describe, expect, it } from "vitest";
import { DemoSportsProvider } from "./demoProvider";
import { SportsGateway } from "./gateway";
import { createSportsProvider } from "./providerRegistry";

describe("SportsGateway", () => {
  it("filters the provider feed through the shared sports contract", async () => {
    const gateway = new SportsGateway(new DemoSportsProvider(), 1_000, 0);
    const liveFootball = await gateway.matches({ sport: "football", state: "live" });

    expect(liveFootball).toHaveLength(1);
    expect(liveFootball[0]).toMatchObject({ id: "arsenal-manchester-city", sport: "football", status: "live" });
  });

  it("returns a cached provider result within the TTL", async () => {
    let calls = 0;
    const provider = new DemoSportsProvider();
    const gateway = new SportsGateway({ ...provider, getMatches: async (query) => { calls += 1; return provider.getMatches(query); } }, 1_000, 0);

    await gateway.matches({ state: "live" });
    await gateway.matches({ state: "live" });
    expect(calls).toBe(1);
  });

  it("uses the demo adapter when no provider configuration is supplied", () => {
    expect(createSportsProvider("demo").name).toBe("demo");
  });
});
