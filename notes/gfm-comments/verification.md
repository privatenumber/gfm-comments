# Verification

The scanner is checked against GitHub directly, against a local oracle that models GitHub, and against recorded GitHub probes. This file covers the oracle, its comparison rules, and the fuzz results. The performance evidence is in [linear-time.md](./linear-time.md#corpus-and-performance), and the case list for each construct is in `tests/specs/rendering/`.

## GitHub oracle

The primary check compares the scanner with a local stand-in for GitHub: cmark-gfm 0.29.0.gfm.13 built from source with GitHub's extensions, followed by parse5 8.1.1 as the browser. [github-oracle.md](./github-oracle.md) has the build recipe and scripts.

**Oracle validation.** The oracle's visible text matched GitHub's `/markdown` API (`mode=gfm`) on all 180 generated documents tried on 2026-11-13. GitHub's API output has no comment nodes to compare, so the check compares visible text: text that one side hides in a comment and the other shows is a difference. It cannot tell apart two comments that hide the same text with different boundaries.

**Comparison.** [compare.ts](./github-oracle.md#scripts) generates documents from fragments with a seeded random generator, and compares the comments each side finds. Each generated `<!--` gets a unique number, such as `<!-- a12 -->` or `<!--o12q`. A comment is identified by the number it starts with and the last marker number in it, so a match means the same opening and closing on both sides. Where a comment has no number, its first or last 3 characters are compared after both sides are normalized the same way, because a comment that spans chunks also holds generated markup in the oracle's output. Results on 20,000 documents per seed, on 2026-11-14. Each mismatch was checked with `show.ts` except where the table says it remains unclassified:

| Fragment set | Seed | Mismatches | Cause |
| --- | --- | --- | --- |
| `rich` | 1 | 2 | 1 normalization artifact (`<hr />`), 1 quote in generated markup (`<ol start="2">`) |
| `rich` | 2 | 0 | |
| `rich` | 99 | 5 | normalization artifacts |
| `rich` | 12345 | 3 | artifacts |
| `autolink` | 1, 2 | 0 | |
| `autolink` | 3 | 0 | |
| `links` | 1, 2, 99 | 0 | |
| `refs` | 1, 2, 99 | 0 | |
| `tables` | 1 | 29, then 0 | All also occurred at comment-mark `afdc279`, and none needed a table. Two patterns: a dropped definition that renders no markup, and the quotes in a resolved link's `<a href="…">`. Both were fixed on 2026-11-16; see [Link, image, and cell markup](./inline-and-links.md#link-image-and-cell-markup) |
| `tables` | 7, 11, 23 | 31, 31, 19, then 0, 0, 0 | Same causes as seed 1, plus aligned cells, images, and autolinks; fixed on 2026-11-16 |
| `foreign` | 1 | 16 | All 43 across both seeds have one shape: the document has `<![CDATA[`, and the scanner reports a strict subset of the oracle's comments. parse5 leaves SVG or MathML at an end tag or a breakout start tag, such as `</p>` or `<div>`, and reads the CDATA opener as a bogus comment. On 2026-11-15, after generated emphasis was modeled, all 43 documents were sent to GitHub `/markdown`, and in each one GitHub showed every disputed comment as escaped text, as the scanner predicts. These are oracle errors |
| `foreign` | 2 | 27 | Same shape and cause as seed 1; included in the 43 GitHub checks |
| `footnotes` | 7 | 5, then 4 | 3 oracle errors with `&Hat;` in a reference, where 0.29.0.gfm.13 copies the label past its text node and truncates its output; 1 label that GitHub ends at an inner inline and the oracle does not. The 5th, a quote in a resolved link's `<a href="…">`, was fixed on 2026-11-16. On 2026-11-16, GitHub `/markdown` agreed with the scanner on 3 of the 4 documents: fixtures `footnote-entity-caret-reference`, `footnote-self-referencing-definition`, and `footnote-label-ends-at-inline`. The 4th has the same `&Hat;` form |
| `footnotes` | 11 | 5, then 3 | 2 `&Hat;` oracle errors; 1 comparator artifact. The 2 quotes in a resolved link's `<a href="…">` were fixed on 2026-11-16. The artifact: the scanner's comment `<!--o1q\n\n[^a]: &Hat;&Hat;<!-- a3 -->\n<div>\n[^a]-->` has its true source range, which spans an unreferenced definition, so its last marker number differs from the oracle's rendered text |
| `footnotes` | 23 | 2 | Both have an inner reference in an outer one, such as `[^a[^a]]`. GitHub ends the outer label at the inner reference (probe 15), so the outer reference is defined and its definition renders. The oracle's column label is undefined, and it drops the inner reference, so no definition renders |
| `footnotes` | 101 | 3, then 2 | 2 inner references in an outer one, as in seed 23, here inside the definition that the outer one references: `[^a]: … [^a[^b]]` counts as a reference to `a` (probes 2 and 15). The 3rd, a quote in a resolved link's `<a href="…">`, was fixed on 2026-11-16 |
| `footnotes` | 202 | 2 | 1 inner reference in an outer one, as in seed 23 (`[^b[^a]…]`); 1 normalization artifact, same result on `develop`: the comment's source range holds `[r]: /u`, which renders nothing, so its last 3 characters differ |
| `footnotes` | 303 | 0 | |

A repeat on 2026-11-15 with `--github-pre-lang` used 20,000 documents for each of `autolink` seed 1, `rich` seed 1, `links` seed 1, `refs` seed 1, `tables` seed 1, and `foreign` seeds 1 and 2. It reproduced the respective mismatch counts of 0, 2, 0, 0, 29, 16, and 27, with no scanner errors. These mismatch counts include the known gaps and oracle limitations above; they do not mean every comparison passed.

**Footnotes (2026-11-16).** The oracle now enables `CMARK_OPT_FOOTNOTES`, as GitHub does. With it, on seeds 7, 11, and 23 with 20,000 documents each, `rich` gives 0, 4, and 1 mismatches, and `links`, `refs`, and `autolink` give 0, for both the scanner before footnotes and after. The `footnotes` rows above were each checked with `show.ts`, and none is a scanner bug. A comment with an empty closer that ends before the end of the document was [clipped at a definition](./footnotes.md#footnotes); the comparator gives it the kind `clip` and compares its opening only. A copy of the comparison script that also counts reported ranges that overlap or are out of order, which [compare.ts](./github-oracle.md#range-invariants) now does on every run, found 0 on every `footnotes` seed above and on seeds 7, 11, and 23 of the other sets, and 2 on `footnotes` seed 202 for the scanner before the clipping rule. Two oracle limits apply to that set. cmark-gfm 0.29.0.gfm.13's footnote labels differ from GitHub's, as [Footnotes](./footnotes.md#footnotes) explains. And like parse5, the oracle leaves SVG at the generated `<sup>` of a reference, so `x <svg> [^a] <![CDATA[ …` belongs to the `foreign` oracle-error class: GitHub keeps SVG open at breakout start tags.

**Link and cell markup (2026-11-16).** After [this change](./inline-and-links.md#link-image-and-cell-markup), on seeds 7, 11, and 23 with 20,000 documents each, `tables` gives 0, 0, and 0 mismatches (from 31, 31, and 19), and `footnotes` gives 4, 3, and 2 (from 5, 5, and 2). `rich` stays at 0, 4, and 1: on seed 11, 3 quotes in an `<ol start="2">` (a [known gap](./known-gaps.md#known-gaps)) and 1 normalization artifact (`<hr />`), and on seed 23, 1 normalization artifact. `links`, `refs`, and `autolink` stay at 0, and `foreign` stays at 19, 27, and 23. `tables` seed 1 goes from 29 to 0, `footnotes` seed 101 from 3 to 2, and seeds 202 and 303 stay at 2 and 0. On the 128 corpus files with `<!--`, every reported comment is the same as on `develop` before this change.

A mutant with `<…>` autolinks disabled gives 590 to 650 mismatches per `autolink` seed, so the fuzz detects autolink bugs. The `GitHub rendering` group in the [rendering tests](../../tests/specs/rendering/github-rendering.ts) locks one case per rule, each checked against the oracle.

**Generated inline events (2026-11-15).** A separate comparison checked the order of generated inline elements and raw HTML against cmark-gfm 0.29.0.gfm.13. It found zero mismatches in 40,000 generated emphasis documents and another 20,000 cases with reference links and images. This compares inline events, not the whole-document comment boundaries in the table above. The emphasis comparison also cross-checked sample batch output against the cmark-gfm CLI. The one-off comparison scripts are not part of the repository.
