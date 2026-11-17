import { isAsciiLetter, isAsciiPunctuation, trimCmarkSpace } from '../utils/ascii.ts';
import { utf8Length } from '../utils/utf8.ts';
import { decodedUnit, decodeEntities, decodeEntity } from './entities.ts';
import { escapeHref, escapeHtml, normalizeInput } from './escape.ts';

/**
 * A link target or a reference definition's destination and title as the
 * source writes them: the destination with any `<` and `>`, and the title with
 * its delimiters, or `''`.
 */
export type LinkTarget = {
	destination: string;
	title: string;
};

/**
 * `cmark_clean_url` and `cmark_clean_title` decode entities before they remove
 * backslash escapes. The renderer needs the cleaned text; the reference budget
 * needs its UTF-8 size, which differs for a numeric entity that cmark writes
 * as one invalid byte. One walk emits each unit with its size, so the two
 * readings cannot drift apart.
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/inlines.c#L868-L909
 */
const walkClean = (text: string, emit: (unit: string, bytes: number) => void) => {
	let backslash = false;
	for (let index = 0; index < text.length; index += 1) {
		const start = index;
		let code = text.charCodeAt(index);
		let bytes = utf8Length(text, index);
		let unit = text[index];
		if (code === 38) {
			const entity = decodeEntity(text, index);
			if (entity) {
				code = entity.code;
				bytes = entity.bytes;
				unit = decodedUnit(text, start, entity);
				index = entity.end;
			}
		}

		const escaped = backslash;
		backslash = false;
		if (escaped) {
			// A backslash before ASCII punctuation is removed, and the
			// punctuation is kept. Any other backslash stays.
			if (!isAsciiPunctuation(code)) {
				emit('\\', 1);
			}
			emit(unit, bytes);
		} else if (code === 92) {
			// Wait for the unit it can escape.
			backslash = true;
		} else {
			emit(unit, bytes);
		}
	}
	if (backslash) {
		emit('\\', 1);
	}
};

const cleanText = (text: string) => {
	let cleaned = '';
	walkClean(text, (unit) => {
		cleaned += unit;
	});
	return cleaned;
};

const cleanUrl = (raw: string) => {
	const destination = raw.charCodeAt(0) === 60 ? raw.slice(1, -1) : raw;
	return cleanText(trimCmarkSpace(destination));
};

const cleanTitle = (raw: string) => {
	const first = raw.charCodeAt(0);
	const last = raw.charCodeAt(raw.length - 1);
	const delimited = raw.length >= 2 && (
		(first === 34 && last === 34)
		|| (first === 39 && last === 39)
		|| (first === 40 && last === 41)
	);
	return cleanText(delimited ? raw.slice(1, -1) : raw);
};

/** The cleaned UTF-8 size that the reference budget charges for `text`. */
export const cleanSize = (text: string) => {
	let size = 0;
	walkClean(text, (_unit, bytes) => {
		size += bytes;
	});
	return size;
};

// The ` title="…"` that a link or image writes when its title is not empty.
const titleAttribute = (title: string) => {
	const cleaned = cleanTitle(title);
	return cleaned ? ` title="${escapeHtml(normalizeInput(cleaned))}"` : '';
};

/**
 * The opening tag that the renderer writes for a link:
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/html.c#L384-L400
 * The destination and title are exact apart from values outside ASCII, which
 * no tokenizer state compares.
 */
export const renderLinkOpen = ({ destination, title }: LinkTarget) => (
	`<a href="${escapeHref(cleanUrl(destination))}"${titleAttribute(title)}>`
);

/**
 * The markup that the renderer writes for an image:
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/html.c#L402-L420
 * The `alt` text is the description rendered without markup. It is
 * approximated as empty: it can hold `'` and change the tokenizer state only
 * inside a single-quoted attribute value, like other text that renders.
 */
export const renderImage = ({ destination, title }: LinkTarget) => (
	`<img src="${escapeHref(cleanUrl(destination))}" alt=""${titleAttribute(title)} />`
);

/**
 * The markup that the renderer writes for an autolink from `start` to `end`.
 * An angle autolink is an email address when it has no `:`, and both parts
 * have their entities decoded:
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/src/inlines.c#L154-L183
 * A bare autolink starts at its `www.` or at the `:` after its scheme, and
 * its text is the source as written:
 * https://github.com/github/cmark-gfm/blob/0.29.0.gfm.13/extensions/autolink.c#L168-L280
 */
export const renderAutolink = (text: string, start: number, end: number) => {
	let href: string;
	let label: string;
	switch (text.charCodeAt(start)) {
		case 60: {
			const inner = text.slice(start + 1, end - 1);
			label = decodeEntities(inner);
			href = (inner.includes(':') ? '' : 'mailto:') + label;
			break;
		}
		case 119: {
			label = text.slice(start, end);
			href = `http://${label}`;
			break;
		}
		default: {
			let schemeStart = start;
			while (schemeStart > 0 && isAsciiLetter(text.charCodeAt(schemeStart - 1))) {
				schemeStart -= 1;
			}
			label = text.slice(schemeStart, end);
			href = label;
		}
	}
	return `<a href="${escapeHref(href)}">${escapeHtml(normalizeInput(label))}</a>`;
};
