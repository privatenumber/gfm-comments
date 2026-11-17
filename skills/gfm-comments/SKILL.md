---
name: gfm-comments
description: Find the HTML comments that GitHub renders in a Markdown document, with source offsets. Use when importing gfm-comments, or when code needs the `<!-- -->` comments of a README or other GitHub Markdown file without matching ones in code blocks, code spans, or link destinations.
---

# gfm-comments

`findComments(source)` returns the comments GitHub renders, sorted by `start`, and their ranges never overlap. It follows cmark-gfm 0.29.0.gfm.13 and GitHub's HTML handling, so a `<!--` in code, a link destination or title, image alt text, a reference definition, escaped text, or an open HTML tag is not returned.

```ts
import { findComments } from 'gfm-comments'

for (const { start, end, contentStart, contentEnd } of findComments(source)) {
    const text = source.slice(contentStart, contentEnd)
}
```

## Comment fields

| Field | Meaning |
|--------|-------------|
| `start`, `end` | Range of the whole comment, from `<!--` to just past its closer |
| `contentStart`, `contentEnd` | Range of the text between `<!--` and the closer |
| `nextLinePrefix` | A prefix to write at the start of a following line so that the new line stays in the same containers, such as `> ` in a blockquote or three spaces for `1. <!-- a -->`; `''` outside containers. It is an editing aid built from the containers, not copied from the document |
| `onCommentLine` | The comment is on an HTML block line whose first content, after spaces and tabs, is a comment |

Offsets are UTF-16 indexes for `String.prototype.slice()`.

## Pitfalls

- Comments that end at an HTML parse error are returned too, because the browser builds them: `<!-->`, `<!--->`, a comment closed by `--!>`, and a comment that is never closed, which runs to the end of the document. `source.slice(contentEnd, end)` is the closer. It is `''` when GitHub does not close the comment within this stretch of source: the comment runs to the end of the document or of a footnote definition, or up to a footnote definition that GitHub moves to the end of the page. `onCommentLine` does not tell these apart. Check the closer before treating a comment as a closed marker: `source.slice(comment.contentEnd, comment.end) === '-->'` keeps only comments closed by `-->`. Do not use `source.startsWith('-->', comment.contentEnd)`: a comment with an empty closer can stop right before a `-->` that GitHub shows as text.
- To add a line after a comment and keep it in the same blockquote or list, start the line with `comment.nextLinePrefix`. It is built from the containers for editing, not copied from the source, and GitHub does not render it.
- To edit a document, apply replacements from the last comment to the first, so earlier offsets stay valid. This is safe because the ranges never overlap.
- A few rare forms, such as tight-list paragraphs after open raw HTML, are read differently than GitHub reads them. See the [known gaps](https://github.com/privatenumber/gfm-comments/blob/develop/notes/gfm-comments/known-gaps.md#known-gaps).
