# Development Node.js version

**Decision (2026-11-01):** an exact `devEngines.runtime` in [`package.json`](../../package.json) pins the Node.js version for development and CI, with `"onFail": "download"`. There is no `.nvmrc`. `engines.node` stays the support range for consumers.

```json
{
    "devEngines": {
        "runtime": {
            "name": "node",
            "version": "26.13.0",
            "onFail": "download"
        }
    }
}
```

## Rationale

- **The project provides its own Node.js.** `pnpm install` downloads the pinned version and links it into `node_modules/.bin`, and `pnpm run` scripts use it on any machine with pnpm, without a version manager ([pnpm/dev-engines-runtime.md](../pnpm/dev-engines-runtime.md#node_modulesbinnode)). With `.nvmrc`, scripts used whatever `node` the shell resolved. On 2026-11-01 an agent shell resolved Node.js 24.16.0 in this repository while `.nvmrc` said 26.13.0, because fnm switches versions only on an interactive shell's `cd` hook.
- **The version is locked like a dependency.** `pnpm-lock.yaml` records it with per-platform archive URLs and integrity hashes ([pnpm/dev-engines-runtime.md](../pnpm/dev-engines-runtime.md#lockfile-entries)).
- **Every tool in the workflow reads it:**

  | Consumer | Evidence |
  | --- | --- |
  | pnpm's global `node` shim | Outranks `.node-version` and `.nvmrc` ([pnpm/dev-engines-runtime.md](../pnpm/dev-engines-runtime.md#precedence-over-version-files)) |
  | `pnpm/setup` (test workflow) | Installs it with no input ([pnpm/dev-engines-runtime.md](../pnpm/dev-engines-runtime.md#pnpmsetup)) |
  | `actions/setup-node` (release workflow) | Reads it with `node-version-file: package.json` ([src/util.ts at v7.1.0, lines 30-39](https://github.com/actions/setup-node/blob/v7.1.0/src/util.ts#L30-L39)) |
  | Renovate | Proposes updates and refreshes the lockfile ([renovate/dev-engines-runtime.md](../renovate/dev-engines-runtime.md)) |

- **It is not published.** `prepack` runs `clean-pkg-json`, which keeps only an allowlist of fields. The 2.0.0 list contains `'engines'` and not `devEngines` ([`default-keep-properties.ts` at v2.0.0, line 38](https://github.com/privatenumber/clean-pkg-json/blob/v2.0.0/src/default-keep-properties.ts#L38)).

## Keep the version exact

`pnpm/setup` installs the declared value as written and does not read the lockfile, so a range such as `^26` could install a newer Node.js in CI than the lockfile pins locally ([pnpm/dev-engines-runtime.md](../pnpm/dev-engines-runtime.md#pnpmsetup)).

## Cost: testing another Node.js version locally

Because `pnpm run` prefers the pinned `node` in `node_modules/.bin`, putting another Node.js first on `PATH` does not reach scripts. `pnpm install --no-runtime` removes the link only on a full install, such as with `--force` or into an empty `node_modules`, and a plain `pnpm install` does not restore it ([pnpm/dev-engines-runtime.md](../pnpm/dev-engines-runtime.md#--no-runtime-is-ignored-by-the-repeat-install-fast-path)). The working recipe is in the CONTRIBUTING.md section "`devEngines.runtime` for the development Node.js version". CI is not affected, because `pnpm/setup` installs from a fresh checkout with `--no-runtime`.

## Rejected: `.nvmrc`

This project used `.nvmrc` until 2026-11-01, because fnm did not read `devEngines` ([fnm#1389](https://github.com/Schniz/fnm/issues/1389), open on 2026-11-01). pnpm's runtime shim reads `devEngines.runtime`, so a contributor with pnpm does not need fnm to get the pinned version.

What `.nvmrc` still does better:

- nvm and fnm read it; they do not read `devEngines` (nvm closed support as a duplicate in [nvm#3595](https://github.com/nvm-sh/nvm/issues/3595)). Contributors who use them lose automatic switching, although `pnpm run` still uses the pinned version.
- Testing another Node.js version locally needs only a `PATH` prefix.

Do not keep both files: pnpm's shim prefers `devEngines.runtime`, so a stale `.nvmrc` would mislead tools that read only `.nvmrc`.

## Rejected: `engines.node`

`engines.node` is the range that consumers are told the package supports (`>=22`). Using it for the development version would mix two contracts, and version managers would resolve the range to an arbitrary matching version.

## Decision history

This setup landed in the project template before it was copied here.

| Date | Change |
| --- | --- |
| 2026-11-01 | Recorded `.nvmrc` as the version source, rejecting `devEngines.runtime` because fnm did not read it |
| 2026-11-01 | Replaced `.nvmrc` with `devEngines.runtime` 26.13.0; release workflow reads `package.json` |
| 2026-11-01 | Documented the decision and the local testing recipe |
| 2026-11-01 | [privatenumber/renovate-config#1](https://github.com/privatenumber/renovate-config/pull/1) updated the shared preset's comment to name `devEngines.runtime` alongside `.nvmrc` |

### How the change was verified

The change was trialed on a temporary `trial-dev-engines` branch before it landed on `develop` by cherry-pick. The branch also carried a probe workflow that ran the release job's setup steps without semantic-release. Both the branch and the probe were deleted afterwards.

- The project template's test workflow and probe run passed on 2026-11-01 ([pnpm/dev-engines-runtime.md](../pnpm/dev-engines-runtime.md#pnpmsetup) has the logged output).
- A Renovate dry run and the lockfile refresh command were run against copies of the branch ([renovate/dev-engines-runtime.md](../renovate/dev-engines-runtime.md)).
- Locally: `CI=true pnpm install --frozen-lockfile`, build, type-check, tests, lint, and `actionlint` passed, and the project template's CI passed.
- The CONTRIBUTING.md recipe for another version ran end to end: tests passed on Node.js 22.23.4, and a fresh install restored 26.13.0.

## Open items (2026-11-01)

- **Unverified until it happens:** the first real release with this setup, and the first Renovate pull request that bumps the pin.
- **Reported upstream:** [pnpm/pnpm#17542](https://github.com/pnpm/pnpm/issues/17542), `--no-runtime` not removing an existing runtime link and a plain install not restoring it ([pnpm/dev-engines-runtime.md](../pnpm/dev-engines-runtime.md#--no-runtime-is-ignored-by-the-repeat-install-fast-path)).

## When to reevaluate

- A deploy target is added whose build service does not read `devEngines.runtime`. Such a service may need `.node-version` or `.nvmrc`.
- pnpm/pnpm#17542 is fixed, so `pnpm install --no-runtime` removes an existing runtime link. Local testing on another version would then need no `--force`.
- `pnpm/setup` starts resolving runtime ranges from the lockfile, which would allow a range pin.
- Contributors who rely on nvm or fnm become common, or fnm adds `devEngines` support.
