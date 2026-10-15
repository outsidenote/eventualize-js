# Security policy

## Supported versions

Only the latest published version of each `@eventualize/*` package gets
security fixes.

## Report a vulnerability

Do not open a public issue.

Report it privately through
[GitHub security advisories](https://github.com/outsidenote/eventualize-js/security/advisories/new).
Include the package and version, the steps to reproduce, and the impact.

A maintainer replies, and tells you when a fix is released.

## Scope notes

- The apps in `apps/` are demos. They have no authentication. Do not expose
  them to a network you do not trust.
- `.env.example` and `.env.test` hold local test credentials only.
