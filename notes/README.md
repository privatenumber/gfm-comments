# Engineering research notes

Tracked maintainer references for the tools and contracts that shape gfm-comments.

## Ownership

Each upstream folder owns that tool's behavior, implementation, configuration, and version boundaries. The gfm-comments folder owns project policy, integration, and cross-tool synthesis, and links to upstream evidence.

## Index

| Folder | Owns |
| --- | --- |
| [pnpm/](./pnpm/README.md) | pnpm runtime provisioning, `devEngines.runtime`, trusted publishing, and agent skill linking |
| [renovate/](./renovate/README.md) | How Renovate detects and updates pinned versions |
| [semantic-release/](./semantic-release/README.md) | Which npm CLI `@semantic-release/npm` runs, and when release channels change dist-tags |
| [gfm-comments/](./gfm-comments/README.md) | Project policy, the scanner design, and the GitHub oracle |

## Evidence

Cite upstream facts beside the claim using primary sources accessible to the intended readers, preferably pinned releases or commits. Ground project behavior in repository source or tests, and label decisions with their rationale. Distinguish documented and observed behavior from inference. Keep executable contracts in the test suite.

## Maintenance

When upstream evidence changes, update the notes and identify affected project decisions and tests. Make implementation or packaging changes only when they are within the requested scope.
