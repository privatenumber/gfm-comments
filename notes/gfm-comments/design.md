# Scanner design

The scanner answers one question: which HTML comments does GitHub render, and where are they in the source? It ports the parts of GitHub's renderer that decide where raw HTML can appear, then reads that HTML as a browser would. It builds no syntax tree. The [folder README](./README.md) indexes the topics; this file covers the target, the phases, and the invariants that span them.

## Target: GitHub, not CommonMark

**Decision: match GitHub's rendering.** Documents with comments that tools read, such as comment-mark markers, are mostly READMEs on GitHub, so what counts is a comment there. The target is cmark-gfm 0.29.0.gfm.13, the latest release on 2026-11-13, with the extensions GitHub enables: table, strikethrough, autolink, tagfilter, and tasklist, and with the footnote option. GitHub then parses and sanitizes the output, in the way [GitHub HTML handling](./html-tokenizer.md#github-html-handling) describes. A comment is every comment node that parsing builds from a `<!--` in the source, including the ones that end at a parse error.

GitHub differs from CommonMark 0.31.2 (and so from micromark) in ways that change which comments render. The HTML block tag lists differ: cmark-gfm has `source` and not `search` ([`scanners.re`](https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/scanners.re#L40)). Type 4 blocks (`<!X`) need an uppercase letter, while `<![cdata[` is case-insensitive. The tagfilter extension escapes the `<` of `<title>`, `<script>`, and seven other tags, so their contents are ordinary HTML instead of raw text ([`tagfilter.c`](https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/extensions/tagfilter.c)).

## Design: three phases

[src/index.ts](../../src/index.ts) runs three phases. The block phase reads the source once, or twice when the [reference budget](./reference-budget.md#reference-expansion-budget) needs it, and the inline and browser phases read the blocks it reports, in source order. A document without `<!--` holds no comment, so the scan returns before any phase runs. Each phase is a directory under `src/`, which CONTRIBUTING.md maps to the cmark-gfm files it ports. `src/index.ts` is the only public entry; tests and oracle scripts may import a phase directly:

1. [Block phase](./block-phase.md): the containers, leaf blocks, definitions, and footnote definitions.
2. [Inline phase](./inline-and-links.md): raw HTML spans, escapes, code spans, links, images, autolinks, and emphasis.
3. [Browser phase](./html-tokenizer.md): the HTML tokenizer, the element stack, comment closers, and the line-start flag.

**Why three phases.** The previous scanner mixed block and inline rules line by line. Every rule that spans lines needed its own state: paragraph extent, code spans that wrap lines, HTML blocks, table cells. Each fix added a case, and each case was a new place to disagree with GitHub. Following the renderer's own structure makes each rule a port of a cited function, so a disagreement points to one function.

**Why no tree.** Comments need only the open containers and the current leaf. A tree costs memory per node and a second walk, and the scanner must stay linear on adversarial input. The phases call each other through callbacks. Most of what they keep is bounded by the current leaf block: the line ranges of the open paragraph, its joined text, its backtick runs, and its brackets. Five things grow with the document: the reference definitions, the buffered block events once a lookup can need labels, the events of footnote definitions and the comments found after the first one, the stack of open elements and its name index when the source has `<svg` or `<math`, and, on the [budget's](./reference-budget.md#reference-expansion-budget) slow path, the failed lookups in blocks that replay lexes.

## Scanner invariants

- **Tabs.** A tab advances to the next multiple of four columns but is one source character. The block phase tracks a partially consumed tab, as cmark-gfm does, so list padding and indented code read the same columns GitHub reads.
- **Limits and NUL.** cmark-gfm's limits apply as it counts them: 80 backticks per code span, 255 for a stored fence length, and 1,000 UTF-8 bytes per reference label. cmark-gfm reads NUL as U+FFFD, so NUL does not end an autolink, counts as 3 bytes in a label, and matches U+FFFD in another label. A lone surrogate reads as U+FFFD too, as UTF-8 encoding writes it.
- **Escapes.** A backslash escape stops `\<` from opening raw HTML and stops a backtick from opening a code span. Inside a code span, backslashes are literal.
- **Local state.** Scan state lives in each call, so a nested scan cannot disturb an outer one. [eslint.config.ts](../../eslint.config.ts) bans regular expressions in `src/`, so scans stay index-based, and turns off `unicorn/prefer-code-point` in `src/`, because the lexers compare UTF-16 code units with ASCII codes and rely on `charCodeAt` returning `NaN` past the end.
- **Linearity.** The rules that keep each phase linear on adversarial input are in [linear-time.md](./linear-time.md#scanner-invariants).
