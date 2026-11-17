# gfm-comments

A super fast scanner that finds the HTML comments in GitHub Flavored Markdown, matching what GitHub renders

## Why?

Markdown has syntax rules, and not every `<!--` starts a comment. In a code block, a code span, or a link URL, GitHub shows it as text. `findComments` returns only the comments that GitHub renders, with offsets you can use to read or edit the source.

### Why not a regular expression?

A regular expression sees characters, not Markdown. A `<!--` starts a comment only where Markdown allows raw HTML, so the same characters can be a comment in one place and text in another. A regular expression matches the comment in each of these sources, but GitHub renders none of them as a comment:

````md
```md
<!-- a fenced code block -->
```

    <!-- an indented code block -->

\<!-- escaped -->

[link](<!-- a link destination -->)

![<!-- image alt text -->](image.png)

<span title="<!-- an attribute value -->">text</span>
````

It can also start in the wrong place. Here, a match starts at the `<!--` in the code span and runs to the end of the real comment:

```md
Type `<!--` to start a comment. <!-- a -->
```

`findComments` returns only `<!-- a -->`.

### Why not a Markdown parser?

A Markdown parser knows code from HTML, but it gives raw HTML back as plain text. Whether a `<!--` inside that HTML starts a comment, as in the attribute value above, is decided later, when the browser parses the rendered page. To get the answer from a parser, you must render the whole document to HTML and parse the HTML. That is slow, and the HTML has no positions in the Markdown source, so you can't use them to edit the file.

gfm-comments gets the same answer without rendering the page or building a syntax tree. It follows GitHub's Markdown renderer, [cmark-gfm 0.29.0.gfm.13](https://github.com/github/cmark-gfm/tree/0.29.0.gfm.13), and the way the browser parses the HTML. It scans the source in time that grows linearly with the document and keeps positions in the source. The [design principles](./CONTRIBUTING.md#principles) explain how these choices trade off.

## Usage

### Install

```sh
npm i gfm-comments
```

### Example

```ts
import { findComments } from 'gfm-comments'

const markdown = `Text <!-- a comment -->

Type \`<!--\` to start a comment.

\`\`\`html
<!-- in a code block -->
\`\`\`
`

for (const comment of findComments(markdown)) {
    console.log(comment.start, comment.end, markdown.slice(comment.start, comment.end))
}
// 5 23 <!-- a comment -->
```

Each comment also has the range of its text, without `<!--` and `-->`, a `nextLinePrefix` that keeps a following line in the same containers, and `onCommentLine`, which says whether it is on an HTML block line that starts with a comment. The prefix is an editing aid, not a rendering fact: it is built from the comment's containers to write at the start of a new line, not copied from the document. See the [Node.js API](./docs/node.md).

### Use cases

HTML comments are hidden when GitHub renders Markdown, so tools use them to store data in a file that still reads normally:

- [comment-mark](https://github.com/privatenumber/comment-mark) updates sections of a README between marker comments, such as `<!-- contributors -->` and `<!-- /contributors -->`.
- [mdeval](https://github.com/privatenumber/mdeval) runs JavaScript written in comments and writes the results into the file.

## Accuracy and speed

`findComments` is fast because it:

- scans the source in order without building a syntax tree or rendering HTML, and reads the blocks a second time only when the document has footnote definitions or its references can reach GitHub's expansion limit
- returns at once when the source has no `<!--`, and skips detailed inline parsing in text without a `<`, because raw HTML always starts with `<`
- runs in time that grows linearly with the size of the document, which tests check on inputs built to be slow

### Benchmark

Each approach is checked against GitHub's renderer, cmark-gfm, with the HTML parsed as a browser does.

| Approach | Real files: wrong comments | Edge cases: documents correct | Time for the real files | Source positions |
| --- | --- | --- | --- | --- |
| Regular expression `/<!--[\s\S]*?-->/g` | 15 | 84.2% | 0.37 ms | Yes |
| `findComments` | 0 | 99.997% | 12.8 ms | Yes |
| [micromark](https://github.com/micromark/micromark) to HTML, then [parse5](https://github.com/inikulin/parse5) | 0 | 99.46% | 1,050 ms | No |

- **Real files** are the 128 Markdown files in this package's `node_modules` that contain `<!--`. GitHub renders 264 comments in them. The regular expression also finds 15 examples in fenced code blocks, spread across 6 files. Rendering and parsing finds the right comments, but it is about 80 times slower than `findComments`.
- **Edge cases** are 120,000 generated documents that mix comments with tables, links, reference definitions, autolinks, footnotes, code, and raw HTML. Real files rarely have these mixes, but each one changes which `<!--` is a comment.
  - `findComments` differs from cmark-gfm in 4 of them. All 4 are [footnote labels](./notes/gfm-comments/footnotes.md#footnotes) that this cmark-gfm version reads differently from GitHub. 3 of them were sent to GitHub, and GitHub agrees with `findComments` on each. The remaining [known gaps](./notes/gfm-comments/known-gaps.md#known-gaps) are rarer forms.
  - micromark follows the CommonMark specification rather than cmark-gfm's code, so it differs from GitHub's renderer in 644 documents, mostly around autolinks and raw HTML.
  - Documents with SVG and MathML are left out, because GitHub handles their HTML differently from the HTML standard, so a standard parser can't give the expected answer.

Measured on an Apple M2 Max with Node.js 26.13.0. Run the real files with `pnpm bench`, and the edge cases with `pnpm oracle:compare --approach <scanner|regex|micromark> --seed 7`, after building the renderer with `pnpm oracle:build`.

## Documentation

- [Node.js API](./docs/node.md): the `findComments` function and the fields of each comment
- [Agent skill](./skills/gfm-comments/SKILL.md): teaches coding agents how to use gfm-comments. pnpm links [agent skills](https://pnpm.io/agent-skills) into your project after you approve them.
