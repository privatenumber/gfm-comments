# pnpm

Behavior of pnpm and the `pnpm/setup` GitHub Action that this project's configuration and CI depend on.

- [runtime.md](./runtime.md): pnpm installs Node.js without `npm` by design, `pnpm/setup` uses this mechanism in CI, and `pnpm add -g npm` can add npm separately.
- [dev-engines-runtime.md](./dev-engines-runtime.md): what `devEngines.runtime` writes to the lockfile, the `node_modules/.bin/node` link and `--no-runtime`, shim precedence, and how `pnpm/setup` installs it.
- [trusted-publishing.md](./trusted-publishing.md): `pnpm publish` performs the OIDC token exchange itself, without the npm CLI.
- [agent-skills.md](./agent-skills.md): where pnpm links approved dependency skills, and why an install fails without `skills.dirs`.
