# GitHub oracle

A local stand-in for GitHub's Markdown rendering, used to check which HTML comments [the scanner](./design.md) should report. It renders with cmark-gfm 0.29.0.gfm.13, its `--github-pre-lang` option (`CMARK_OPT_GITHUB_PRE_LANG`), and GitHub's extensions, then parses the HTML with parse5 with scripting disabled, as GitHub parses it. A comment is a comment node that parse5 builds from a real `<!--` in the output, however it ends: at `-->`, at `--!>`, at once as in `<!-->`, or at the end of the input.

The oracle is wrong inside SVG and MathML, where GitHub matched none of the four parsers compared [below](#github-probes). There, [GitHub's own API](#github-probes) is the authority, and the probes below are the evidence. A [patched gumbo](#patched-gumbo) is the reference for the element stack there.

The oracle is not in the test suite because it needs a C build. In CI, the [rendering tests](../../tests/specs/rendering/) lock cases that were checked with it, and the [GitHub probe test](#probe-fixtures) locks what GitHub's API returned. Verified on macOS with CMake 4.4.3, Apple clang, Node 26.13.0, and parse5 8.1.1 on 2026-11-16.

## Build

```sh
pnpm oracle:build
```

[build.sh](../../scripts/oracle/build.sh) downloads the cmark-gfm 0.29.0.gfm.13 tag archive, checks its SHA-256, and builds it with CMake into `node_modules/.cache/gfm-oracle/`. CMake 4 needs `-DCMAKE_POLICY_VERSION_MINIMUM=3.5` because cmark-gfm 0.29.0.gfm.13 declares an older minimum. It then compiles [batch.c](../../scripts/oracle/batch.c) and [fold-scalars.c](../../scripts/oracle/fold-scalars.c) against the build, and checks two outputs: the escaped `<title>` in `x <title>` shows that the tagfilter extension is active, and a fenced block with `js` renders as `<pre lang="js">`. A second run reuses the built cmark-gfm and only recompiles the two programs; delete the cache directory for a clean build. From a clean cache, the build took about 7 seconds on an Apple M2 Max on 2026-11-16.

`batch.c` renders NUL-separated documents from stdin, so one process renders thousands of documents. It takes no arguments: it always enables `CMARK_OPT_UNSAFE`, `CMARK_OPT_GITHUB_PRE_LANG`, and `CMARK_OPT_FOOTNOTES`, and attaches the table, strikethrough, autolink, tagfilter, and tasklist extensions.

## Scripts

The scripts are in [scripts/oracle/](../../scripts/oracle/). They are TypeScript, run directly with Node.js, and are not published. By default, `compare.ts` and `show.ts` load the scanner from this checkout's `src/index.ts`. Pass `--scanner <path to src/index.ts>` to load another one, such as a baseline in another worktree. A checkout from before the src/ reorganization keeps its scanner in `src/scan-comments/index.ts`; pass that file instead, so the comparison also finds its block phase.

| Script | Purpose |
| --- | --- |
| [oracle.ts](../../scripts/oracle/oracle.ts) | The library the others use: `render`, `renderGitHub`, `createRandom`, `commentNodes`, `gumboCommentNodes`, `closerKind`, `label`, `textOf`, and `loadScanner` |
| [compare.ts](../../scripts/oracle/compare.ts) | Compares the scanner with the oracle on generated documents, and checks the [range invariants](#range-invariants) |
| [show.ts](../../scripts/oracle/show.ts) | Prints the HTML, the oracle's comment nodes, and the scanner's comments for given documents |
| [nodes.ts](../../scripts/oracle/nodes.ts) | Prints one line per document with the oracle's comment nodes and their closer kinds |
| [validate.ts](../../scripts/oracle/validate.ts) | Compares the oracle's visible text with GitHub's `/markdown` API on generated documents |
| [reprobe.ts](../../scripts/oracle/reprobe.ts) | Sends the [probe fixtures](#probe-fixtures) to GitHub again and reports changed output |
| [compare-folds.ts](../../scripts/oracle/compare-folds.ts) | Checks the [reference label case folding](#reference-label-case-folding) table |
| [generate-entities.ts](../../scripts/oracle/generate-entities.ts) | Generates or checks the [entity table](#entity-table) |
| [validate-gumbo.ts](../../scripts/oracle/validate-gumbo.ts) | Checks the [patched gumbo](#patched-gumbo) against the cases with known GitHub results |
| [compare-stack.ts](../../scripts/oracle/compare-stack.ts) | Compares the scanner with the [patched gumbo](#patched-gumbo) on generated HTML blocks |

```sh
pnpm oracle:compare                         # every fragment set, seeds 7, 11, and 23, 20,000 documents each
pnpm oracle:compare --set footnotes --seed 202 --show 25
pnpm oracle:compare --scanner ../baseline/src/index.ts
pnpm oracle:compare --approach regex        # or micromark: grade another approach, as in the README's accuracy table
node scripts/oracle/show.ts '["x <!-- a --!> V -->"]'
node scripts/oracle/nodes.ts '["x <!-- a\n\nV", "<svg/><![CDATA[ > <!-- a -->x"]'
```

`compare.ts` prints each run's mismatches, scanner errors, and invariant violations, with the shortest few documents of each (`--show`, 5 by default), then a table of the counts. It exits with 1 when the scanner throws or breaks an invariant. Mismatches do not fail it, because the known gaps and oracle errors below produce some on every seed.

`validate.ts` and `reprobe.ts` call GitHub's API with the `gh` CLI, one request per document. Run them by hand with synthetic documents only, and keep the count small.

### Comparator rules

Each comment compares by its closer kind (`close`, `bang`, `empty`, or `eof`) and, unless it is empty, by its numbers. A comment of kind `eof` compares by its opening only: its tail is source text on one side and rendered output on the other, and both end at the end of the document. parse5's end offset for such a comment does not reach the end of the HTML, so the oracle side classifies it by elimination.

The comparison numbers each generated marker, such as `<!-- a12 -->`, and each bare `<!--`, such as `<!--o12q`. A comment is identified by the number it starts with, which checks its opening, and the last marker number in it, which checks its closing. Where a comment has no number, as with `<!-->` or a `<!--` built from two fragments, its first or last 3 characters are compared after normalization: entities decoded, and tag-like sequences and whitespace dropped. A comment that spans chunks also holds markup that the renderer generates, so its full text cannot match. A few mismatches per seed remain as artifacts of this normalization, when generated markup such as `<hr />` or a setext underline falls in those last 3 characters. Use `show.ts` to confirm each mismatch before treating it as a scanner bug.

**Footnotes (2026-11-16).** `batch.c` enables `CMARK_OPT_FOOTNOTES`, as GitHub does, and the `footnotes` fragment set exercises definitions, references, escaped and entity carets, and the open quotes and comments that cross into the footnote list. Three comparator rules follow from the renderer moving footnotes to the end:

- **Order.** The scanner reports comments in source order, while the oracle's output has them in render order. When the output has a footnote list, the two lists compare as sorted sets.
- **Crossing comments.** A comment that runs from one render stream into another, such as from the body into the list or from one footnote into the next, holds `<section class="footnotes" data-footnotes>` or `<li id="fn-` in the oracle. It has no source range. When the scanner reports it as running to the end of the document, the comparator gives it the kind `eof`.
- **Clipped comments.** The scanner ends a comment at the start or end of a rendered definition, with an empty closer, so that [reported ranges stay disjoint](./footnotes.md#footnotes). Such a comment ends before the end of the document, and the comparator gives it the kind `clip`. It compares by its opening only and matches the oracle's comment with the same opening, whatever that comment's closer is.

The oracle disagrees with GitHub on footnote labels. cmark-gfm 0.29.0.gfm.13 copies the label from the source columns of the first text node's buffer, while GitHub ends it at the first inline that is not text; see the [footnote probes](./footnotes.md#footnotes). With `&Hat;` in a reference, the copy reads past the decoded text node, and the output can be truncated. A comment whose source range spans an unreferenced definition can also differ in its last marker number, because the oracle's comment text is rendered output. [Verification](./verification.md#github-oracle) lists the mismatches by seed.

### Range invariants

For every document, `compare.ts` also checks the ranges the scanner reports, with no oracle needed for the first three:

- `contentStart` is `start + 4`.
- `contentStart <= contentEnd <= end <= source.length`.
- Ranges are in source order and disjoint: each `start` is at or after the previous `end`.
- No range crosses the source start or end of a footnote definition that the oracle renders. The definitions' ranges come from the block phase's `footnoteStart` and `footnoteEnd` events in `block/index.ts` beside the scanner, and a definition counts as rendered when the oracle's output has `<li id="fn-` with its label. Of the definitions with the same label, compared case-insensitively, only the first counts. cmark-gfm writes the raw label into the `id` with `houdini_escape_href` ([houdini_href_e.c](https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/houdini_href_e.c)), so `a&b` becomes `a&amp;b`, `a"b` becomes `a%22b`, and `é` becomes `%C3%A9`. The escape passes `%` through, so `a%22b` and `a"b` have the same `id` and the `id` cannot be decoded. `compare.ts` escapes each label the same way and compares the result with the `id` exactly. When a rendered `<li id="fn-` matches no definition, `compare.ts` prints a warning with the count, because the check skips that definition. On 2026-11-16, no run printed the warning. The oracle's labels can differ from GitHub's, as above, so check a violation on such a document with a GitHub probe. A scanner without that module skips this check.

On 2026-11-16, a scanner copy without the clipping rule gave 18, 24, 33, and 23 violations on `footnotes` seeds 7, 11, 23, and 202, and the current scanner gave 0 on every set.

## Results

The results for the current scanner are in [Verification](./verification.md#github-oracle). On 2026-11-16, `pnpm oracle:compare` with 20,000 documents per run gave these mismatch counts for seeds 7, 11, and 23, with no scanner errors and no invariant violations:

| Fragment set | Seed 7 | Seed 11 | Seed 23 |
| --- | ---: | ---: | ---: |
| `foreign` | 19 | 27 | 23 |
| `tables` | 0 | 0 | 0 |
| `refs` | 0 | 0 | 0 |
| `links` | 0 | 0 | 0 |
| `autolink` | 0 | 0 | 0 |
| `footnotes` | 4 | 3 | 2 |
| `rich` | 0 | 4 | 1 |

## Reference label case folding

cmark-gfm matches a reference to its definition after `cmark_utf8proc_case_fold`, which uses the Unicode tables bundled with cmark-gfm 0.29.0.gfm.13. The scanner folds with JavaScript's `toLowerCase().toUpperCase()`, which uses the newer tables of the running Node. The two disagree on 185 scalars. Each of them folds to itself in cmark-gfm, but JavaScript merges it with another scalar, such as dotless `ı` with `I`. [references/label.ts](../../src/references/label.ts) keeps these scalars unfolded.

Measured on 2026-11-14 with Node 26.13.0 (Unicode 17.0). Of the 1,112,064 Unicode scalars, 2,767 change under either fold. The scanner keys a label instead of folding it, so `A` keys as `A` where cmark-gfm folds it to `a`. What must agree is which labels match. After the exceptions, every scalar has the same key as its cmark-gfm fold, so labels that cmark-gfm folds alike match, and no two scalars that cmark-gfm folds apart share a key. Labels that combine each changed scalar with `̇`, `ͅ`, `Σ`, `I`, `ı`, `ß`, or `a` also agree. That is a sample, not proof for every label.

Regenerate the table when Node's `process.versions.unicode` changes. `pnpm oracle:build` also builds [fold-scalars.c](../../scripts/oracle/fold-scalars.c), which prints each scalar and its cmark-gfm fold as hexadecimal UTF-8. Then run:

```sh
node scripts/oracle/compare-folds.ts
```

It prints the exception count and the exceptions as `[start, end]` ranges in hexadecimal, for the table in `references/label.ts`. The other four counts must be 0: exceptions that cmark-gfm folds to another scalar, scalars whose key differs from the key of their cmark-gfm fold, keys shared by scalars that cmark-gfm folds apart, and labels where neighboring scalars change the key. On 2026-11-16 with Node 26.13.0, it printed 2,767 changed scalars and 185 exceptions, and 0 for the other four counts.

## Entity table

[render/entities.ts](../../src/render/entities.ts) holds the decoded byte length of the 49 named entities in cmark-gfm 0.29.0.gfm.13 whose first decoded byte is ASCII, for the [reference expansion budget](./reference-budget.md#reference-expansion-budget) and generated code-block rendering. The other 2,076 names are dropped: a dropped name is never decoded, its source text is escaped, and no tokenizer state transition compares a non-ASCII character, while the budget charges their source bytes as a [known gap](./known-gaps.md). Its numeric decoder is also used by generated code-block rendering. Run [generate-entities.ts](../../scripts/oracle/generate-entities.ts) when the scanner ports a new cmark-gfm tag. By default, it reads `src/entities.inc` from the oracle build and writes this checkout's `src/render/entities.ts`; pass other paths as arguments:

```sh
node scripts/oracle/generate-entities.ts --check
node scripts/oracle/generate-entities.ts <cmark-gfm>/src/entities.inc src/render/entities.ts
```

The script replaces only the `groups` entries and leaves the numeric decoder and lookup code intact. With `--check`, it verifies the current table without writing. It reads every entry, keeps the names whose first decoded byte is ASCII, and groups them by decoded byte length and that byte. The first byte can complete a backslash escape, as `=` does in `\&bne;`. The script fails if the source table does not have 2,125 unique entries, if the kept count is not 49, if decoding any entity grows it by more than 1 byte, which the budget's fast bound relies on, or if a multi-byte entity decodes to a backslash. The source table itself supplies the decoded bytes; the scanner stores only the metadata it needs. On 2026-11-17, `--check` reported 2,125 names, 49 kept, and that the groups match.

## GitHub probes

GitHub's [`POST /markdown`](https://docs.github.com/en/rest/markdown/markdown#render-a-markdown-document) API, in `gfm` mode, returns the HTML that GitHub serves. It strips every recognized comment, so the visible text shows how each `<!--` was parsed: a comment disappears, and text appears escaped as `&lt;!--`. Each probe sends one synthetic document:

```sh
jq -n --arg t "$document" '{text:$t,mode:"gfm"}' | gh api markdown --input -
```

### Probe fixtures

[tests/fixtures/github-probes.json](../../tests/fixtures/github-probes.json) records each probe in these notes and in [the scanner notes](./README.md) whose document is known: 96 on 2026-11-16. Of these, 84 are scanner checks. The other 12 have no `<!--`, so the scanner reports nothing for them; they record how GitHub renders task lists and footnote labels, and are marked `evidenceOnly` with the reason. `reprobe.ts` rechecks all 96. Each entry has an `id`, the `input`, GitHub's exact `output`, the `date` of that output, a `note` with the finding, and `evidence`, the section that uses it. Where the notes kept only a summary of the output, the document was sent again on 2026-11-16, and every result matched the summary. The documents of the earlier round of 35 probes below and of the validation runs were not kept, so they are not fixtures.

The [GitHub probes test](../../tests/specs/github-probes.ts) checks `findComments` against each fixture that is not `evidenceOnly`, without a model of GitHub's sanitizer. For an `evidenceOnly` fixture, it checks only that the input has no `<!--`. GitHub strips every comment, so the output shows which text the comments hid. The test compares this with the reported ranges through witnesses: strings in the source that GitHub shows unless something hides them.

- A **word witness** is a run of 2 or more uppercase letters and digits with at least one letter, such as `VISIBLE` or `A1`. A tag name such as `SVG` in `<SVG>`, and `CDATA` in `<![CDATA[`, are not witnesses.
- A **marker witness** is `<!--` up to the next `>`, with no `<` in between, such as `<!-- a -->` or `<!-->`.

For each witness string, the count in GitHub's output, after entities are decoded, must equal the count in the source outside every reported range. A witness that overlaps a range counts as hidden. A range that holds text GitHub shows, or a missed comment that hides a witness, changes a count. The rule cannot tell two comments apart that hide the same witnesses. A fixture that is a scanner check must have `<!--` in its input and at least one witness. Each fixture's output and witnesses can be checked by hand, so the expectation does not depend on parse5 or the local oracle.

A reported comment that overlaps no witness changes no count, so the counts alone cannot notice it missing. The comment `<!-- open` that runs to the end in `footnote-10` is one: the witness it hides, `VISIBLE`, renders after it in the footnote list but is before it in the source. So every reported comment must overlap a witness, or be listed in the fixture's `comments`.

Optional fields cover what the rule cannot derive:

- `comments` lists the `[start, end]` source range of each reported comment that overlaps no witness. The list must equal those comments exactly, so a scanner that drops one fails. `footnote-10` and `footnote-11` have one each.
- `hiddenOtherwise` counts the witnesses that GitHub hides by other means, such as an unreferenced footnote definition, the inlines of a footnote reference, or an attribute value that GitHub drops. `hiddenReason` says which.
- `gap` marks a [known gap](./known-gaps.md#known-gaps). The check must fail on it, so a fix to the gap fails the test until the mark is removed.
- `evidenceOnly` gives the reason a fixture without `<!--` is kept.

On 2026-11-16, scanner copies with one defect each failed these fixtures:

| Defect | Failing fixtures |
| --- | --- |
| Comments closed by `--!>` not reported | `bang-closer-block`, `bang-closer-inline` |
| `--!>` not read as a closer | `bang-closer-block`, `bang-closer-inline` |
| Comments that run to the end not reported | `eof-comment`, `eof-comment-blockquote`, `footnote-10` |
| Comments not clipped at footnote definitions | `footnote-11` |
| Clipped comments dropped instead of reported | `footnote-11` |
| Comments without a closer dropped in documents with footnotes | `footnote-10`, `footnote-11` |
| No foreign-content tracking | 17 fixtures |
| Link, image, autolink, and aligned cell markup not written, and definition-only paragraphs read as `<p>` (`develop` before the [link and cell markup change](./inline-and-links.md#link-image-and-cell-markup)) | the 10 `link-image-and-cell-markup` fixtures and `task-attribute-reference` |

Before the `comments` field existed, the copy that drops clipped comments passed every fixture.

To add a probe, append an entry with `"output": null` and `"date": null`, then record it. To check the fixtures against GitHub's current output, run `reprobe.ts` without options. It prints each fixture whose output changed, ignoring the hash suffix in footnote ids, and exits with 1. `--update` writes the new outputs. Each fixture is one request, so filter with `--id` when only a few matter.

```sh
node scripts/oracle/reprobe.ts --record
node scripts/oracle/reprobe.ts --id foreign-9 --id foreign-102
```

### Foreign content

Probed on 2026-11-14 and again on 2026-11-16, with the same results; the fixtures are `foreign-1` to `foreign-114`. In the table, D is `<![CDATA[ > <!-- a -->x<!-- /a --> ]]>`. **In** means GitHub kept D as CDATA text, with the output holding `&gt; &lt;!-- a --&gt;x&lt;!-- /a --&gt;`. **Out** means D was a bogus comment that ends at the first `>`, so the markers rendered as comments, with the output holding ` x ]]&gt;`. The last column says whether [the scanner](./html-tokenizer.md#github-html-handling) matches. The [foreign content tests](../../tests/specs/rendering/foreign-content.ts) lock these cases, with `old` in place of `x`.

| # | Markdown | GitHub | Scanner |
| --- | --- | --- | --- |
| 1 | `<svg>\n\ntext\n\nD` | in | matches |
| 2 | `<svg><span></svg>D` | out | matches |
| 3 | `<svg></span>D` | in | matches |
| 4 | `<svg></p>D` | out | matches |
| 5 | `<svg><br>D` | D dropped, no comments | matches |
| 6 | `<svg><svg></svg>D` | in | matches |
| 7 | `<math><mi>D` | in | matches |
| 8 | `<svg/>D` | out | matches |
| 9 | `<svg><foreignObject><div></svg></div>D` | in | differs |
| 10 | `<select><math>D` | out | matches |
| 11 | `<select></select><svg>D` | in | matches |
| 12 | `<p><svg></p>D` | out | matches |
| 13 | `<SVG>D` | in | matches |
| 14 | `- <svg>\n- D` | out | matches |
| 15 | `> <svg>\n\nD` | out | matches |
| 16 | `<em><svg></em>D` | out | matches |
| 17 | `*<svg>* D` | out | matches |
| 18 | `<svg><desc>D` | in | matches |
| 19 | `<table><tr><td><svg></td></tr></table>D` | out | matches |
| 20 | `<svg>\n</svg>\n\nD` | out | matches |
| 101 | `x <svg>\n\nD` | out | matches |
| 102 | `x <svg><foreignObject>\n\nD` | in | differs |
| 103 | `- <svg>\n\n  para\n\n  D` | in | matches |
| 104 | `<svg>\n\n- D` | in | matches |
| 105 | `- x <svg>\n- D` | out | matches |
| 106 | `<select>\n\n<svg>D` | out | matches |
| 107 | `<div><p><svg></div>D` | out | matches |
| 108 | `<b><svg></b>D` | out | matches |
| 109 | `<table><svg>D` | in | matches |
| 110 | `<svg><table>D` | in | matches |
| 111 | `# <svg>\n\nD` | out | matches |
| 112 | `<svg>\n\n# x\n\nD` | in | matches |
| 113 | `<svg><noscript><!-- a -->x<!-- /a --></noscript> tail` | comments stripped | matches |
| 114 | `<div><span><svg></div>D` | out | matches |

An earlier round of 35 probes on the same day found:

- **Breakout start tags don't leave SVG.** D stays in after `<em>x</em>`, `<p>x</p>`, `<b>x</b>`, `<div>x</div>`, and `<font color="red">` inside `<svg>`, and after Markdown's own `*x*` inside it. The [HTML standard](https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inforeign) leaves foreign content at each of these.
- **End tags close SVG.** `<svg><foreignObject></svg>D` and `<div>\n\ntext\n\n<svg>\n</div>\nD` are out. `<svg><foreignObject><p><p></p></foreignObject>D</svg>` is in.
- **Integration points keep CDATA.** `<math><annotation-xml encoding="text/html">D` is in, and so is the encoding `text&#47;html`.
- **Scripting is disabled.** `<noscript><!-- a -->x<!-- /a --></noscript> tail` renders `<p>x tail</p>`, so the content is HTML with comments, not raw text.
- **Comments are stripped everywhere tested,** including inside `<svg>`, `<math>`, and `<select>`.

### Tight-list boundary

On 2026-11-15, GitHub `/markdown` in `gfm` mode rendered these two documents, the fixtures `tight-list` and `loose-list`. `VISIBLE` distinguishes the comment boundary even though GitHub strips comments.

| Markdown | GitHub output |
| --- | --- |
| `- <!-- n --><?x\n  VISIBLE <!-- a -->old<!-- /a -->` | `<ul>\n<li>\nold</li>\n</ul>` |
| The same input followed by `\n\n- b` | `<ul>\n<li>\nVISIBLE old<p></p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>` |

The first list is tight, so its paragraph emits no `<p>` and the bogus comment started by `<?x` hides `VISIBLE` and the opening marker. The later item makes the second list loose, so `<p>` ends that bogus comment before `VISIBLE`. cmark-gfm 0.29.0.gfm.13 with `--github-pre-lang` and parse5 give the same boundary. The tight-list case is a `gap` probe in [github-probes.json](../../tests/fixtures/github-probes.json) (lines 409-417), checked by [github-probes.ts](../../tests/specs/github-probes.ts) (lines 136-140). The rendering tests also cover definition-only paragraphs in [link-and-cell-markup.ts](../../tests/specs/rendering/link-and-cell-markup.ts) (lines 10-21), blockquotes in [comments-that-span-lines.ts](../../tests/specs/rendering/comments-that-span-lines.ts) (lines 33-111), line endings in [line-endings.ts](../../tests/specs/rendering/line-endings.ts), buffered events in [generated-block-markup.ts](../../tests/specs/rendering/generated-block-markup.ts) (line 163) and [comment-and-code-boundaries.ts](../../tests/specs/rendering/comment-and-code-boundaries.ts) (line 5), and a later marker's range in [link-and-cell-markup.ts](../../tests/specs/rendering/link-and-cell-markup.ts) (lines 102-106); those variants were checked with the local oracle, not separately on GitHub.

### Task-list checkbox and attribute boundary

On 2026-11-15, `/markdown` in `gfm` mode rendered the following document with each fragment in the table. The fixtures are `task-attribute-checked`, `task-attribute-unchecked`, `task-attribute-ordinary`, and `task-attribute-literal-input`. The later raw `<i>` supplies a literal quote. `BEFORE` and `VISIBLE` make the two marker positions distinguishable even though GitHub strips comments.

```text
<!--><a x="

- FRAGMENT <!-- a -->BEFORE<!-- /a --><i title="v">AFTER</i><!-- a -->VISIBLE<!-- /a -->
```

| `FRAGMENT` | GitHub output |
| --- | --- |
| `[x] item` | `AFTERVISIBLE\n` |
| `[ ] item` | `AFTERVISIBLE\n` |
| `ordinary item` | `AFTERVISIBLE\n` |
| `<input type="checkbox" disabled="" /> item` | ` item BEFORE<i title="v">AFTER</i>VISIBLE\n` |

The cmark-gfm 0.29.0.gfm.13 plus parse5 oracle instead reports both markers for `[x] item`: cmark emits a checkbox containing quotes before `BEFORE`. GitHub's task syntax has the same observable boundary as the ordinary item, while the literal input exposes `BEFORE`. This is consistent with the attribute remaining open until the later `<i>`. The [generated block markup tests](../../tests/specs/rendering/generated-block-markup.ts) check all four fragments against this table. The scanner matches because it reports no event for the checkbox.

GitHub `/markdown` also turns task syntax inside a raw HTML list item into checkboxes. On 2026-11-15, this input, the fixture `task-raw-html`:

```html
<ul><li>[ ] item</li><li>[x] item</li></ul>
```

produced:

```html
<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" id="" disabled="" class="task-list-item-checkbox" aria-label="Incomplete task"> item</li><li class="task-list-item"><input type="checkbox" id="" disabled="" class="task-list-item-checkbox" aria-label="Completed task" checked=""> item</li></ul>
```

The local cmark-gfm 0.29.0.gfm.13 oracle with `--github-pre-lang` and the tasklist extension leaves the raw HTML input unchanged. GitHub's archived [`task_list` v1.0.2 filter](https://github.com/github/task_list/blob/v1.0.2/lib/task_list/filter.rb#L11-L15) says to run it after Markdown and sanitization, and [modifies the parsed document](https://github.com/github/task_list/blob/v1.0.2/lib/task_list/filter.rb#L108-L130). These results support a post-parse task-list pass, but neither the response nor the archived filter proves GitHub's current internal pipeline.

Additional `/markdown` probes on 2026-11-15, the fixtures `task-reference` and `task-attribute-reference`, distinguish task syntax from a literal input and show that reference resolution matters:

| Markdown | GitHub output |
| --- | --- |
| `- [x] item\n\n[x]: /url` | `<ul>\n<li><a href="/url">x</a> item</li>\n</ul>` |
| The attribute-boundary input above with `[x] item` and a later `[x]: /url` definition | `x item BEFORE<i title="v">AFTER</i>VISIBLE\n` |

For the next five probes, the fixtures `task-select-*` and `task-svg-attribute-*`, let `W` be `<!-- a -->PRESERVE <![CDATA[ > <!-- a -->old ]]> tail<!-- /a -->`:

| Markdown | GitHub output |
| --- | --- |
| `<select>\n\n- [ ] x <svg>\n\n` followed by `W` | `\n\n[ ] x \n\nPRESERVE  old ]]&gt; tail` |
| `<select>\n\n- <input type="checkbox" disabled="" /> x <svg>\n\n` followed by `W` | `\n\n x \n\nPRESERVE  &gt; &lt;!-- a --&gt;old  tail` |
| `<div>\n<svg><a x="\n\n- [ ] item\n\n` followed by `W` | `<div>\n</div>` |
| `<div>\n<svg><a x="\n\n- ordinary item\n\n` followed by `W` | `<div>\n</div>` |
| `<div>\n<svg><a x="\n\n- <input type="checkbox" disabled="" /> item\n\n` followed by `W` | `<div>\n item\n\nPRESERVE  &gt; &lt;!-- a --&gt;old  tail</div>` |

In the SVG attribute cases, cmark renders the task and literal-input documents identically, but GitHub hides `PRESERVE` only in the task document. These observations rule out treating every task marker as the local oracle's generated checkbox before HTML tokenization. They do not identify GitHub's internal rendering stages.

### Parsers that don't match

No local parser reproduces these results, so none can stand in for GitHub inside SVG and MathML:

- **parse5 8.1.1** leaves SVG at breakout start tags. It also reads CDATA directly at an `annotation-xml` integration point as a bogus comment, and it still has the "in select" insertion mode that the standard removed ([inikulin/parse5#1610](https://github.com/inikulin/parse5/issues/1610)). Its default `scriptingEnabled: true` makes `<noscript>` raw text, so the scripts above turn it off.
- **Nokogiri 1.13.8's HTML5 parser (gumbo)** leaves SVG at breakout start tags such as `<em>` and `<font color>`. On the 293 cases with known GitHub results, the unpatched gumbo disagreed with the scanner on 71: 58 from breakout, 4 from `isindex`, `menuitem`, and `dialog`, and 9 that come from cmark-gfm's HTML. With those two kinds of difference patched, it is the [element stack reference](#patched-gumbo).
- **lol-html v3.0.3's tree-builder simulator** leaves foreign content at breakout start tags and reads `<noscript>` as raw text ([`tree_builder_simulator/mod.rs`](https://github.com/cloudflare/lol-html/blob/v3.0.3/src/parser/tree_builder_simulator/mod.rs)).
- **libxml2 2.14.6** (through lxml 6.1.3) reads `<![CDATA[` as a bogus comment everywhere, even in `<svg><text>`.

GitHub's public sources don't name its sanitizer. The [html-pipeline README](https://github.com/gjtorikian/html-pipeline/blob/v3.2.4/README.md) says GitHub no longer uses html-pipeline. Probes 9 and 102 are hard to reconcile with a spec-following tree builder: probe 9 needs `<div>` inside `foreignObject` to be an HTML element, which blocks `</svg>`, while probe 102 needs the paragraph's `<p>` there to stay foreign. One explanation is a streaming stage that decides CDATA before a full parser builds the tree. That is an inference from these two probes, not a documented fact, and a parser not compared here could still explain both.

Rerun these probes when GitHub's rendering changes, or before relying on a parser as a stand-in for SVG and MathML.

## Patched gumbo

**Decision (2026-11-17): check the element stack against a patched gumbo.** The [element stack](./html-tokenizer.md#github-html-handling) decides one thing: whether the current node is SVG or MathML content, where `<![CDATA[` starts a CDATA section that hides `<!--`. Outside it, `<![CDATA[` is a bogus comment that ends at `>`. Review found five defects in the stack that no script found, because the parse5 oracle is wrong in foreign content: integration points, implicit closes and scope, obsolete void elements, a foreign `select`, and `noscript`. The 2026-11-17 decisions in [GitHub HTML handling](./html-tokenizer.md#github-html-handling) record them. This reference renders with cmark-gfm as above, then parses the HTML with the gumbo that Nokogiri 1.13.8 vendors, with three edits that follow GitHub's probes. It is a test reference only: the scanner still models GitHub's observations rule by rule, as [Rejected: follow the standard or a published parser](./html-tokenizer.md#github-html-handling) records.

### The patch

[build.sh](../../scripts/oracle/build.sh) downloads the [Nokogiri v1.13.8 tag archive](https://github.com/sparklemotion/nokogiri/tree/v1.13.8/gumbo-parser/src), checks its SHA-256, extracts `gumbo-parser/src` into `node_modules/.cache/gfm-oracle/gumbo-nokogiri-1.13.8/`, applies [gumbo.patch](../../scripts/oracle/gumbo.patch), and compiles it with [gumbo-batch.c](../../scripts/oracle/gumbo-batch.c) into `gumbo-batch` beside the cmark-gfm build. It extracts and patches again on every run, about 3 seconds on an Apple M2 Max, so an edited patch takes effect. The patch changes only `parser.c`:

1. **No breakout.** It removes the clause of `handle_in_foreign_content` that pops foreign content at breakout start tags, `<font>` with `color`, `face`, or `size`, and `</br>` and `</p>` ([parser.c lines 4402-4437](https://github.com/sparklemotion/nokogiri/blob/v1.13.8/gumbo-parser/src/parser.c#L4402-L4437)). Those start tags stay foreign, and those end tags take the steps for any other end tag in foreign content, which walk the foreign elements and then process the tag as HTML. GitHub has no breakout tags; see [GitHub HTML handling](./html-tokenizer.md#github-html-handling).
2. **Obsolete void elements.** `menuitem`, which gumbo knows as an ordinary element, and `isindex`, which it does not know, join the `param`, `source`, and `track` branch of the in-body rules ([line 3279](https://github.com/sparklemotion/nokogiri/blob/v1.13.8/gumbo-parser/src/parser.c#L3279)), so they never stay open. The unpatched gumbo already agreed on the validation cases for the other obsolete void elements, such as `keygen` and `frame`.
3. **An ordinary `dialog`.** `dialog` leaves the start tags that close a `p` ([line 2940](https://github.com/sparklemotion/nokogiri/blob/v1.13.8/gumbo-parser/src/parser.c#L2940)) and the end tags that close their element in scope ([line 3018](https://github.com/sparklemotion/nokogiri/blob/v1.13.8/gumbo-parser/src/parser.c#L3018)), so its end tag is any other end tag. GitHub hid the markers after `<p><dialog><svg></p>` and showed them after `<dialog><div><svg></dialog>`; see [GitHub HTML handling](./html-tokenizer.md#github-html-handling).

`gumbo-batch` parses NUL-separated fragments in a `body` context and writes each comment node whose markup starts with a real `<!--`, with its markup and text. `gumboCommentNodes` in [oracle.ts](../../scripts/oracle/oracle.ts) returns the same shape as `commentNodes`, so both scripts below compare with the [comparator rules](#comparator-rules), as sorted lists.

### Validation

```sh
node scripts/oracle/validate-gumbo.ts
```

[validate-gumbo.ts](../../scripts/oracle/validate-gumbo.ts) compares the scanner with cmark-gfm plus the patched gumbo on the 293 cases with known GitHub results: the 96 [probe fixtures](#probe-fixtures) and the 197 distinct inputs of the [foreign content tests](../../tests/specs/rendering/foreign-content.ts), which it collects by loading the test file with stand-ins for manten and the `rendered` helper. Each recorded disagreement has a reason in the script, and it exits with 1 on an unexplained one. On 2026-11-17:

| gumbo build | Agree | Disagree |
| --- | ---: | ---: |
| Unpatched | 222 | 71 |
| Breakout clause removed | 280 | 13 |
| All three edits, as shipped | 284 | 9 |

The 4 cases that the last two edits fix are `<isindex><svg></isindex>`, `<menuitem><svg></menuitem>`, and the two `dialog` probes above. None of the 9 remaining disagreements is in gumbo: in each, parse5 reads cmark-gfm's HTML as gumbo does, and the script prints that check. After the [fuzz groups](#element-stack-fuzz) 4, 5, 6, and 10 were fixed on 2026-11-17, the tests had 13 more inputs, and the script reported 306 cases: 297 agree, and the same 9 disagree.

- **cmark-gfm differs from GitHub (7):** the task-list checkbox in `task-attribute-checked`, `task-attribute-unchecked`, `task-svg-attribute-task`, and `task-select-task` (see [Task-list checkbox and attribute boundary](#task-list-checkbox-and-attribute-boundary)), and the footnote output in `footnote-entity-caret-reference`, `footnote-self-referencing-definition`, and `footnote-label-ends-at-inline` (see [Verification](./verification.md#github-oracle)).
- **A comment that crosses into the next footnote (1):** `footnote-11`, which compare.ts handles with its crossing rule.
- **A known scanner gap (1):** `tight-list`, where gumbo matches GitHub (see [Tight-list boundary](#tight-list-boundary)).

### Element stack fuzz

```sh
pnpm oracle:stack                      # seeds 7, 11, and 23, 1,000,000 documents each
pnpm oracle:stack --seed 5 --count 200000 --show 5
```

[compare-stack.ts](../../scripts/oracle/compare-stack.ts) generates HTML blocks: `<div>\n` and 2 to 15 fragments from SVG and MathML start and end tags, integration points, `select`, table parts, `p`, `li`, `dd`, `dt`, headings, `button`, `object`, `template`, `noscript`, `a`, `b`, `nobr`, `form`, void and obsolete void tags, and the marker `<![CDATA[ > <!-- aN --> ]]>`. It reduces each mismatch by dropping fragments while it still mismatches, renumbers the markers, and prints every reduction, most frequent first, with both sides' comments. The default run took about 35 seconds on an Apple M2 Max. On 2026-11-17, in the first run and after the fixes for groups 4, 5, 6, and 10 below:

| Seed | Mismatches, first run | Reductions, first run | Mismatches, after the fixes | Reductions, after the fixes |
| --- | ---: | ---: | ---: | ---: |
| 7 | 90 | 19 | 82 | 11 |
| 11 | 91 | 20 | 86 | 16 |
| 23 | 79 | 20 | 70 | 14 |

In the first run, the reductions fell into 10 groups. GitHub `/markdown` agreed with the patched gumbo on all 32 probes below, sent on 2026-11-17, so each group is a scanner difference, not an oracle defect. Each probe was `<div>\n`, the markup, and `<![CDATA[ > <!-- x -->KEEP ]]></div>`, as in [GitHub HTML handling](./html-tokenizer.md#github-html-handling). "Open" means GitHub's output held ` &gt; &lt;!-- x --&gt;KEEP `, so the CDATA section was text and the foreign element was still open. "Closed" means it held `KEEP ]]&gt;` without the marker, so `<!-- x -->` was a comment. In the first run, the scanner reported the opposite of GitHub in every row.

| Group | Markup | GitHub and gumbo |
| --- | --- | --- |
| 1. Form element pointer: a `form` start tag is ignored while a form is open, and `</form>` removes only the form | `<form><svg></form>` | open |
| | `<form><math><mn><form>` | open |
| | `<svg><foreignObject><form><span></form>` | closed |
| | `<form><mtext><form><svg></mtext>` | closed |
| | `<math><ms><form><div></form>` | closed |
| | `<form><foreignObject><form><svg></foreignObject>` | closed |
| 2. `template` inside `select` uses its own insertion mode | `<select><template><svg>` | open |
| | `<select><template><keygen><svg></template>` | closed |
| 3. Template contents: table parts open inside `template`, and its mode ignores `</table>` | `<template><td><svg></td>` | closed |
| | `<template><caption><math></caption>` | closed |
| | `<table><template><svg></table>` | open |
| 4. `</table>`, `</td>`, and `</template>` at or below an integration point use table scope, which integration points do not bound | `<table><math><mo></table>` | closed |
| | `<template><math><mn></template>` | closed |
| | `<table><td><table></table><math><mtext></td>` | closed |
| | `<table><svg><desc></table>` | closed |
| 5. A foreign end tag finds its element through an integration point | `<math><mtext><svg></math>` | closed |
| | `<math><mi><svg></math>` | closed |
| | `<svg><desc><math></svg>` | closed |
| | `<object><math><foreignObject><mo><svg></foreignObject></object>` | closed |
| 6. A heading end tag in foreign content matches names exactly | `<h2><svg><h2></h1>` | closed |
| 7. The table insertion modes | `<table><math><mi><form>` | open |
| | `<table><select><caption><svg>` | open |
| | `<table><select><tr><svg>` | open |
| | `<table><select></table><svg>` | open |
| | `<table><caption><table><math></caption>` | open |
| | `<table><nobr><table><svg></nobr>` | closed |
| 8. A `nobr` start tag with an open `nobr` | `<math><mn><nobr><nobr></nobr>` | open |
| | `<nobr><mtext><nobr><math></mtext>` | open |
| 9. The adoption agency algorithm keeps its furthest block open, so an HTML element stays current | `<svg><foreignObject><nobr><p></nobr>` | closed |
| | `<math><mtext><b><noscript></b>` | closed |
| 10. `svg` inside `annotation-xml` starts an SVG run, so its `ms` and `mi` are SVG, not integration points | `<math><annotation-xml><svg><ms><b>` | open |
| | `<math><annotation-xml><svg><ms><form>` | open |

The group names describe the standard's rule that gumbo follows. Each row was a reduction or a minimal form of one, and reducing a mismatch only shows that every fragment it keeps is needed, not which scanner rule is wrong.

Groups 4, 5, 6, and 10 were errors in rules that the stack already models, and the [element stack decision](./html-tokenizer.md#github-html-handling) of 2026-11-17 fixed them. The scanner now matches GitHub on every probe in those rows. Two more probes on 2026-11-17 confirmed group 6: `<h2><math><h2></h1>` and `<h1><svg><h1></h2>` were closed. Groups 1, 2, 3, 7, 8, and 9 need parser subsystems that the stack does not have, and they are [known gaps](./known-gaps.md#known-gaps).

#### Baseline

The fuzz is deterministic, so its output is a baseline, as `compare.ts` output is. For a change to the element stack, run `pnpm oracle:stack` on `develop` and on the change, and compare the two outputs byte for byte. A changed count or a new reduction is a new mismatch class: reduce it, probe GitHub with the form above, and fix it or record it here. After the fixes for groups 4, 5, 6, and 10 on 2026-11-17, every reduction belongs to an unmodeled group:

| Reduction, between `<div>\n` and the marker | Group | Seed 7 | Seed 11 | Seed 23 |
| --- | --- | ---: | ---: | ---: |
| `<select><template><math>` | 2 | 24 | 26 | 20 |
| `<select><template><svg>` | 2 | 17 | 24 | 12 |
| `<select><template><keygen><svg></template>` | 2 | | | 1 |
| `<form><math></form>` | 1 | 23 | 12 | 10 |
| `<form><svg></form>` | 1 | 11 | 10 | 17 |
| `<form><svg></form><svg></svg>` | 1 | | | 1 |
| `<form><math><mi><form>` | 1 | | 1 | |
| `<form><foreignObject><form><svg></foreignObject>` | 1 | 1 | | |
| `<math><ms><form><div></form>` | 1 | | | 1 |
| `<svg><desc><form><mglyph></form>` | 1 | | 1 | |
| `<template><td><svg></td>` | 3 | 1 | | |
| `<template><caption><svg></caption>` | 3 | 1 | | |
| `<template><caption><svg></table>` | 3 | | 1 | 1 |
| `<template><tr><svg></table>` | 3 | | 1 | |
| `<template><tr><math></table>` | 3 | | 1 | |
| `<table><template><svg></table>` | 3 | | | 1 |
| `<template><td><select><caption><math>` | 3 and 7 | | | 1 |
| `<template><caption><math><mn><caption>` | 3 and 7 | | | 1 |
| `<table><select><caption><svg>` | 7 | | 3 | 1 |
| `<table><select><td><svg>` | 7 | | | 2 |
| `<table><select><tr><svg>` | 7 | 1 | | |
| `<table><select><tr><math>` | 7 | 1 | | |
| `<table><select><table><math>` | 7 | | 1 | |
| `<table><select></table><svg>` | 7 | | | 1 |
| `<table><svg><foreignObject><form>` | 7 | 1 | | |
| `<table><svg><desc><form>` | 7 | | 1 | |
| `<table><math><mn><form>` | 7 | | 1 | |
| `<table><nobr><table><svg></nobr>` | 7 | | 1 | |
| `<svg><foreignObject><nobr><nobr></nobr>` | 8 | 1 | | |
| `<nobr><mtext><nobr><math></mtext>` | 8 | | 1 | |
| `<math><mtext><b><noscript></b>` | 9 | | 1 | |

The marker is `<![CDATA[ > <!-- a1 --> ]]>`, and in every row the scanner and gumbo disagree on whether `a1` is a comment.
