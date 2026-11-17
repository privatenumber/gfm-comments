# Release channels and dist-tag changes

semantic-release changes the dist-tag of an existing version (the `addChannel` step, which runs `npm dist-tag add` in `@semantic-release/npm`) only when a branch contains a release made on a higher, non-prerelease branch. Merging a prerelease branch such as `beta` into `master` produces a new publish, not a dist-tag change.

Last verified 2026-11-01 with semantic-release 25.0.9.

## Source

- `getReleaseToAdd` considers only releases from branches after the current branch in the branch list, and excludes prerelease branches ([`get-release-to-add.js` at v25.0.9, lines 20-24](https://github.com/semantic-release/semantic-release/blob/v25.0.9/lib/get-release-to-add.js#L20-L24)).
- `index.js` calls `plugins.addChannel` only when `getReleaseToAdd` returns a release ([`index.js` at v25.0.9, lines 110-149](https://github.com/semantic-release/semantic-release/blob/v25.0.9/index.js#L110-L149)).
- The default branch list is maintenance ranges, `master`, `main`, `next`, `next-major`, then `beta` and `alpha` as prerelease branches ([`get-config.js` at v25.0.9, lines 64-72](https://github.com/semantic-release/semantic-release/blob/v25.0.9/lib/get-config.js#L64-L72)).
- `@semantic-release/npm` runs `npm dist-tag add` only in `addChannel` ([`add-channel.js` at v13.2.0, lines 21-23](https://github.com/semantic-release/npm/blob/v13.2.0/lib/add-channel.js#L21-L23)).

## Experiment

The experiment used a scratch repository, a bare local remote, `--no-ci`, and only `@semantic-release/commit-analyzer` as a plugin, with semantic-release run through `pnpm dlx semantic-release@25.0.9`. Real (non-dry-run) releases create tags and the `refs/notes/semantic-release-*` channel notes.

1. A real release on `beta` with `feat: beta feature`:

   ```text
   › ✔  Published release 1.0.0-beta.1 on beta channel
   ```

   The note on `v1.0.0-beta.1` was `{"channels":["beta"]}`.

2. Merge `beta` into `master`, then a dry run on `master`:

   ```text
   › ℹ  There is no previous release, the next release version is 1.0.0
   › ⚠  Skip v1.0.0 tag creation in dry-run mode
   › ✔  Published release 1.0.0 on default channel
   ```

   This is a new version on the default channel. The skip message comes from the normal release path ([`index.js`, line 205](https://github.com/semantic-release/semantic-release/blob/v25.0.9/index.js#L205)), after commit analysis.

3. Positive control: a real release 1.0.0 on `master`, a real release on `next` with `feat: next feature` (`Published release 1.1.0 on next channel`), a fast-forward merge of `next` into `master`, then a dry run on `master`:

   ```text
   › ℹ  Found 1 commits since last release
   › ⚠  Skip v1.1.0 tag creation in dry-run mode
   › ℹ  Found git tag v1.1.0 associated with version 1.1.0 on branch master
   › ℹ  There are no relevant changes, so no new version is released.
   ```

   The skip message for the existing version 1.1.0 appears before commit analysis. It comes from the `releaseToAdd` path ([`index.js`, line 124](https://github.com/semantic-release/semantic-release/blob/v25.0.9/index.js#L124)), which then calls `addChannel`.

Result: the experiment can detect `addChannel` (step 3), and a `beta` merge into `master` does not trigger it (step 2).

## Trusted publishing

The [npm trusted publishing docs](https://docs.npmjs.com/trusted-publishers) say (accessed 2026-11-01): "dist-tags with OIDC Trusted publishing requires npm CLI version 11.21.0 (or later) and 12.2.0 (or later)". The package's trusted publisher configuration must also allow dist-tag changes. This applies only to workflows that reach `addChannel`.
