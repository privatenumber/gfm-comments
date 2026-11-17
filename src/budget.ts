import { createBlockFilter } from './block/filter.ts';
import { lexBlocks } from './block/index.ts';
import { type InlineFootnotes, lexInline } from './inline/index.ts';
import { joinText } from './inline/text.ts';
import { normalizeLabel } from './references/label.ts';
import { cleanSize, type LinkTarget } from './render/link.ts';
import { trimCmarkSpace } from './utils/ascii.ts';
import { utf8Length } from './utils/utf8.ts';

/**
 * cmark-gfm charges each successful lookup against a document-wide cap:
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/map.c#L95-L100
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/references.c#L35
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/blocks.c#L652-L659
 * The fast bound is the number of `]` characters times twice the largest raw
 * definition size in UTF-8 after NUL replacement. An entity grows by at most one byte.
 */

const byteLength = (text: string, originalInput = false) => {
	let length = 0;
	for (let index = 0; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		length += (code > 0 && code < 128) || (originalInput && code === 0)
			? 1
			: utf8Length(text, index);
	}
	return length;
};

const definitionSize = ({ destination: rawDestination, title }: LinkTarget) => {
	const destination = rawDestination.startsWith('<') ? rawDestination.slice(1, -1) : rawDestination;
	return cleanSize(trimCmarkSpace(destination)) + cleanSize(title.slice(1, -1));
};

/**
 * Returns the failed lookup ordinals of each replayed block, keyed by the
 * block's start, or undefined when no lookup can exceed the cap.
 *
 * With `footnotes`, the pass always runs, because it also counts the footnote
 * references, in document order, as cmark-gfm's `process_footnotes` does.
 * Every block is then recorded, because replay also reads blocks that hold
 * only references. The footnote map has no expansion budget.
 */
export const createReferenceBudget = <T>(
	source: string,
	labels: Map<string, LinkTarget>,
	footnotes?: InlineFootnotes<T>,
) => {
	let maxSize = 0;
	for (const { destination, title } of labels.values()) {
		maxSize = Math.max(maxSize, 2 * (byteLength(destination) + byteLength(title)));
	}
	let brackets = 0;
	let bracketPosition = -1;
	while (true) {
		bracketPosition = source.indexOf(']', bracketPosition + 1);
		if (bracketPosition === -1) {
			break;
		}
		brackets += 1;
	}
	// The cap is at least 100,000 bytes. Checking that first skips measuring
	// the whole document, which most documents with definitions never need.
	let cap = 100_000;
	let limited = brackets * maxSize > cap;
	if (limited) {
		// cmark counts original input bytes, before replacing NUL with U+FFFD.
		cap = Math.max(byteLength(source, true), cap);
		limited = brackets * maxSize > cap;
	}
	if (!limited && !footnotes) {
		return undefined;
	}

	const failures = new Map<number, Set<number>>();
	const sizes = new Map<string, number>();
	let used = 0;
	// Only `hasBrackets` is read, which foreign content does not change.
	const filter = createBlockFilter(source, false);
	lexBlocks(source, {
		html: () => {},
		generated: () => {},
		wantsCode: () => false,
		text: (segments, _nextLinePrefix, unescapePipes) => {
			// Blocks that replay skips still use up the budget.
			if (segments.length === 0 || !filter.hasBrackets(segments)) {
				return;
			}
			const start = segments[0];
			let ordinal = 0;
			lexInline(joinText(source, segments, undefined, unescapePipes), () => {}, (label) => {
				const current = ordinal;
				ordinal += 1;
				const normalized = normalizeLabel(label);
				const entry = labels.get(normalized);
				if (!entry || !limited) {
					return entry;
				}
				let size = sizes.get(normalized);
				if (size === undefined) {
					size = definitionSize(entry);
					sizes.set(normalized, size);
				}
				if (size > cap - used) {
					// Replay can lex any block with brackets, because a link
					// renders markup even without raw HTML.
					let block = failures.get(start);
					if (!block) {
						block = new Set();
						failures.set(start, block);
					}
					block.add(current);
					return undefined;
				}
				used += size;
				return entry;
			}, undefined, footnotes);
		},
	});
	return limited ? failures : undefined;
};
