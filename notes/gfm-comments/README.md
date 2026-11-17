# gfm-comments

Project decisions and the evidence behind them.

## Scanner

- [design.md](./design.md): why the scanner models GitHub rather than CommonMark, the three phases, and the invariants that span them.
- [block-phase.md](./block-phase.md): the block parser, the leaf blocks it reports, and how reference definitions are dropped.
- [inline-and-links.md](./inline-and-links.md): raw HTML spans, escapes and code spans, autolinks, emphasis, and the markup that links, images, and aligned cells write.
- [generated-markup.md](./generated-markup.md): generated code blocks and thematic breaks, the renderer-output audit, and why the scanner does not replay every write.
- [html-tokenizer.md](./html-tokenizer.md): GitHub's HTML handling, where a comment ends, and where a comment starts its line.
- [reference-budget.md](./reference-budget.md): why block events are replayed, and the cap on bytes that resolved references expand to.
- [footnotes.md](./footnotes.md): footnote rendering, ordering, and the disjoint reported ranges.
- [known-gaps.md](./known-gaps.md): the forms still read differently than GitHub reads them.
- [linear-time.md](./linear-time.md): the adversarial-input threat model, the linear-time rules, and the corpus and scaling measurements.
- [verification.md](./verification.md): the local oracle, its comparison rules, and the fuzz results.
- [performance.md](./performance.md): the dated baseline for bundle size, corpus and synthetic timing, allocation, and CPU self time, and how to run the measurement scripts.

## Project

- [decisions.md](./decisions.md): why the scanner became a package, why it is TypeScript, and how its modules are split.
- [history.md](./history.md): where the scanner came from, and where the earlier parser evaluations are recorded.
- [github-oracle.md](./github-oracle.md): the local cmark-gfm and parse5 oracle, the fuzz comparison scripts, the GitHub `/markdown` probes, and the patched gumbo reference for the element stack.
- [ci.md](./ci.md): why both workflows use `pnpm/setup`, and why the release workflow installs Node.js with `actions/setup-node`.
- [node-version.md](./node-version.md): why `devEngines.runtime` pins the development Node.js version instead of `.nvmrc` or `engines.node`, and how to test another version locally.
- [agent-skills.md](./agent-skills.md): why dependency skills are linked only into `.agents/skills` through `skills.dirs`.
