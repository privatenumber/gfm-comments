# `devEngines.runtime`

How pnpm and `pnpm/setup` handle a Node.js pin in `package.json#devEngines.runtime`.

Last verified 2026-11-01 with pnpm 12.16.1 on macOS arm64, and `pnpm/setup` v3.1.2 on GitHub-hosted `ubuntu-latest`.

## Writing the pin

`pnpm runtime set node <version>` without `--global` defaults to `--save-dev` and writes `devEngines.runtime` (`pnpm runtime --help`). In this repository, `pnpm runtime set node 26.13.0` wrote:

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

It appended the key at the end of `package.json`; it was moved next to `engines` by hand. Running it again with `26.12.1` replaced the entry instead of adding a second one, and updated all 14 version references in `pnpm-lock.yaml`.

## Lockfile entries

The pin adds an importer dependency and a package entry with per-platform archives:

```yaml
importers:
  .:
    devDependencies:
      node:
        specifier: runtime:26.13.0
        version: runtime:26.13.0

packages:
  node@runtime:26.13.0:
  # per-platform tarball URLs from nodejs.org and integrity hashes
```

For this repository the change added 137 lines to `pnpm-lock.yaml`.

## `node_modules/.bin/node`

`pnpm install` links the runtime into `node_modules/.bin`:

```text
node_modules/.bin/node -> ../.pnpm/node@runtime+26.13.0/node_modules/node/bin/node
```

`pnpm run` and `pnpm exec` put `node_modules/.bin` ahead of `PATH`. With another Node.js first on `PATH`:

```sh
dir="$(pnx node@22.22.0 -p 'require("node:path").dirname(process.execPath)')"
PATH="$dir:$PATH" pnpm exec node -v   # v26.13.0 (the pin)
PATH="$dir:$PATH" node -v             # v22.22.0
```

The [`devEngines.runtime` docs](https://pnpm.io/package_json#devenginesruntime) (accessed 2026-11-01) describe the intent: "Scripts use the local runtime, ensuring consistency across environments."

## `--no-runtime` is ignored by the repeat-install fast path

When `node_modules` is already installed, `pnpm install` takes a fast path that does not compare the runtime setting with the existing install. The runtime link then keeps the state of the previous full install. Reported as [pnpm/pnpm#17542](https://github.com/pnpm/pnpm/issues/17542) on 2026-11-01.

A minimal project with one dependency (`is-number`) and the pin above, pnpm 12.16.1. Each row ran after the previous one, starting from an empty directory:

| Step | `node_modules/.bin/node` |
| --- | --- |
| `pnpm install` | present |
| `pnpm install --no-runtime` | present |
| `pnpm install --no-runtime --frozen-lockfile` | present |
| `pnpm install --no-runtime --force` | absent |
| `pnpm install` | absent |
| `pnpm install --frozen-lockfile` | present |

From an empty `node_modules`, `pnpm install --no-runtime` leaves the link absent, a plain `pnpm install` keeps it absent, and `pnpm install --force` links it. The fast-path installs finished in 6 to 11 ms. In a project with no dependencies, `--no-runtime --frozen-lockfile` did remove the link, so the reproduction needs at least one dependency.

So a full install applies the flag: `--force` in either direction, or `--frozen-lockfile` without `--no-runtime` to restore. `rm -rf node_modules` also works, because the next install is a full one.

With the link absent, the `PATH` prefix above reached scripts: `pnpm exec node -v` printed `v22.22.0`, and `pnpm test` passed on Node.js 22.23.4 (`pnx node@22`).

pnpm's source already lists this as a known gap. [`settings_classification.rs` at v12.16.1, line 264](https://github.com/pnpm/pnpm/blob/v12.16.1/pnpm/crates/package-manager/src/optimistic_repeat_install/tests/settings_classification.rs#L264) classifies `skip_runtimes` as `Unseen`: "A full install acts on a change to it, and the fast path does not see the change", tracked by [pnpm/tasks#219](https://github.com/pnpm/tasks/issues/219). The classification is unchanged at v12.17.0. A CLI test asserts the restore half as intended, "same as the TypeScript CLI" ([`no_runtime.rs` at v12.16.1, lines 244-251](https://github.com/pnpm/pnpm/blob/v12.16.1/pnpm/crates/cli/tests/suite/install_runtimes/no_runtime.rs#L244-L251)). pnpm 12.17.0 could not be run locally on 2026-11-01 because `minimumReleaseAge` rejected it.

## Precedence over version files

pnpm's global `node` shim uses `devEngines.runtime`, then `engines.runtime`, then `.node-version`, then `.nvmrc`, from the nearest directory that declares one ([project-aware global bins](https://pnpm.io/global-packages#project-aware-global-bins), accessed 2026-11-01).

## `pnpm/setup`

- With no `runtime` input, the action installs every `devEngines.runtime` entry ([README at v3.1.2, line 27](https://github.com/pnpm/setup/blob/v3.1.2/README.md?plain=1#L27)). `node-version-file: false` only disables version files ([`node-version-file.ts`, line 10](https://github.com/pnpm/setup/blob/v3.1.2/src/install-runtime/node-version-file.ts#L10)), so it does not stop this.
- The action passes the declared version to `pnpm runtime set <name> <version> -g` ([`install-runtime/index.ts` at v3.1.2](https://github.com/pnpm/setup/blob/v3.1.2/src/install-runtime/index.ts)). Its runtime code reads `devEngines.runtime` from the manifest and does not read the lockfile's `node@runtime` entry, so a range resolves to the newest matching release at run time. This is an inference from the source; no run with a range pin was observed.
- After installing a runtime, the action's automatic install passes `--no-runtime`, so CI checkouts have no `node_modules/.bin/node`.

Observed on 2026-11-01 (a trial branch of the project template):

- Test workflow, `pnpm/setup` with only `cache` and `require-lockfile`: logged `Installing runtime node@26.13.0...`, and the tests passed.
- `actions/setup-node` with `node-version-file: package.json`, then `pnpm/setup`: `node=/home/runner/setup-pnpm/bin/node v26.13.0`, `npm=/opt/hostedtoolcache/node/26.13.0/x64/bin/npm 11.20.0`.
