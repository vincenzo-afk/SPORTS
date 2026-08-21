import type { SportsProvider } from "@shared/sports";
import { DemoSportsProvider } from "./demoProvider";

/**
 * One registry is the only place a production sports API adapter is connected.
 * Add an adapter here, select it with SPORTS_PROVIDER, and leave the rest of the app untouched.
 */
export function createSportsProvider(providerName = process.env.SPORTS_PROVIDER ?? "demo"): SportsProvider {
  switch (providerName) {
    case "demo":
      return new DemoSportsProvider();
    default:
      throw new Error(`Unsupported sports provider: ${providerName}. Register its adapter in server/sports/providerRegistry.ts.`);
  }
}
