# `devEngines.runtime`

Renovate's npm manager treats `devEngines.runtime` as an updatable dependency, and its pnpm post-update step refreshes the lockfile's runtime entries.

Last verified 2026-11-01 with Renovate 44.198.1 (dry run) and source at 44.198.3.

## Detection

- The npm manager extracts each `devEngines.runtime` and `devEngines.packageManager` entry with depType `devEngines.runtime` or `devEngines.packageManager` ([`extract/common/package-file.ts` at 44.198.3, lines 147-174](https://github.com/renovatebot/renovate/blob/44.198.3/lib/modules/manager/npm/extract/common/package-file.ts#L147-L174)).
- A `node` entry uses the `node-version` datasource ([`extract/common/dependency.ts`, lines 71-75](https://github.com/renovatebot/renovate/blob/44.198.3/lib/modules/manager/npm/extract/common/dependency.ts#L71-L75)).
- The [Node.js docs page](https://github.com/renovatebot/renovate/blob/44.198.3/docs/usage/node.md?plain=1#L19-L22) lists `devEngines.runtime` among Node.js version sources.

## Dry run

A copy of this repository with the pin set to `26.12.1`:

```sh
GITHUB_COM_TOKEN="$(gh auth token)" LOG_LEVEL=debug LOG_FORMAT=json \
  pnx renovate@44.198.1 --platform=local --dry-run=lookup
```

From the `packageFiles with updates` log entry:

```text
{"depType":"devEngines.runtime","depName":"node","currentValue":"26.12.1","datasource":"node-version","updates":[{"newValue":"26.13.0","updateType":"minor"}],"skipReason":null}
{"depType":"engines","depName":"node","currentValue":">=22","datasource":"node-version","updates":[],"skipReason":"disabled"}
```

The run exited 1 after the lookup because Renovate 44.198.1 logged `Unsupported node environment detected` under Node.js 26.13.0. The hosted Renovate app runs on its own Node.js. Renovate 44.198.3 could not be installed locally on 2026-11-01 because pnpm's `minimumReleaseAge` (2880 minutes) rejected it (`ERR_PNPM_NO_MATURE_MATCHING_VERSION`).

## Lockfile refresh

`--platform=local` does not create branches, so the dry run cannot show artifact updates. After a dependency change in a pnpm project, Renovate runs `pnpm install --lockfile-only` with `--no-frozen-lockfile` ([`post-update/pnpm.ts` at 44.198.3, lines 107-140](https://github.com/renovatebot/renovate/blob/44.198.3/lib/modules/manager/npm/post-update/pnpm.ts#L107-L140)). Running that command locally (pnpm 12.16.1) after changing the pin from `26.13.0` to `26.12.1`:

```text
before: 14 refs to v26.13.0, 0 to v26.12.1
after:  0 refs to v26.13.0, 14 to v26.12.1
```

`CI=true pnpm install --frozen-lockfile` then succeeded.

**Evidence gap:** a real Renovate pull request for this pin has not been observed. Check the first one for an updated `pnpm-lock.yaml`.

## Shared preset

The repository extends `github>privatenumber/renovate-config`. Its `default.json` disables npm-manager updates for depType `engines` only ([lines 109-121 at `fe89238`](https://github.com/privatenumber/renovate-config/blob/fe892382359e87098b1777574f6e7798473c8317/default.json#L109-L121)), so `devEngines.runtime` updates stay enabled. The rule's comment names both development version sources, `devEngines.runtime` and `.nvmrc`, since [privatenumber/renovate-config#1](https://github.com/privatenumber/renovate-config/pull/1) (merged 2026-11-01).
