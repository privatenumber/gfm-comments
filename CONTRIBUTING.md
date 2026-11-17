# Contributing

Development setup, project conventions, and internal documentation belong in this file. Keep the README focused on what the package does, how to install it, and a quick example.

## Documentation

Use each documentation location for one audience:

- `README.md` is the package landing page, for people who find the repository and want to know whether the package is useful to them. Explain what it does and why, show the most common tasks with short runnable examples, and link to `docs/` for the details.
- `docs/` contains the detailed user-facing references, one file per interface or topic, such as `docs/node.md` for the Node.js API. Add focused files, such as `docs/configuration.md`, instead of adding unrelated detail to the README.
- `CONTRIBUTING.md` contains development setup, architecture, testing, debugging, CI, release, and maintenance information.

Keep a short technical explanation in the README only when it helps users understand a capability or make an adoption decision. Every README and `docs/` example must run as written.

## Setup

After cloning the repository, install dependencies:

```sh
pnpm install
```

`pnpm install` also downloads the development Node.js version pinned in `devEngines.runtime` in `package.json`, and `pnpm run` scripts use it. A separate Node.js version manager is not necessary. See [`devEngines.runtime` for the development Node.js version](#devenginesruntime-for-the-development-nodejs-version).

## Stack

| Category | Tool | Purpose |
| --- | --- | --- |
| Runtime | [Node.js](https://nodejs.org/) | Runs development and test TypeScript directly |
| Language | [TypeScript](https://www.typescriptlang.org/) | Provides strict static types |
| Package manager | [pnpm](https://pnpm.io/) | Installs dependencies and runs scripts |
| Build | [pkgroll](https://github.com/privatenumber/pkgroll) | Bundles package entry points defined in `package.json` |
| Lint | [lintroll](https://github.com/privatenumber/lintroll) | Provides the ESLint configuration |
| Test | [manten](https://github.com/privatenumber/manten) | Runs the test suite |
| Release | [semantic-release](https://github.com/semantic-release/semantic-release) | Automates versioning and publishing from commit messages |
| Dependency updates | [Renovate](https://docs.renovatebot.com/) | Updates dependencies using `privatenumber/renovate-config` |
| Agent skills | [pnpm agent skills](https://pnpm.io/agent-skills) | Ships agent skills with the package and links skills from dependencies |

## Scripts

| Script | Description |
| --- | --- |
| `pnpm bench` | Grade `findComments`, a regular expression, and micromark with parse5 against the GitHub oracle on the Markdown files in `node_modules`, and time them. Needs `pnpm oracle:build` first |
| `pnpm bench:ab` | Compare two git refs or source directories on the corpus and fixed workloads with paired timings |
| `pnpm bench:profile` | Profile CPU self time by module and allocation by function on the corpus |
| `pnpm bench:time` | Time `findComments` on the Markdown files in `node_modules` and fixed synthetic workloads, without the oracle |
| `pnpm build` | Bundle the package to `dist/` |
| `pnpm lint` | Lint tracked files with lintroll |
| `pnpm oracle:build` | Build the [GitHub oracle](notes/gfm-comments/github-oracle.md) into `node_modules/.cache/gfm-oracle/` |
| `pnpm oracle:compare` | Compare the scanner with the GitHub oracle on generated documents |
| `pnpm oracle:stack` | Compare the scanner's SVG and MathML element stack with the [patched gumbo](notes/gfm-comments/github-oracle.md#patched-gumbo) on generated HTML blocks |
| `pnpm size` | Bundle the package entry with esbuild and print minified, gzip, and per-module bytes |
| `pnpm test` | Run the tests with Node.js native TypeScript support |
| `pnpm type-check` | Type-check with `tsc --noEmit` |
| `pnpm prepack` | Build and clean `package.json` for publishing |

## Source of truth

gfm-comments answers one question: which HTML comments does GitHub render when it displays a Markdown document, and where are they in the source? GitHub's behavior is the answer. Specifications and other parsers help explain that behavior, but they do not decide it.

When sources disagree, the first one in this list wins:

1. **GitHub's rendered output.** The [GitHub `/markdown` probes](notes/gfm-comments/github-oracle.md#github-probes) settle any question. Probe only with synthetic documents.
2. **cmark-gfm 0.29.0.gfm.13,** with the options and extensions that GitHub enables. It decides where raw HTML can appear. Port its functions and cite their source lines at that tag. The [local oracle](notes/gfm-comments/github-oracle.md) runs it.
3. **The [WHATWG HTML tokenizer](https://html.spec.whatwg.org/multipage/parsing.html#tokenization),** as GitHub applies it to that HTML. It decides where each comment starts and ends. A parse error that still builds a comment counts as a comment: `<!-->` and `<!--->` are empty comments, `--!>` closes a comment, and a comment that is never closed runs to the end of the document. Where GitHub departs from the standard, as it does inside SVG, GitHub wins, and [html-tokenizer.md](notes/gfm-comments/html-tokenizer.md#github-html-handling) records the difference.
4. **CommonMark, micromark, parse5, and other parsers** are references only. A difference from them is not a bug unless GitHub behaves the same way they do.

A change to which comments are reported needs evidence from level 1 or 2: a GitHub probe or an oracle comparison, recorded in the notes with its date. When GitHub's output differs from the oracle, as it does for [task-list checkboxes](notes/gfm-comments/github-oracle.md#task-list-checkbox-and-attribute-boundary), follow GitHub and record the probe. When GitHub moves to a newer cmark-gfm release, the target moves with it.

## Principles

These are in priority order. A later principle yields to an earlier one.

1. **Match GitHub.** GitHub's rendered output decides which comments exist and where. A result that differs from GitHub is a bug or a recorded [known gap](notes/gfm-comments/known-gaps.md).
2. **Linear time on any input.** Time grows linearly with the source, and memory does not grow faster than the source. Markdown is untrusted input: a crafted comment, code span, tag, or reference must not make the scanner rescan text or become superlinear.
3. **Pay only for what the document uses.** Work and memory follow the constructs present. A document without `<!--` returns at once, detailed parsing runs only when a construct can change a result, and reference replay and foreign-content tracking run only when the document needs them.
4. **Small and dependency-free.** The package has no runtime dependencies. Port only the renderer rules that decide comments, and keep the code small enough to audit.
5. **Report facts, not meaning.** Return the comment's positions and `onCommentLine`, plus the `nextLinePrefix` editing aid, and leave marker pairing, validation, and policy to consumers. `nextLinePrefix` is synthesized for writing, not a fact the renderer produced.

When exactness for an input class costs significant size or time, record a known gap, unless a real document confirmed against GitHub needs it. [Rejected: exact replay of every write](notes/gfm-comments/generated-markup.md#rejected-exact-replay-of-every-write) follows this rule: it fixed fuzz mismatches but cost several times the scan time and about 2,200 lines, and no GitHub-confirmed document needed most of those writes.

## Rules

### Scan by index, not by regular expression

`src/` does not use regular expressions. Overlapping patterns and the scan position that a global or sticky regular expression carries hide the order the scanner reads in and the state it keeps; an explicit index scan keeps both visible. `eslint.config.ts` enforces this for `src/**/*.ts` with `no-restricted-syntax`, which also rejects `String#match`, `matchAll`, and `search` because they coerce their argument to a regular expression. Tests may still use regular expressions in assertions. Performance is not a reason to add one: make the index scan faster.

## Scope

A change belongs in gfm-comments when it changes which comments GitHub renders, or the offsets and fields reported for them, including the synthesized `nextLinePrefix` editing aid.

These belong elsewhere:

- **Other Markdown nodes,** such as links, headings, and footnotes. The scanner resolves them internally to find comments, but reporting them would make gfm-comments a partial Markdown parser that must match GitHub on much more output. Use a Markdown parser for them.
- **Marker syntax and pairing,** such as `<!-- name -->` with `<!-- /name -->`. Each consumer defines its own markers.
- **What a comment means.** gfm-comments reports what GitHub renders, and consumers decide what to do with it. For example, a linter can report a comment that runs to the end of the document, because it hides the rest of the page. `source.slice(comment.contentEnd, comment.end)` is the closer, and it is an empty string for such a comment.

A consumer's need can show where to look, but it never justifies a result that differs from GitHub. A difference from GitHub is a bug, or a [known gap](notes/gfm-comments/known-gaps.md) recorded with its evidence.

`nextLinePrefix` is an editing aid, not a rendering fact. It is a synthesized prefix to write at the start of a following line so that the new line stays in the same containers; it is built from the containers, not copied from the source line, and GitHub does not render it. `onCommentLine` is a fact about the source: whether the comment is on an HTML block line whose first content, after spaces and tabs, is a comment. Neither field says whether a comment is closed; read the closer through `contentEnd` and `end`.

## How the scanner works

`findComments` in `src/index.ts` is the public entry point. The scanner builds no tree and runs three phases, each in its own directory under `src/`:

1. **Block phase** (`src/block/`). A port of cmark-gfm's block parser. It reads the source line by line, keeps the open containers and one leaf block, and reports text blocks, HTML block lines, table cells and their alignment, and generated block markup in source order. It also drops reference definitions and opens footnote definitions.
2. **Inline phase** (`src/inline/`). Within each text block, it finds raw HTML spans and the constructs that decide whether a `<!--` is raw HTML: escapes, code spans, autolinks, links, images, and footnote references. It reports the markup that links, images, and autolinks generate.
3. **Browser phase** (`src/html/`). The HTML tokenizer reads HTML block lines, raw HTML spans, and generated markup in the states that decide where a comment starts and ends, and keeps the stack of open elements. It reports each comment and sets `onCommentLine`.

Each directory ports specific files of cmark-gfm 0.29.0.gfm.13, or of the HTML standard for `html/`. Each module links the functions it ports.

| Directory | Contents | Ports |
| --- | --- | --- |
| `src/block/` | Containers, leaf blocks, block starts, HTML blocks, and table rows | `src/blocks.c`, `src/scanners.re`, `extensions/table.c`, `extensions/ext_scanners.re` |
| `src/references/` | Reference definitions and link labels | `src/inlines.c` (`cmark_parse_reference_inline`, `link_label`), `src/map.c` |
| `src/inline/` | Raw HTML, code spans, links, autolinks, emphasis, and footnote references | `src/inlines.c`, `extensions/autolink.c`, `extensions/strikethrough.c` |
| `src/html/` | The tokenizer, the element stack, and the HTML tag pattern that the block and inline phases share | the [WHATWG tokenizer](https://html.spec.whatwg.org/multipage/parsing.html#tokenization), `extensions/tagfilter.c`, and the tag rules in `src/scanners.re` |
| `src/render/` | The renderer's exact output for links, images, autolinks, code blocks, thematic breaks, and footnotes, with its escapes and entities | `src/html.c`, `src/houdini_*.c`, `cmark_clean_url` in `src/inlines.c`, `extensions/autolink.c` |
| `src/utils/` | Generic primitives: ASCII and Unicode classes, UTF-8 lengths, surrogates, and forward search. Lint stops them from importing scanner code. | `src/cmark_ctype.c`, `src/utf8.c` |

Imports go one way: `utils/` depends on nothing else; `html/` and `references/` depend only on `utils/`; `block/` adds those two; `render/` adds `block/` for one type; and `inline/` adds `render/`. `src/index.ts` and `src/budget.ts` sit above all of them.

`src/index.ts` joins the phases and owns the state that crosses them:

- **Replay.** A reference can use a definition that appears later, so once a text block can hold one, block events are buffered and replayed after the block pass with every definition known. Footnote definitions are held per definition and replayed at the end of the page, where GitHub renders them.
- **Reference budget.** `src/budget.ts` models GitHub's cap on the bytes that resolved references add. The fast path proves that no lookup can fail; otherwise a second block pass records the lookups that fail. It runs the block and inline phases itself, so it sits beside `src/index.ts` instead of under `references/`.
- **Renderer-output simulation.** `src/render/` writes code blocks, thematic breaks, links, images, autolinks, and footnote markup, and `src/index.ts` writes aligned-cell opening tags. The tokenizer reads those exact writes as HTML when raw HTML has left a tag, attribute value, or comment open; other renderer output is approximated. The [renderer audit](notes/gfm-comments/generated-markup.md#renderer-output-audit) lists every write.
- **Footnote ordering.** Because definitions move to the end, comments can be found out of source order. The scanner sorts them by `start` and clips a range that crosses a rendered definition, so ranges stay disjoint and a replacement cannot delete text GitHub shows. See [footnotes.md](notes/gfm-comments/footnotes.md).

The [notes index](notes/gfm-comments/README.md) links each rule and its evidence, including the known gaps. Read it before changing the scanner.

## Testing

- `tests/specs/rendering/` has one file per Markdown construct. Each case is a source and the comments GitHub renders for it, written inline as `[start, content]` tuples by the `rendered` helper in `tests/utils/rendered.ts`. The cases come from comment-mark's Markdown tests and the GitHub probes. This repository does not record a separate reason for each case: the test name states the rule, and the matching note explains the rule and its evidence. When a case's reason is unclear, find the construct in the [notes](notes/gfm-comments/README.md), check the probe fixture when there is one, and add the missing explanation to the test.
- `tests/specs/scaling.ts` compares run times at two input sizes to catch quadratic scans.
- `tests/specs/api.ts` covers the fields of `findComments`.
- `tests/specs/github-probes.ts` checks `findComments` against the GitHub `/markdown` outputs recorded in `tests/fixtures/github-probes.json`. Fixtures marked `evidenceOnly` have no `<!--`, so they are recorded evidence, not scanner checks.

Changes to the scanner also need the GitHub oracle, which is not in CI because it needs a C build. Build it with `pnpm oracle:build`, then run the fuzz comparison with `pnpm oracle:compare`. For a change to the element stack, also run `node scripts/oracle/validate-gumbo.ts`, and compare the output of `pnpm oracle:stack` with its [baseline](notes/gfm-comments/github-oracle.md#baseline). The scripts are in `scripts/oracle/`, and [notes/gfm-comments/github-oracle.md](notes/gfm-comments/github-oracle.md) explains them, the comparator rules, and the GitHub `/markdown` probes. Probe GitHub only with synthetic documents.

## Design decisions

### Node.js versions

Two version declarations track the [Node.js release schedule](https://endoflife.date/nodejs):

- `devEngines.runtime` pins the latest LTS release for local development and CI.
- `engines.node` defines the lowest non-EOL LTS release supported by the published package.

Update both declarations as new LTS lines become available and old lines reach end of life.

### Native TypeScript

Tests and development scripts run `.ts` files directly with Node.js type stripping. The `tsconfig.json` configuration uses `noEmit` and `allowImportingTsExtensions` because pkgroll builds the published package separately.

### Agent skills

The package ships its own skill in `skills/<name>/SKILL.md`, the layout pnpm (v12.11.0+) discovers in dependencies.

Skills from direct dependencies are linked by `pnpm install` only after approval. The `permissions` setting in `pnpm-workspace.yaml` pre-approves the skills of this project's dependencies. Run `pnpm approve` to review skills from newly added dependencies.

`skills.dirs` in `pnpm-workspace.yaml` links skills into `.agents/skills` only, the shared directory that most agents read. pnpm creates the directory when it is missing, so fresh clones and CI install without a committed placeholder. The directory is gitignored. Without `skills.dirs`, pnpm only links into agent directories that already exist, and `pnpm install` fails when approved skills have no target directory.

### Lint configuration

lintroll provides the default ESLint configuration. Add `eslint.config.ts` only when the project needs to override it.

### CI setup

The test workflow uses [pnpm/setup](https://github.com/pnpm/setup) for one setup step. It installs the pnpm version from `packageManager` in `package.json`, installs Node.js from `devEngines.runtime` in `package.json`, caches the pnpm store, and runs `pnpm install`. `require-lockfile` fails the job when `pnpm-lock.yaml` is missing.

The release workflow also runs [actions/setup-node](https://github.com/actions/setup-node) first, reading the same version from `package.json`. The Node.js runtime from pnpm/setup does not include npm, so publishing would use the runner's preinstalled npm, which is too old for [npm trusted publishing](https://docs.npmjs.com/trusted-publishers). setup-node provides the npm bundled with Node.js. See [notes/gfm-comments/ci.md](notes/gfm-comments/ci.md).

### `devEngines.runtime` for the development Node.js version

`devEngines.runtime` in `package.json` pins the exact Node.js version for development and CI. `pnpm install` downloads it and records its checksum in `pnpm-lock.yaml`, and `pnpm run` scripts use it, so contributors need no separate version manager. pnpm/setup, actions/setup-node, and Renovate read it. `clean-pkg-json` removes it from the published `package.json`.

Keep the version exact. pnpm/setup installs the declared version as written, so a range could install a newer Node.js in CI than the lockfile pins locally.

To run scripts on another Node.js version, such as the `engines.node` floor, reinstall without the pinned runtime, then put the other version first on `PATH`. `pnpm run` puts `node_modules/.bin`, which holds the pinned `node`, ahead of `PATH`. Pass `--force`, because an install into an existing `node_modules` otherwise keeps or omits that link as the previous install left it ([pnpm/pnpm#17542](https://github.com/pnpm/pnpm/issues/17542)):

```sh
pnpm install --no-runtime --force
PATH="$(pnx node@22 -p 'require("node:path").dirname(process.execPath)'):$PATH" pnpm test
pnpm install --force # restore the pinned runtime
```

See [notes/gfm-comments/node-version.md](notes/gfm-comments/node-version.md).

### CI platforms

The test workflow uses `ubuntu-latest`. Add other operating systems when the package has platform-specific behavior.

### Lint scope

`lintroll --cache --git` checks only Git-tracked files. This avoids linting generated output and local artifacts.

### Engineering notes

`notes/` holds tracked maintainer references: upstream tool behavior and project decisions, each with evidence a reviewer can check, such as pinned source links and reproducible commands. Read it before changing a decision it covers, and add a note when work produces something the next contributor would otherwise have to rediscover. Notes are not published: `files` in `package.json` includes only `dist` and `skills`.

`notes/<tool>/` owns an upstream tool's behavior. `notes/gfm-comments/` owns this project's decisions, including the scanner design and the GitHub oracle, and links to the upstream evidence.

## Project structure

```text
├── .agents/skills/            # Linked dependency skills (gitignored)
├── .github/
│   ├── renovate.json          # Renovate configuration
│   └── workflows/
│       ├── test.yml           # Build, lint, type-check, and test
│       └── release.yml        # Publish with semantic-release
├── bench/                     # Benchmarks: one entry file per `pnpm bench*` command
│   ├── inputs/                # Corpus loader and fixed synthetic workloads
│   ├── size/                  # `pnpm size` bundle measurement and size budget
│   └── utils/                 # Shared formatting and environment output
├── docs/
│   └── node.md                # Node.js API reference
├── notes/                     # Engineering notes: upstream behavior and project decisions
├── scripts/
│   └── oracle/                # GitHub oracle build and comparison scripts
├── skills/
│   └── gfm-comments/
│       └── SKILL.md           # Agent skill shipped with the package
├── src/
│   ├── block/                 # Block phase
│   ├── inline/                # Inline phase
│   ├── html/                  # Browser phase: HTML tokenizer and element stack
│   ├── references/            # Reference definitions and link labels
│   ├── render/                # Renderer output: links, code blocks, footnotes
│   ├── utils/                 # Generic primitives
│   ├── budget.ts              # Reference expansion budget
│   └── index.ts               # Library entry point: findComments
├── tests/
│   ├── fixtures/              # Recorded GitHub /markdown probes
│   ├── specs/                 # Test suites; rendering/ holds the GitHub rendering cases
│   ├── utils/                 # Test helpers
│   └── index.ts               # Test entry point
├── .editorconfig              # Editor defaults
├── .gitattributes             # Git text-file settings
├── CONTRIBUTING.md            # Development and maintenance documentation
├── LICENSE                    # MIT license
├── package.json
├── pnpm-workspace.yaml        # pnpm settings: build and skill approvals
├── README.md                  # Package landing page
└── tsconfig.json
```
