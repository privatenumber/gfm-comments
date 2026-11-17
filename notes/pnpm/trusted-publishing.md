# Trusted publishing

`pnpm publish` exchanges a CI OIDC token for an npm publish token itself. It does not call the npm CLI. So pnpm can publish with npm trusted publishing without an `npm` binary.

Source, verified 2026-11-01: pnpm 12 implements the exchange against `-/npm/v1/oidc/token/exchange/package/<name>` ([`oidc/auth_token.rs` at v12.16.1, lines 18-28](https://github.com/pnpm/pnpm/blob/v12.16.1/pnpm/crates/publish/src/oidc/auth_token.rs#L18-L28)). The doc comment on that function says: "Every failure is an [`AuthTokenError`], which the publish flow turns into a warning and skips." pnpm 11 has an equivalent implementation in `pnpm11/releasing/commands/src/publish/oidc/authToken.ts`. pnpm's test suite also covers `dist-tag` with OIDC (`pnpm/crates/cli/tests/suite/dist_tag/oidc.rs`).

The [`pnpm publish` docs](https://pnpm.io/cli/publish#--provenance) (accessed 2026-11-01) say: "Under trusted publishing, pnpm attaches provenance to a public package from a public repository on its own."

**Evidence gap:** this project has not published with `pnpm publish` through OIDC. The claim above comes from source and docs only.
