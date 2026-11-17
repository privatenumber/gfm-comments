# Node.js runtime provisioning

pnpm installs Node.js without `npm`, `npx`, or `corepack`. This is intentional: pnpm filters them out of the Node.js archive. A job that gets Node.js only from pnpm runs whichever `npm` is already on `PATH`, unless pnpm installs one separately.

Last verified 2026-11-01 with pnpm 12.16.1, on macOS arm64 and on a GitHub-hosted `ubuntu-latest` runner.

## Source

pnpm 12 defines the filter in [`resolve_node_version.rs` at v12.16.1, lines 23-26](https://github.com/pnpm/pnpm/blob/v12.16.1/pnpm/crates/engine-runtime-node-resolver/src/resolve_node_version.rs#L23-L26):

> `npm`, `npx`, and `corepack` ship with Node but pnpm manages its own package managers, so the install layer excludes them.

```rust
pub const NODE_EXTRAS_IGNORE_PATTERN: &str = r"^(?:(?:lib/)?node_modules/(?:npm|corepack)(?:/|$)|bin/(?:npm|npx|corepack)$|(?:npm|npx|corepack)(?:\.(?:cmd|ps1))?$)";
```

The archive extractor applies it ([`runtime.rs` at v12.16.1, lines 147-161](https://github.com/pnpm/pnpm/blob/v12.16.1/pnpm/crates/deps-restorer/src/install_package_by_snapshot/runtime.rs#L147-L161)). pnpm 11 has the same pattern ([`node-resolver/src/index.ts` at v12.16.1, line 51](https://github.com/pnpm/pnpm/blob/v12.16.1/pnpm11/engine/runtime/node-resolver/src/index.ts#L51)).

## Observed: the runtime has no `npm`

With an empty `PNPM_HOME`:

```sh
PNPM_HOME=$d/home PATH="$d/home/bin:/usr/bin:/bin" pnpm runtime set node 26.13.0 -g
ls $d/home/bin                          # node
cat <runtime dir>/package.json          # {"name":"node","version":"26.13.0","bin":{"node":"bin/node"}}
find $d -name npm-cli.js                # (no output)
```

The runtime directory is `$PNPM_HOME/store/v11/links/@/node/26.13.0/<hash>/node_modules/node`. It contains `bin/node` and no `lib/` directory. The official `node-v26.13.0-darwin-arm64.tar.gz` contains `bin/npm`, `bin/npx`, and `lib/node_modules/npm/bin/npm-cli.js`.

## Observed in GitHub Actions

`pnpm/setup` installs runtimes with `pnpm runtime set <name> <version> -g` ([README at v3.1.2, line 401](https://github.com/pnpm/setup/blob/v3.1.2/README.md?plain=1#L401)). A probe workflow in the project template (2026-11-01, `pnpm/setup` v3.1.2 reading `.nvmrc`) printed:

```text
node=/home/runner/setup-pnpm/bin/node v26.13.0
npm=/usr/local/bin/npm 10.9.9
PNPM_HOME bin:
node
```

`npm` was the runner image's preinstalled copy. [pnpm/setup#66](https://github.com/pnpm/setup/issues/66) reports the same result.

## pnpm can install `npm` separately

`npm` is a normal package. With the isolated `PNPM_HOME` from above:

```sh
pnpm add -g npm@11.6.2
ls $PNPM_HOME/bin                       # node npm npx
npm -v                                  # 11.6.2
pnpm dlx npm@11.6.2 -v                  # 11.6.2
```

So a job can use pnpm for Node.js and still have a chosen npm version, at the cost of one more version to pin.
