# Performance

The measurement scripts record the scanner's cost without the GitHub oracle: `pnpm size` for the bundle, `pnpm bench:time` for the corpus and fixed synthetic workloads, `pnpm bench:ab` for two implementations in one process, and `pnpm bench:profile` for CPU and allocation. `pnpm bench` remains the correctness-graded benchmark in [bench/index.ts](../../bench/index.ts) that compares scanners against cmark-gfm and still needs `pnpm oracle:build`.

In the [baseline](#baseline-2026-11-17) of 2026-11-17, the scanner takes 12.80 ms median (11.65 ms minimum) for the 1,882,743-character corpus, 6.80 ns per character, and the bundle is 63,249 bytes minified and 25,631 bytes gzip. Later size and speed changes compare against these numbers.

## Scripts

| Command | Measured | Code |
| --- | --- | --- |
| `pnpm size` | Minified and gzip bytes of a bundled `src/index.ts` built with pkgroll's esbuild minify options, and bytes per module from the metafile | [bench/size/index.ts](../../bench/size/index.ts), [bench/size/bundle.ts](../../bench/size/bundle.ts) |
| `pnpm bench:time [--rounds=100]` | Median and minimum wall time for the corpus and each synthetic workload | [bench/timing.ts](../../bench/timing.ts), [bench/inputs/corpus.ts](../../bench/inputs/corpus.ts), [bench/inputs/workloads.ts](../../bench/inputs/workloads.ts) |
| `pnpm bench:ab -- <base> <candidate> [--rounds=300] [--warmup=10]` | Paired median time and median per-round ratio for two git refs or directories | [bench/ab.ts](../../bench/ab.ts) |
| `pnpm bench:profile [--cpu-passes=50] [--heap-passes=20]` | CPU self time by source module and allocated bytes by function | [bench/profile.ts](../../bench/profile.ts) |

`esbuild` is a direct devDependency at `^0.28.2`; the lockfile resolves `esbuild 0.28.2`, the version pkgroll resolved when this baseline was recorded, and [bench/size/bundle.ts](../../bench/size/bundle.ts) imports it normally.

The size budget lives in [bench/size/budget.ts](../../bench/size/budget.ts) and [tests/specs/size.ts](../../tests/specs/size.ts) enforces it in `pnpm test`. The budget is the 2026-11-17 measurement after the [implicit close fix](./html-tokenizer.md#github-html-handling), 51,294 bytes minified and 19,969 bytes gzip, plus about 2%: 52,320 and 20,370 bytes. The integration point fix set it at 49,575 and 19,310 bytes, and the [cleanup](#cleanup-2026-11-17) at 48,455 and 18,897 bytes. The [baseline](#baseline-2026-11-17) below keeps the budget it was recorded with.

The corpus is every `.md` file under `node_modules/.pnpm/` that contains `<!--`, deduplicated by content and read in path order, as [bench/index.ts](../../bench/index.ts) does. At this lockfile it is 128 files, 1,882,743 characters, and 264 comments. It changes with `pnpm-lock.yaml`, so the sizes below move when dependencies do.

The synthetic workloads in [bench/inputs/workloads.ts](../../bench/inputs/workloads.ts) are built from explicit repetition counts, with no randomness and no lockfile input. They isolate one construct each:

| Workload | Construct | Characters | Comments |
| --- | --- | ---: | ---: |
| `comment-dense` | Inline and block comments in alternating paragraphs | 134,670 | 3,000 |
| `blockquote-list` | Nested blockquotes and lists with markers | 81,959 | 1,600 |
| `tables` | One wide aligned table with a comment in every cell | 121,956 | 4,200 |
| `inline-links` | Inline links, images, angle autolinks, bare URLs, and references | 70,856 | 500 |
| `html-blocks` | HTML blocks with attributes, details, and SVG CDATA | 76,248 | 1,200 |
| `adversarial-nesting` | Unmatched delimiters, open brackets, nested SVG, and open attributes | 35,063 | 2 |
| `long-plain-text` | Prose with no Markdown constructs except a few comments | 358,112 | 9 |

## Baseline (2026-11-17)

The module paths in this section are from before the [src/ reorganization](#reorganization-2026-11-17), as the tools printed them then.

Environment:

- Date: `date '+%a %b %-d %R %Z %Y'` printed `Tue Nov 17 08:28 JST 2026` (`2026-11-16T23:28Z`).
- Machine: Apple M2 Max, `Darwin 27.0.0` from `uname -sr`, macOS 27.0.1 from `sw_vers -productVersion`.
- Runtime: Node.js `v26.13.0`, V8 `14.6.202.34-node.40`.
- Scanner source: `develop` on 2026-11-17, before the [cleanup](#cleanup-2026-11-17). The harness files were uncommitted when these measurements ran.
- Load average: `9.26 9.80 9.40` when `pnpm bench:time` started and `9.42 10.04 9.55` when the 300-round `pnpm bench:ab` run started. The machine was busy, so absolute times include scheduling noise.

Three `pnpm bench:time` runs in this session gave corpus medians of 12.40, 12.45, and 12.80 ms, with minima of 11.65 to 11.74 ms. Treat differences under about 5% at this load as noise. Paired measurements from `pnpm bench:ab` are the reliable signal for a change.

### Bundle size

```sh
pnpm size
```

```text
esbuild 0.28.2, 23 modules
minified 63,249 bytes (61.8 KiB)
gzip     25,631 bytes (25.0 KiB)
per module, bytes in the minified bundle:
   17,943  src/scan-comments/entities.ts
    7,696  src/scan-comments/block/index.ts
    7,046  src/scan-comments/inline-lexer.ts
    6,266  src/scan-comments/html-tokenizer.ts
    4,744  src/scan-comments/index.ts
    3,197  src/scan-comments/block/reference-definition.ts
    2,298  src/scan-comments/unicode.ts
    1,910  src/scan-comments/emphasis.ts
    1,561  src/scan-comments/block/block-starts.ts
    1,433  src/scan-comments/footnotes.ts
    1,406  src/scan-comments/html-tag.ts
    1,357  src/scan-comments/block/html-block.ts
    1,288  src/scan-comments/bare-autolink.ts
    1,220  src/scan-comments/reference-budget.ts
      824  src/scan-comments/link-markup.ts
      797  src/scan-comments/block/table.ts
      561  src/scan-comments/generated-block.ts
      527  src/scan-comments/escape.ts
      391  src/scan-comments/text.ts
      341  src/scan-comments/block-filter.ts
      151  src/index.ts
       95  src/scan-comments/utils/forward-search.ts
       88  src/scan-comments/block/line.ts
```

| Metric | Measured | Budget then | Headroom |
| --- | ---: | ---: | ---: |
| Minified | 63,249 bytes | 64,514 bytes | 1,265 bytes (2.0%) |
| Gzip | 25,631 bytes | 26,144 bytes | 513 bytes (2.0%) |

`pnpm build` produced a minified `dist/index.mjs` of 63,887 bytes and 25,803 bytes gzip on the same machine, so the proxy measures 638 bytes (1.0%) less minified and 172 bytes (0.7%) less gzip than the published file.

The entity table is 17,943 bytes, 28.4% of the minified bundle. The next largest modules are `block/index.ts` (7,696 bytes), the inline lexer (7,046), and the HTML tokenizer (6,266).

### Corpus timing

```sh
pnpm bench:time
```

```text
date 2026-11-16T23:29:32.111Z
node v26.13.0, Apple M2 Max, darwin 27.0.0
commit <sha>, load average 9.26 9.80 9.40
corpus 128 files, 1,882,743 characters, 264 comments
rounds 100, warmup at least 250 ms per input

input                           chars       median         min     ns/char   comments
corpus                      1,882,743     12.80 ms    11.65 ms  6.80 ns/char        264
comment-dense                 134,670      1.80 ms     1.67 ms  13.39 ns/char      3,000
blockquote-list                81,959      2.07 ms     1.94 ms  25.30 ns/char      1,600
tables                        121,956      3.46 ms     3.19 ms  28.40 ns/char      4,200
inline-links                   70,856      0.76 ms     0.73 ms  10.80 ns/char        500
html-blocks                    76,248      2.19 ms     2.03 ms  28.76 ns/char      1,200
adversarial-nesting            35,063      1.07 ms     0.94 ms  30.49 ns/char          2
long-plain-text               358,112      0.26 ms     0.25 ms  0.73 ns/char          9
```

The script scans corpus documents one call at a time, as a consumer reads files. Each input is warmed up for at least 250 ms, then timed for 100 rounds; the table reports the median round and the fastest round. The corpus workload is about 12.8 ms, so a 1% change is about 0.13 ms, well above the timer resolution but close to the run-to-run noise under this load. The synthetic workloads are 0.26 to 3.46 ms, and their ratios are correspondingly noisier.

`long-plain-text` is much cheaper per character than the others because it contains almost no markup for the scanner to classify, and the nine comments are far apart. It is a baseline for the cost of reading prose, not for comment scanning.

### Allocation

```sh
pnpm bench:profile
```

```text
allocation, 20 corpus passes, 370.14 MB sampled, 264 comments, 1 KiB sampling interval
18.51 MB allocated per pass
 65.5%  242.44 MB  processLine  src/scan-comments/block/index.ts:495
  4.6%   16.94 MB  lexInline  src/scan-comments/inline-lexer.ts:331
  4.1%   15.08 MB  openBlock  src/scan-comments/block/index.ts:640
  2.5%    9.27 MB  countDefinitionLines  src/scan-comments/block/reference-definition.ts:320
  2.3%    8.65 MB  scanDocument  src/scan-comments/index.ts:119
  1.9%    6.95 MB  flushSpans  src/scan-comments/inline-lexer.ts:635
  1.7%    6.46 MB  processElement  src/scan-comments/html-tokenizer.ts:295
  1.7%    6.45 MB  createHtmlTokenizer  src/scan-comments/html-tokenizer.ts:107
  1.6%    5.79 MB  process  src/scan-comments/emphasis.ts:97
  1.4%    5.15 MB  reportCells  src/scan-comments/block/index.ts:390
  1.1%    4.12 MB  set
  1.0%    3.87 MB  Map
  1.0%    3.62 MB  repeat
  0.9%    3.32 MB  finalizeLeaf  src/scan-comments/block/index.ts:344
  0.9%    3.31 MB  readTableRow  src/scan-comments/block/table.ts:37
  0.9%    3.21 MB  pushBracket  src/scan-comments/inline-lexer.ts:556
  0.8%    3.08 MB  joinText  src/scan-comments/text.ts:2
  0.8%    2.97 MB  push  src/scan-comments/emphasis.ts:28
  0.7%    2.60 MB  lexText  src/scan-comments/index.ts:209
  0.7%    2.46 MB  generated  src/scan-comments/index.ts:390
```

Allocation is sampled by `HeapProfiler` at a 1 KiB interval, with objects collected by minor and major GC kept in the profile. The totals are allocations over 20 passes, not retained heap. `processLine` alone allocates 12.12 MB per pass, 65.5% of the total. This run is the baseline for later comparisons.

### CPU self time

The same `pnpm bench:profile` run reports CPU self time for 50 corpus passes:

```text
CPU self time, 50 corpus passes, 832.66 ms, 264 comments, 100 us sampling
 43.4%   361.04 ms  src/scan-comments/block/index.ts
  8.5%    70.86 ms  src/scan-comments/utils/forward-search.ts
  7.9%    65.88 ms  src/scan-comments/index.ts
  6.8%    56.76 ms  src/scan-comments/block/reference-definition.ts
  6.8%    56.44 ms  src/scan-comments/html-tokenizer.ts
  5.6%    47.02 ms  src/scan-comments/block/line.ts
  4.1%    34.35 ms  src/scan-comments/inline-lexer.ts
  4.1%    34.22 ms  (node builtins)
  2.9%    23.97 ms  src/scan-comments/block/table.ts
  2.5%    21.16 ms  (garbage collector)
  2.4%    19.96 ms  src/scan-comments/block/block-starts.ts
  1.3%    10.89 ms  src/scan-comments/reference-budget.ts
  1.0%     8.12 ms  src/scan-comments/block/html-block.ts
  0.7%     5.63 ms  src/scan-comments/emphasis.ts
  0.7%     5.55 ms  src/scan-comments/html-tag.ts
  0.4%     3.48 ms  (program)
  0.4%     3.26 ms  src/scan-comments/block-filter.ts
  0.2%     1.68 ms  src/scan-comments/text.ts
  0.1%     0.54 ms  src/index.ts
  0.1%     0.49 ms  bench/profile.ts
  0.1%     0.48 ms  src/scan-comments/footnotes.ts
  0.0%     0.37 ms  src/scan-comments/bare-autolink.ts
  0.0%     0.32 ms  bench/corpus.ts
  0.0%     0.15 ms  dispatch
```

The block phase is `block/index.ts` plus `block/line.ts`, `block/table.ts`, `block/reference-definition.ts`, `block/block-starts.ts`, and `block/html-block.ts`: 62.1% together. Forward searches are 8.5%, the replay in `scan-comments/index.ts` is 7.9%, the HTML tokenizer is 6.8%, and the inline lexer is 4.1%. Run the command before and after a change to compare the same module rows; the block phase and forward searches are the largest targets.

CPU samples are 100 us apart, so 50 passes produce about 8,300 samples and each percentage point is about 83 samples. Allocation and CPU percentages are statistical; a single module's share can move by a point or two between runs.

## Cleanup (2026-11-17)

The module paths in this section are from before the [src/ reorganization](#reorganization-2026-11-17), as the tools printed them after the cleanup.

The scanner dropped its comment-visitor layer, merged its duplicate link-target type, moved its ASCII and surrogate helpers into `src/scan-comments/utils/`, gave `cmark_clean_url` one walker for text and byte counts, and kept only the 49 entity names whose first decoded byte is ASCII. `pnpm size` on the `audit-cleanup` worktree, whose base was `develop` on 2026-11-17, shortly after the baseline:

```text
esbuild 0.28.2, 25 modules
minified 47,504 bytes (46.4 KiB)
gzip     18,526 bytes (18.1 KiB)
per module, bytes in the minified bundle:
    7,718  src/scan-comments/block/index.ts
    7,005  src/scan-comments/inline-lexer.ts
    6,392  src/scan-comments/html-tokenizer.ts
    4,656  src/scan-comments/index.ts
    3,106  src/scan-comments/block/reference-definition.ts
    2,298  src/scan-comments/unicode.ts
    2,065  src/scan-comments/entities.ts
    1,865  src/scan-comments/emphasis.ts
    1,561  src/scan-comments/block/block-starts.ts
    1,479  src/scan-comments/footnotes.ts
    1,406  src/scan-comments/html-tag.ts
    1,350  src/scan-comments/block/html-block.ts
    1,288  src/scan-comments/bare-autolink.ts
    1,183  src/scan-comments/link-markup.ts
      970  src/scan-comments/reference-budget.ts
      797  src/scan-comments/block/table.ts
      561  src/scan-comments/generated-block.ts
      527  src/scan-comments/escape.ts
      391  src/scan-comments/text.ts
      341  src/scan-comments/block-filter.ts
      137  src/scan-comments/utils/surrogate.ts
       95  src/scan-comments/utils/forward-search.ts
       88  src/scan-comments/block/line.ts
       82  src/scan-comments/utils/ascii.ts
       34  src/index.ts
```

The same command on that base measured 63,286 bytes minified and 25,648 bytes gzip. The cleanup removes 15,782 bytes (24.9%) minified and 7,122 bytes (27.8%) gzip from that measurement.

| Step | Minified | Gzip |
| --- | ---: | ---: |
| Base `develop` | 63,286 | 25,648 |
| Entity table trim | 47,593 | 18,603 |
| Visitor layer removal | 47,617 | 18,572 |
| Duplicate and helper removal | 47,616 | 18,563 |
| Walker callback restructure | 47,627 | 18,574 |
| Shared entity scan and unit | 47,504 | 18,526 |

The entity table is 2,065 bytes, 4.3% of the minified bundle, down from 17,943 bytes, 28.4%. The two new utility modules together are 219 bytes. Moving comment construction into `html-tokenizer.ts` grows it from 6,266 to 6,392 bytes, while `src/index.ts` falls from 156 to 34 and `scan-comments/index.ts` from 4,754 to 4,656. The unified URL cleaner grows `link-markup.ts` from 824 to 1,183 bytes and shrinks `reference-budget.ts` from 1,220 to 970.

`SIZE_BUDGET` is now 48,455 bytes minified and 18,897 bytes gzip, the 47,504 and 18,526 measurement plus 2.0%.

Fourteen `pnpm bench:ab -- develop .` runs compared all 135 inputs with 0 differences: eleven at 300 rounds and three at 1,000 rounds. Corpus ratios were 0.998, 1.000, 1.001, 1.002, 1.002, 1.003, 1.003, 1.003, 1.003, 1.004, 1.006, 1.008, 1.008, and 1.024. The 1.024 run also slowed every synthetic workload, up to 1.529, which marks it as a system-wide slowdown; two repeats measured corpus 1.004 and 1.002, with synthetic 0.962 to 1.030. Outside that run, the synthetic ratios moved in both directions from 0.830 to 1.036, because a 1 to 3 ms workload has fewer samples per round; the latest 1,000-round run put them at 0.987 to 1.017, with `html-blocks` the highest (1.017) and `inline-links` at 0.997. The corpus is unchanged within the noise floor, and no construct shows a repeatable regression larger than that floor.

## Speed (2026-11-17)

Three changes to the scanner, measured on a branch against `develop` after the [cleanup](#cleanup-2026-11-17). Each `pnpm bench:ab -- develop . --rounds=300` run compared all 135 inputs with 0 differences. The machine load averaged 5 to 9, so each change has at least two runs.

At baseline, `pnpm bench:time` gave a corpus median of 12.13 ms (11.64 ms minimum, 6.44 ns per character), and `pnpm bench:profile` gave 18.40 MB allocated per pass, of which `processLine` allocated 12.14 MB (66.0%).

| Change | Corpus ratio | Allocation per pass |
| --- | ---: | ---: |
| Hoisted line closures | 0.973, 0.971 | 8.40 MB |
| First-character guards | 0.955, 0.948 | not measured alone |
| Early stop after the last `<!--` | 0.818, 0.820 | 7.27 MB |

**Hoisted line closures.** `processLine` created `closeUnmatched`, `addChild`, and `openBlock` on every line. The three now live in `lexBlocks` scope and read line state that `processLine` assigns. This removed the three function allocations and their per-line context. `pnpm bench:profile` after the change reported 8.40 MB per pass, and `processLine` fell from 242.75 MB to 41.71 MB over 20 passes (12.14 to 2.09 MB per pass). The ratios above are the two 300-round runs. Kept.

**First-character guards.** Every block-start scanner rejected on the first character, but only after a call and a bounds-checked read. `openBlock` now checks the first character it already holds before calling the ATX heading, open fence, HTML block, setext heading, thematic break, and list marker scanners. The footnote scanner already had a `[` check. With the hoisted closures in place, the two runs measured 0.955 and 0.948, about 2% beyond the hoisting ratios. Kept.

**Early stop after the last `<!--`.** No later line can start a comment once the block phase passes the last opener, so `lexBlocks` stops there when nothing pending can change a comment already found: no replay buffer or deferred reference lookup, no footnote definition seen, the tokenizer in the data state, and no open paragraph or heading that began at or before the opener. The loop reads one line per `processLine` call, including a final line without a line ending, and a stop breaks out before the rest of the source. The conditions and their soundness argument are in [linear-time.md](./linear-time.md#early-stop-after-the-last-comment-opener-2026-11-17), and the boundary cases are in [early-exit.ts](../../tests/specs/rendering/early-exit.ts). With all three changes, two clean 300-round runs measured 0.818 and 0.820, within noise of the earlier 0.819 and 0.812; a third run measured 0.831 while inflating every small synthetic workload. Kept.

The final `pnpm bench:time` run at load average 7.22 measured 10.17 ms median (9.38 ms minimum, 5.40 ns per character), down from 12.13 ms median and 11.64 ms minimum. It ran at a lower load than the baseline, so the paired 0.82 ratio is the reliable number. Final allocation is 7.27 MB per pass, with 34.60 MB in `processLine` over 20 passes (1.73 MB per pass), 60.5% below the baseline total. `pnpm size` measures 47,922 bytes minified and 18,664 bytes gzip, within the 48,455 and 18,897 budget.

## Reorganization (2026-11-17)

The scanner moved from `src/scan-comments/` into one directory per phase under `src/`, and `scanComments` became the public `findComments`. CONTRIBUTING.md maps each directory to the cmark-gfm file it ports. The moved function bodies are unchanged. Two closures got a factory so that their state could move with them: `createElementStack` in `html/elements.ts` and `createRawHtmlMatcher` in `inline/raw-html.ts`. `pnpm size` in the `audit-reorg` worktree, whose base was `develop` after the [speed changes](#speed-2026-11-17):

```text
esbuild 0.28.2, 30 modules
minified 48,075 bytes (46.9 KiB)
gzip     18,686 bytes (18.2 KiB)
per module, bytes in the minified bundle:
    8,041  src/block/index.ts
    4,778  src/index.ts
    4,632  src/html/tokenizer.ts
    4,088  src/inline/index.ts
    2,297  src/utils/unicode.ts
    2,064  src/render/entities.ts
    1,953  src/inline/links.ts
    1,873  src/html/elements.ts
    1,865  src/inline/emphasis.ts
    1,560  src/block/block-starts.ts
    1,417  src/references/definition.ts
    1,348  src/references/label.ts
    1,348  src/block/html-block.ts
    1,284  src/inline/bare-autolink.ts
    1,181  src/render/link.ts
    1,141  src/html/tag.ts
    1,026  src/inline/raw-html.ts
      970  src/budget.ts
      826  src/render/footnote.ts
      797  src/block/table.ts
      656  src/inline/footnote-reference.ts
      560  src/render/code-block.ts
      534  src/utils/ascii.ts
      527  src/render/escape.ts
      391  src/inline/text.ts
      341  src/block/filter.ts
      148  src/utils/utf8.ts
      137  src/utils/surrogate.ts
       95  src/utils/forward-search.ts
       88  src/block/line.ts
```

That is 153 bytes minified and 22 bytes gzip above the 47,922 and 18,664 bytes after the speed changes. The two factories add their wrapper code and about 45 bytes of names that `keepNames` keeps for them, and `isDigit` becomes the 5 bytes longer `isAsciiDigit`. The rest was not attributed. One `pnpm bench:ab -- develop . --rounds=300` run compared all 135 inputs with 0 differences, at load average 17.77. The corpus ratio was 1.000, and the synthetic ratios were 0.975 to 0.999.

## Comparing two versions

`pnpm bench:ab` accepts two git refs, two directories that contain `src/index.ts`, or one of each. It exports `src/` from a ref into a temporary directory, bundles each side with esbuild, imports both bundles in one process, and checks that they report the same comments on every input. It then warms up both sides and measures them in alternating order for each round, so a slow drift in machine load affects both sides.

```sh
# In the candidate worktree
pnpm bench:ab -- develop .

# From anywhere, with a path to the candidate worktree
pnpm bench:ab -- develop ../gfm-comments-candidate
```

A run with the same scanner on both sides, 300 rounds:

```text
base develop (<sha>), candidate . (directory)
rounds 300, warmup 10 rounds, alternating which side runs first
outputs: base 10,775 comments, candidate 10,775 comments, 0 of 135 inputs differ

input                           chars    base median  candidate median     ratio
corpus                      1,882,743       12.30 ms       12.24 ms     0.996
comment-dense                 134,670        1.71 ms        1.72 ms     1.000
blockquote-list                81,959        1.99 ms        2.00 ms     1.002
tables                        121,956        3.42 ms        3.46 ms     1.011
inline-links                   70,856        0.82 ms        0.82 ms     0.997
html-blocks                    76,248        2.15 ms        2.13 ms     1.000
adversarial-nesting            35,063        1.01 ms        1.02 ms     1.004
long-plain-text               358,112        0.26 ms        0.26 ms     1.001
```

The ratio is the candidate time divided by the base time per round; below 1 means the candidate is faster. The corpus ratio of 0.996 and the 0.997 to 1.011 range on the synthetic workloads show a noise floor close to 1% when both sides are identical. A 2 ms workload has fewer samples per round than the corpus, so repeat the run before trusting a small difference on one. The corpus is the headline number because its rounds are long enough for the noise to average out; the small workloads are useful for finding a construct-specific regression, not for claiming a 2% win on their own.

`outputs` compares every comment's field values in declaration order on all 128 corpus documents and the 7 synthetic sources. It does not depend on the field names, so a branch that renames `startsLine` to `onCommentLine` still compares against `develop`; the rename must keep the declaration order. A nonzero difference is a behavior change, not a performance win; the timing still runs so an intentional change can be measured, but record the difference with the measurement.

The bundles are built by esbuild from source, not by pkgroll, so absolute `bench:ab` times differ slightly from `bench:time`. Both sides get the same treatment, so the ratio is valid. Use `pnpm bench:time` for the absolute baseline and `pnpm bench:ab` for a before/after decision.

## Maintaining the budget

After a change that affects the bundle, run `pnpm size`, then set both numbers in [bench/size/budget.ts](../../bench/size/budget.ts) to the new measurement plus about 2%, rounded up. Keep them as plain numbers with the measurement date in the comment so the next change knows where the budget came from. `pnpm test` fails when either size exceeds its budget.

An esbuild update can change minifier output by a small amount without a source change. Renovate updates the direct dependency; re-measure after such an update before treating a failure as a regression.

## Caveats

- The corpus depends on `pnpm-lock.yaml`; the synthetic workloads do not. A dependency update can change corpus size, comments, and timing without a scanner change.
- The absolute times are wall-clock times from a machine with other work running. Use the minimum for a lower bound and paired runs for a comparison.
- The profiler and heap sampler add overhead and sample rather than count every event. The module percentages and per-function allocations are for finding hot spots and ranking changes, not for byte-exact accounting.
- Allocation totals include objects that GC collected during the profile, which is what "allocated per pass" means here. They are not retained heap and do not predict peak RSS.
- `pnpm bench`, the oracle-graded benchmark, is unchanged and still requires `pnpm oracle:build`. The new scripts do not build or call the oracle.
