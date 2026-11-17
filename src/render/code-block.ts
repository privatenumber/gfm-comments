import type { GeneratedBlock } from '../block/index.ts';
import { isCmarkSpace, trimCmarkSpace } from '../utils/ascii.ts';
import { decodeEntities, unescapeBackslashes } from './entities.ts';
import { escapeHtml, normalizeInput } from './escape.ts';

// cmark decodes entities, trims the result, then removes backslash escapes.
// The renderer writes the info string up to its first space as the language.
const codeLanguage = (raw: string) => {
	const info = unescapeBackslashes(trimCmarkSpace(decodeEntities(raw)));
	let end = 0;
	while (end < info.length && !isCmarkSpace(info.charCodeAt(end))) {
		end += 1;
	}
	return info.slice(0, end);
};

/** Renders the block markup that the HTML tokenizer sees, not source ranges. */
export const renderGeneratedBlock = (source: string, block: GeneratedBlock) => {
	if (block.type === 'thematicBreak') {
		return '<hr />\n';
	}
	const language = codeLanguage(normalizeInput(source.slice(block.infoStart, block.infoEnd)));
	const content: string[] = [];
	let tabIndex = 0;
	for (let index = 0; index < block.lines.length; index += 1) {
		const start = block.lines[index];
		let end = start;
		while (end < source.length && source.charCodeAt(end) !== 10 && source.charCodeAt(end) !== 13) {
			end += 1;
		}
		const spaces = block.tabSpaces[tabIndex] === index ? block.tabSpaces[tabIndex + 1] : 0;
		if (spaces) {
			tabIndex += 2;
		}
		content.push(' '.repeat(spaces), source.slice(start, end), '\n');
	}
	const opening = language ? `<pre lang="${escapeHtml(language)}"><code>` : '<pre><code>';
	return `${opening}${escapeHtml(normalizeInput(content.join('')))}</code></pre>\n`;
};
