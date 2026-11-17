import { decodeEntity, scanEntityName } from '../render/entities.ts';
import { isAsciiPunctuation } from '../utils/ascii.ts';

/**
 * Returns the index after the `^` that a bracket's text starts with, or -1.
 * The `^` may also come from an escape or an entity, as each makes a text node.
 */
export const scanCaret = (text: string, index: number) => {
	const code = text.charCodeAt(index);
	if (code === 94) {
		return index + 1;
	}
	if (code === 92) {
		return text.charCodeAt(index + 1) === 94 ? index + 2 : -1;
	}
	if (code === 38) {
		const entity = decodeEntity(text, index);
		return entity?.code === 94 && entity.bytes === 1 ? entity.end + 1 : -1;
	}
	return -1;
};

/**
 * The label of a footnote reference: the text from `start` to `end`, with
 * escapes and entities decoded. GitHub joins the text nodes after the `^` up
 * to the first other inline, which differs from the column arithmetic in
 * cmark-gfm 0.29.0.gfm.13; see notes/gfm-comments/footnotes.md.
 * A named entity is compared only when the table holds it with an ASCII first
 * byte and a one-byte value, or it is `fjlig`. Every other entity-shaped name
 * makes the label undefined. Numeric entities decode normally.
 */
export const decodeReferenceLabel = (text: string, start: number, end: number) => {
	let label = '';
	for (let index = start; index < end; index += 1) {
		const code = text.charCodeAt(index);
		if (code === 92 && index + 1 < end && isAsciiPunctuation(text.charCodeAt(index + 1))) {
			index += 1;
			label += text[index];
			continue;
		}
		const entity = code === 38 ? decodeEntity(text, index) : undefined;
		if (entity && entity.end < end) {
			if (text.charCodeAt(index + 1) === 35) {
				label += String.fromCodePoint(entity.code);
			} else if (entity.bytes === 1) {
				label += String.fromCharCode(entity.code);
			} else if (text.startsWith('fjlig;', index + 1)) {
				label += 'fj';
			} else {
				return undefined;
			}
			index = entity.end;
			continue;
		}
		const nameEnd = code === 38 ? scanEntityName(text, index) : -1;
		if (nameEnd !== -1 && nameEnd < end) {
			return undefined;
		}
		label += code === 0 ? '�' : text[index];
	}
	return label;
};
