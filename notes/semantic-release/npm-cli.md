# The npm CLI that `@semantic-release/npm` runs

`@semantic-release/npm` publishes with the `npm` CLI, and the CLI performs the OIDC exchange for trusted publishing. When semantic-release runs through `pnpm dlx`, the plugin runs the first `npm` on `PATH`, not the npm it depends on. So the job's `npm` must support trusted publishing: npm 11.5.1 or newer.

Last verified 2026-11-01 with semantic-release 25.0.9, `@semantic-release/npm` 13.2.0, and pnpm 12.16.1.

## The npm CLI does the publish authentication

- `verifyConditions` exchanges the OIDC token only to check that trusted publishing is configured. It keeps a boolean and discards the token ([`oidc-context.js` at v13.2.0, line 5](https://github.com/semantic-release/npm/blob/v13.2.0/lib/trusted-publishing/oidc-context.js#L5); [`verify-auth.js`, line 86](https://github.com/semantic-release/npm/blob/v13.2.0/lib/verify-auth.js#L86)).
- `publish` runs `npm publish` with a userconfig file and no token ([`publish.js` at v13.2.0, lines 23-26](https://github.com/semantic-release/npm/blob/v13.2.0/lib/publish.js#L23-L26)). Under OIDC, the npm CLI performs its own token exchange.
- The [npm trusted publishing docs](https://docs.npmjs.com/trusted-publishers) say (accessed 2026-11-01): "Trusted publishing requires npm CLI version 11.5.1 or later".

## Which `npm` runs under `pnpm dlx`

Every npm call in the plugin uses `execa("npm", ..., { cwd, preferLocal: true })`, for example in `publish.js` (lines 23-26 above). `preferLocal` adds `node_modules/.bin` directories, starting from `cwd`, which is the project directory.

The plugin depends on `npm: ^11.6.2` ([`package.json` at v13.2.0, line 31](https://github.com/semantic-release/npm/blob/v13.2.0/package.json#L31)). `pnpm dlx` installs it in a separate cache directory. On 2026-11-01 the dlx directory contained `node_modules/.pnpm/npm@11.21.1`, and its root `node_modules/.bin` contained only `semantic-release`.

### Experiment

Setup:

- A scratch git repository with a bare local remote.
- Node.js from a clean `pnpm runtime set node 26.13.0 -g`, which has no npm.
- A fake `npm` script first on `PATH` that logs its arguments and exits 1. It stands in for a runner's preinstalled npm.
- An empty `HOME`, so no user `.npmrc` changes the registry. `@semantic-release/npm` runs `npm whoami` only for the default registry.

```sh
env -i HOME=$d/home PNPM_HOME=$d/pnpmhome PATH="$d/fakebin:$d/pnpmhome/bin:/usr/bin:/bin" NPM_TOKEN=fake-token-for-probe \
  pnpm dlx semantic-release@25.0.9 --dry-run --no-ci --branches master \
  --plugins @semantic-release/npm --repository-url "file://$d/remote.git"
```

Output excerpt:

```text
[@semantic-release/npm] › ℹ  Verify authentication for registry https://registry.npmjs.org/
FAKE_RUNNER_NPM_CALLED: whoami --userconfig /private/tmp/<hash>/.npmrc --registry https://registry.npmjs.org/
› ✘  EINVALIDNPMTOKEN Invalid npm token.
```

The plugin ran the fake `npm` from `PATH`, not its own npm 11.21.1. In a job whose Node.js comes from pnpm, that `PATH` entry is the runner image's npm ([pnpm/runtime.md](../pnpm/runtime.md)).

The experiment covers `pnpm dlx`. With semantic-release installed as a project `devDependency` under pnpm's default isolated layout, the project's `node_modules/.bin` also links only direct dependencies' bins. That case is an inference and was not run.

## Publishing through pnpm instead

semantic-release can publish with pnpm through a replacement for `@semantic-release/npm`. That needs a `release` config that lists the replacement plugin.

- `@anolilab/semantic-release-pnpm` 8.1.36 runs `pnpm publish` and `pnpm dist-tag add`, and documents trusted publishing from GitHub Actions. On 2026-11-01 it had one npm maintainer.
- `@containerbase/semantic-release-pnpm` 1.4.4 runs `pnpm -r publish`. It implements `verifyConditions`, `prepare`, and `publish` but no `addChannel`, and its README has one line.

`pnpm publish` performs the OIDC exchange itself ([pnpm/trusted-publishing.md](../pnpm/trusted-publishing.md)), so these plugins do not need an npm binary. Neither was tested here.
