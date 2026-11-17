# CI setup

**Decision (2026-11-01):** Both workflows install pnpm and dependencies with `pnpm/setup`.

- [`.github/workflows/test.yml`](../../.github/workflows/test.yml) also lets `pnpm/setup` install Node.js.
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml) runs `actions/setup-node` before `pnpm/setup`, because publishing needs an npm CLI that supports trusted publishing.

## Test workflow: `pnpm/setup` only

`pnpm/setup` replaces three steps (`pnpm/action-setup`, `actions/setup-node`, and `pnpm install`). It reads the pnpm version from `packageManager` and the Node.js version from `devEngines.runtime` ([node-version.md](./node-version.md)). The [pnpm CI guide](https://pnpm.io/continuous-integration#github-actions) recommends it for GitHub Actions (accessed 2026-11-01).

- `require-lockfile: true` fails the job when `pnpm-lock.yaml` is missing. pnpm already refuses to update an existing lockfile in CI, but without this input it creates a lockfile when none exists ([README at v3.1.2, line 35](https://github.com/pnpm/setup/blob/v3.1.2/README.md?plain=1#L35)).
- `cache: true` caches the pnpm store. [pnpm/setup#67](https://github.com/pnpm/setup/issues/67) reports a post-step `pnpm store prune` that leaves a cache with almost nothing in it. That did not happen here. On a warm cache, a run of the project template's CI on 2026-11-01 logged `resolved 526, reused 526, downloaded 0`.

## Release workflow: `actions/setup-node`, then `pnpm/setup`

The release job publishes with npm trusted publishing (OIDC). The workflow grants `id-token: write` and sets no npm token. The reasoning:

1. **The npm CLI must be 11.5.1 or newer.** `@semantic-release/npm` publishes with the npm CLI, which performs the OIDC exchange, and npm documents 11.5.1 as the minimum ([semantic-release/npm-cli.md](../semantic-release/npm-cli.md)).
2. **The plugin's own npm is not used.** Under `pnpm dlx`, `@semantic-release/npm` runs the first `npm` on `PATH`, not the npm 11.21.1 it depends on. An experiment observed this ([semantic-release/npm-cli.md](../semantic-release/npm-cli.md#experiment)).
3. **`pnpm/setup` alone leaves the runner's npm 10.9.9 on `PATH`.** pnpm installs Node.js without npm by design ([pnpm/runtime.md](../pnpm/runtime.md)).
4. **`actions/setup-node` installs the npm that ships with Node.js.** It is npm 11.20.0 for Node.js 26.13.0.

`actions/setup-node` reads the version from `package.json` (`node-version-file: package.json`). `pnpm/setup` then also installs the `devEngines.runtime` version and puts its `node` first on `PATH`; `node-version-file: false` does not prevent that, because it only disables version files ([`node-version-file.ts` at v3.1.2, line 10](https://github.com/pnpm/setup/blob/v3.1.2/src/install-runtime/node-version-file.ts#L10)). `npm` still resolves to the one from `actions/setup-node`, because pnpm's runtime has no npm.

### Verified on a GitHub-hosted runner

Temporary probe workflows ran these setups on `ubuntu-latest` on 2026-11-01 and printed the `node` and `npm` on `PATH` (the probe branches were deleted afterwards):

| Setup | `node` | `npm` |
| --- | --- | --- |
| `actions/setup-node` (`.nvmrc`), then `pnpm/setup` with `node-version-file: false`, no `devEngines.runtime` | `/opt/hostedtoolcache/node/26.13.0/x64/bin/node` v26.13.0 | `/opt/hostedtoolcache/node/26.13.0/x64/bin/npm` 11.20.0 |
| `pnpm/setup` only, no `devEngines.runtime` | `/home/runner/setup-pnpm/bin/node` v26.13.0 | `/usr/local/bin/npm` 10.9.9 |
| Current release setup: `actions/setup-node` (`package.json`), then `pnpm/setup`, with `devEngines.runtime` | `/home/runner/setup-pnpm/bin/node` v26.13.0 | `/opt/hostedtoolcache/node/26.13.0/x64/bin/npm` 11.20.0 |

In the first setup, `pnpm/setup` logged `No runtime requested or Node.js version file detected. Skipping runtime install.` In the current setup it logged `Installing runtime node@26.13.0...`.

### Releases by other packages with the same order

| Repository | Setup | Release run |
| --- | --- | --- |
| lintroll | `actions/setup-node`, then `pnpm/setup` v2 | [41147355179](https://github.com/privatenumber/lintroll/actions/runs/41147355179): `Published release 1.34.0 on default channel` (2026-10-30) |
| type-flag | `actions/setup-node`, then `pnpm/setup` v2.1.0 | [35410608444](https://github.com/privatenumber/type-flag/actions/runs/35410608444): `Published release 5.0.0-beta.19 on beta channel` (2026-09-19) |

This template's release job has not published yet. Its first run is on the next push to `master` or `beta`.

### Alternatives considered

- **`pnpm/setup` alone, plus `pnpm add -g npm@<version>`.** This works mechanically: pnpm installs npm and puts it on `PATH` ([pnpm/runtime.md](../pnpm/runtime.md#pnpm-can-install-npm-separately)). It adds a second version pin that nothing updates with `devEngines.runtime`, and OIDC publishing with it was not tested. Rejected for now.
- **Publish through pnpm with `@anolilab/semantic-release-pnpm`.** `pnpm publish` performs the OIDC exchange itself ([pnpm/trusted-publishing.md](../pnpm/trusted-publishing.md)), so no npm binary would be needed. It needs a `release` config that replaces `@semantic-release/npm`, adds a third-party plugin with one maintainer, and was not tested. Rejected for now ([details](../semantic-release/npm-cli.md#publishing-through-pnpm-instead)).

## The release job does not change dist-tags

npm documents a higher minimum, npm 11.21.0, for dist-tag changes under OIDC. Node.js 26.13.0 bundles npm 11.20.0. This does not affect this workflow. semantic-release changes dist-tags only in `addChannel`, which never runs for releases from prerelease branches such as `beta`. An experiment with a positive control confirmed this ([semantic-release/channels.md](../semantic-release/channels.md)). `package.json` has no `release` config, and the workflow runs only on `master` and `beta`.

A publish with `--tag beta` works with OIDC: the type-flag run above published to `@beta`.

## When to reevaluate

- `pnpm/setup` adds an npm option, or pnpm's Node.js runtime starts including npm. The release job could then drop `actions/setup-node`.
- The runner image ships npm 11.5.1 or newer.
- The workflow starts running on `main`, `next`, `next-major`, or maintenance branches, or a release config changes the branch list. Channel promotion would then need npm 11.21.0 or newer.
- The release process moves to `pnpm publish`.
- pnpm/setup#67 affects this repository's cache.
