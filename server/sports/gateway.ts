import type { SportCode, SportsProvider, SportsQuery } from "@shared/sports";
import { createSportsProvider } from "./providerRegistry";

type CacheRecord<T> = { value: T; expiresAt: number };

/**
 * The gateway is the sole server-side integration point for a sports provider.
 * Production adapters are registered here; UI code never receives an API key or calls a provider directly.
 */
export class SportsGateway {
  private readonly cache = new Map<string, CacheRecord<unknown>>();
  private lastProviderCallAt = 0;

  constructor(private readonly provider: SportsProvider, private readonly cacheTtlMs = 30_000, private readonly minProviderIntervalMs = 180) {}

  private async cached<T>(key: string, work: () => Promise<T>): Promise<T> {
    const saved = this.cache.get(key) as CacheRecord<T> | undefined;
    if (saved && saved.expiresAt > Date.now()) return saved.value;

    const waitMs = Math.max(0, this.minProviderIntervalMs - (Date.now() - this.lastProviderCallAt));
    if (waitMs) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    this.lastProviderCallAt = Date.now();
    const value = await work();
    this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
    return value;
  }

  matches(query: SportsQuery = {}) { return this.cached(`matches:${JSON.stringify(query)}`, () => this.provider.getMatches(query)); }
  match(id: string) { return this.cached(`match:${id}`, () => this.provider.getMatchById(id)); }
  leagues(sport?: SportCode) { return this.cached(`leagues:${sport ?? "all"}`, () => this.provider.getLeagues(sport)); }
  league(id: string) { return this.cached(`league:${id}`, () => this.provider.getLeague(id)); }
  standings(leagueId: string) { return this.cached(`standings:${leagueId}`, () => this.provider.getStandings(leagueId)); }
  get providerName() { return this.provider.name; }
}

// Provider selection is config-driven; API adapters are only registered on the server.
const provider = createSportsProvider();
export const sportsGateway = new SportsGateway(provider);
