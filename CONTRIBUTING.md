# Contributing to SPORTS

Thank you for helping improve SPORTS. This guide keeps contributions reviewable, secure, and compatible with the typed sports data boundary.

## Local setup

Use Node.js with Corepack-enabled pnpm, then install and validate dependencies:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

Run the local application with `pnpm dev`. Before submitting a pull request, also run `pnpm build`.

## Development expectations

Create a focused branch from `main` using a descriptive name such as `feature/league-filters`, `fix/match-timeline`, or `docs/provider-guide`. Keep commits concise and written in the imperative mood, for example: `Add league filter states`.

Preserve the adapter boundary. New external sports integrations belong under `server/sports/` and must implement `SportsProvider` from `shared/sports.ts`; provider-specific response fields must not be passed into client components.

## Pull requests

Open a pull request with a clear summary, test evidence, and any documentation changes. Describe UI or API behavior changes, flag breaking changes, and disclose relevant security implications. Avoid committing generated folders, runtime logs, `.env` files, access tokens, or provider credentials.

## Reporting issues

Use the repository’s bug report or feature request templates. Please use [SECURITY.md](SECURITY.md) instead of a public issue for sensitive reports.

## Community standards

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
