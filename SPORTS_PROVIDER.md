# Sports Provider Integration

Matchday has a deliberately narrow server-side provider boundary. The browser only calls typed application procedures; it never receives or calls a third-party sports endpoint. The active provider is selected on the server by the `SPORTS_PROVIDER` environment variable, which defaults to `demo` for the shipped showcase feed.

| Concern | Contract location | Requirement for a real provider |
|---|---|---|
| Canonical sports models | `shared/sports.ts` | Map the external response to `SportsMatch`, `SportsLeague`, and `StandingRow` without passing provider fields to the UI. |
| Provider implementation | `server/sports/<providerName>Provider.ts` | Implement `SportsProvider`: matches, match details, leagues, league detail, and standings. |
| Provider selection | `server/sports/providerRegistry.ts` | Register the adapter and select it via `SPORTS_PROVIDER`. |
| Credentials and outbound traffic | Server only | Read API credentials from server environment variables. Do not expose them in browser code. |
| Caching and request pacing | `server/sports/gateway.ts` | Keep all outbound traffic behind the gateway, which caches results and enforces a minimum provider-call interval. |

> When you provide the API name, documentation, and key, I will add one adapter, register it, and configure the provider. The score UI, favorites, filters, match detail view, and standings routes do not need to change.

## Adapter outline

```ts
import type { SportsProvider } from "@shared/sports";

export class VendorSportsProvider implements SportsProvider {
  readonly name = "vendor";

  async getMatches(query) { /* call vendor API, then map to SportsMatch[] */ }
  async getMatchById(id) { /* map to SportsMatch | null */ }
  async getLeagues(sport) { /* map to SportsLeague[] */ }
  async getLeague(id) { /* map to SportsLeague | null */ }
  async getStandings(leagueId) { /* map to StandingRow[] */ }
}
```
