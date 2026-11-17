# Node.js API

## Requirements

Node.js 22 or later. The package is ESM and includes TypeScript types.

## Exports

### `findComments(source)`

```ts
declare const findComments: (source: string) => Comment[]
```

Returns the HTML comments that GitHub renders when it displays `source` as Markdown, sorted by `start`. The ranges never overlap: each comment's `start` is at or after the previous comment's `end`, so replacements applied from the last comment to the first keep the earlier offsets valid.

A `<!--` is skipped wherever GitHub shows it as text or code instead:

- in fenced and indented code blocks, and in code spans;
- in link and image destinations and titles, in image alt text, and in reference definitions;
- after a backslash, as in `\<!--`;
- inside a raw HTML tag or attribute value that is still open, or inside CDATA in SVG and MathML.

Every comment that the browser builds from GitHub's output is returned, including the HTML parse errors that still build one:

| Source | Comment |
| --- | --- |
| `<!-->` and `<!--->` | An empty comment |
| `<!-- a --!>` | Ends at `--!>`, as at `-->` |
| A comment with no `-->` or `--!>` after it, in an HTML block or left open by raw HTML such as `<![CDATA[ > <!-- ]]>` | Runs to the end of the document and hides the rest of the page on GitHub |
| A comment that GitHub closes only in other output, because GitHub moves each referenced footnote definition to the end of the page | Ends with no closer: at the end of the footnote definition it starts in, or at the start of the next footnote definition that GitHub moves. The moved text is never inside its range |

An inline `<!--` that cmark-gfm does not read as raw HTML, such as `text <!-- a` with no `-->`, is shown as text, so it is not returned. `source.slice(comment.contentEnd, comment.end)` gives the closer: `-->`, `--!>`, `>`, `->`, or an empty string. An empty closer means that GitHub does not close the comment within this stretch of source: it runs to the end of the document or of a footnote definition, or up to a footnote definition that GitHub moves.

Markers such as `<!-- name -->` usually need a comment that the author closed. Keep only comments closed by `-->`:

```ts
const markers = findComments(source).filter(comment => source.slice(comment.contentEnd, comment.end) === '-->')
```

Read the closer through `end`. `source.startsWith('-->', comment.contentEnd)` is not enough: a comment with an empty closer can stop right before a `-->` that is outside it, as in `[^1]: <!-- a\n\n-->`, where GitHub shows the `-->` as text.

To report a comment that hides the rest of the page or footnote, as a linter might, check for an empty closer instead: `comment.contentEnd === comment.end`.

The rules model GitHub's renderer, [cmark-gfm 0.29.0.gfm.13](https://github.com/github/cmark-gfm/tree/0.29.0.gfm.13) with GitHub's extensions, and GitHub's HTML handling, apart from the [known gaps](../notes/gfm-comments/known-gaps.md#known-gaps).

```ts
import { findComments } from 'gfm-comments'

findComments('> Text <!-- a -->')
// [
//   {
//     start: 7,
//     end: 17,
//     contentStart: 11,
//     contentEnd: 14,
//     nextLinePrefix: '> ',
//     onCommentLine: false
//   }
// ]
```

```ts
import { findComments } from 'gfm-comments'

findComments('1. <!-- a -->').map(comment => comment.nextLinePrefix)
// ['   ']
```

### `Comment`

```ts
type Comment = {
    start: number
    end: number
    contentStart: number
    contentEnd: number
    nextLinePrefix: string
    onCommentLine: boolean
}
```

Offsets are UTF-16 indexes into the source, as `String.prototype.slice()` uses them.

| Field | Description |
| --- | --- |
| `start` | Index of the opening `<!--` |
| `end` | Index just past the closer |
| `contentStart` | Index of the first character after `<!--` |
| `contentEnd` | Index just past the content, where the closer starts |
| `nextLinePrefix` | A prefix to write at the start of a following line so that the new line stays in the same containers, such as `> ` in a blockquote or spaces in a list item. `>Text <!-- a -->` gives `> `, and `1. <!-- a -->` gives three spaces. It is an editing aid, not a rendering fact: it is built from the comment's containers, not copied from the source line, so a list item gets spaces in place of its marker, and GitHub does not render it. It is an empty string outside containers. |
| `onCommentLine` | Whether the comment is on an HTML block line whose first content, after spaces and tabs, is a comment. Every comment on that line shares the value, and a line that starts inside a multiline comment inherits it from that comment. It is `false` for comments in a paragraph, heading, or table cell. |

`nextLinePrefix` is an editing aid, not a rendering fact: it is built from the containers for writing, not copied from the source. `onCommentLine` is a fact about where the comment starts in an HTML block.

```ts
import { findComments } from 'gfm-comments'

findComments('<!-- a --> <!-- b -->\n\n<div><!-- c -->').map(comment => comment.onCommentLine)
// [true, true, false]
```
