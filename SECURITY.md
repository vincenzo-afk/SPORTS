# Security Policy

## Supported version

Security fixes are applied to the latest code on the `main` branch. No separate versioned release support policy is currently maintained.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for a suspected vulnerability, exposed secret, authentication weakness, or data-provider security concern. Send a concise report to [itsmebk2007@gmail.com](mailto:itsmebk2007@gmail.com) with a description, reproduction steps, and impact assessment. Do not include active credentials in the report.

## Security practices in this repository

- Sports provider calls are server-side only, so vendor credentials are not exposed to the client.
- External provider data passes through the `SportsProvider` contract and `SportsGateway` cache/pacing layer.
- GitHub secret scanning and push protection are enabled for the repository.
- Environment files and common secret-bearing runtime files are ignored by Git.

Maintainers should rotate any credential that is accidentally committed or otherwise exposed before continuing development.
