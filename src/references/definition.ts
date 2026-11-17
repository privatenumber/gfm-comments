import { isAsciiPunctuation, isCmarkSpace } from '../utils/ascii.ts';
import { scanLabel } from './label.ts';

/**
 * Link reference definitions, such as `[x]: <url> "title"`, as GitHub's
 * renderer, cmark-gfm 0.29.0.gfm.13, reads them at the start of a paragraph.
 * A definition renders nothing, so a comment inside one is not a comment:
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/inlines.c#L1022-L1131
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/inlines.c#L1567-L1627
 */

const maxDestinationParentheses = 32;

const skipSpaces = (text: string, index: number) => {
	while (text.charCodeAt(index) === 32 || text.charCodeAt(index) === 9) {
		index += 1;
	}
	return index;
};

/** Returns the index after the line ending at `index`, or -1 when none is there. */
const skipLineEnd = (text: string, index: number) => {
	if (index >= text.length) {
		return index;
	}
	return text.charCodeAt(index) === 10 ? index + 1 : -1;
};

/** `spnl`: spaces and tabs, with at most one line ending among them. */
const skipSpacesAndLineEnd = (text: string, index: number) => {
	index = skipSpaces(text, index);
	if (text.charCodeAt(index) === 10) {
		index = skipSpaces(text, index + 1);
	}
	return index;
};

/** `manual_scan_link_url`: returns the index after the destination, or -1. */
export const scanDestination = (text: string, index: number) => {
	if (text.charCodeAt(index) === 60) {
		for (index += 1; index < text.length;) {
			const code = text.charCodeAt(index);
			if (code === 62) {
				return index + 1 < text.length ? index + 1 : -1;
			}
			if (code === 10 || code === 60) {
				return -1;
			}
			index += code === 92 ? 2 : 1;
		}
		return -1;
	}

	const start = index;
	let depth = 0;
	while (index < text.length) {
		const code = text.charCodeAt(index);
		if (code === 92 && isAsciiPunctuation(text.charCodeAt(index + 1))) {
			index += 2;
		} else if (code === 40) {
			depth += 1;
			if (depth > maxDestinationParentheses) {
				return -1;
			}
			index += 1;
		} else if (code === 41) {
			if (depth === 0) {
				break;
			}
			depth -= 1;
			index += 1;
		} else if (isCmarkSpace(code)) {
			if (index === start) {
				return -1;
			}
			break;
		} else {
			index += 1;
		}
	}
	return index < text.length ? index : -1;
};

/**
 * `scan_link_title`: returns the index after the title at `index`, or -1. The
 * pattern takes the longest match, so an end delimiter after a backslash both
 * can end the title and can be passed over as an escape.
 */
export const scanTitle = (text: string, index: number) => {
	const open = text.charCodeAt(index);
	if (open !== 34 && open !== 39 && open !== 40) {
		return -1;
	}
	const close = open === 40 ? 41 : open;
	let end = -1;
	for (let cursor = index + 1; cursor < text.length; cursor += 1) {
		const code = text.charCodeAt(cursor);
		if (code === close || (open === 40 && code === 40)) {
			if (code === close) {
				end = cursor + 1;
			}
			if (text.charCodeAt(cursor - 1) !== 92) {
				break;
			}
		}
	}
	return end;
};

/** `cmark_parse_reference_inline`: returns the index after the definition, or -1. */
const scanDefinition = (
	text: string,
	index: number,
	onDefinition?: (label: string, destination: string, title: string) => void,
) => {
	const labelStart = index;
	index = scanLabel(text, index);
	if (index === -1 || text.charCodeAt(index) !== 58) {
		return -1;
	}
	const destinationStart = skipSpacesAndLineEnd(text, index + 1);
	const destinationEnd = scanDestination(text, destinationStart);
	if (destinationEnd === -1) {
		return -1;
	}

	// A title must follow whitespace and end its line. Otherwise the
	// definition ends after the destination.
	const titleStart = skipSpacesAndLineEnd(text, destinationEnd);
	const titleEnd = titleStart === destinationEnd ? -1 : scanTitle(text, titleStart);
	let end = titleEnd === -1 ? -1 : skipLineEnd(text, skipSpaces(text, titleEnd));
	if (end === -1) {
		// cmark rewinds before the title but retains the parsed title.
		end = skipLineEnd(text, skipSpaces(text, destinationEnd));
	}
	if (end !== -1) {
		onDefinition?.(
			text.slice(labelStart + 1, index - 1),
			text.slice(destinationStart, destinationEnd),
			titleEnd === -1 ? '' : text.slice(titleStart, titleEnd),
		);
	}
	return end;
};

/**
 * Returns the number of lines that link reference definitions take up at the
 * start of a paragraph. `text` holds the paragraph's lines, each followed by a
 * line feed.
 */
export const countDefinitionLines = (
	text: string,
	onLabel?: (label: string, destination: string, title: string) => void,
) => {
	let index = 0;
	let lines = 0;
	while (text.charCodeAt(index) === 91) {
		const end = scanDefinition(text, index, onLabel);
		if (end === -1) {
			break;
		}
		for (let lineFeed = text.indexOf('\n', index); lineFeed !== -1 && lineFeed < end; lineFeed = text.indexOf('\n', lineFeed + 1)) {
			lines += 1;
		}
		index = end;
	}
	return lines;
};
