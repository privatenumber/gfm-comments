/**
 * The GitHub-like oracle: cmark-gfm 0.29.0.gfm.13 with GitHub's options and
 * extensions renders each document, and parse5 parses the HTML with
 * scripting disabled, as GitHub does. A comment is a comment node that parse5
 * builds from a real `<!--` in the output, however it ends.
 *
 * Build the renderer first with `pnpm oracle:build`.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import type { Comment } from '../../src/index.ts';

type Node = DefaultTreeAdapterMap['node'];

export const cacheDirectory = new URL('../../node_modules/.cache/gfm-oracle/', import.meta.url);

const batch = fileURLToPath(new URL('batch', cacheDirectory));

/** Renders each document to HTML in one process. */
export const render = (documents: string[]) => {
	if (!fs.existsSync(batch)) {
		throw new Error('The oracle is not built. Run `pnpm oracle:build`.');
	}
	return execFileSync(batch, {
		input: documents.join('\0'),
		maxBuffer: 2 ** 30,
		encoding: 'utf8',
	}).split('\0').slice(0, documents.length);
};

/**
 * Renders one document with GitHub's `/markdown` API in `gfm` mode, with the
 * `gh` CLI. Each call is one API request: send only synthetic documents.
 */
export const renderGitHub = (text: string) => execFileSync('gh', ['api', 'markdown', '--input', '-'], {
	input: JSON.stringify({
		text,
		mode: 'gfm',
	}),
	encoding: 'utf8',
});

/**
 * A Lehmer generator: each call returns the next value modulo `limit`. The
 * recorded comparison results depend on this sequence; keep it unchanged.
 */
export const createRandom = (seed: number) => {
	let state = seed;
	return (limit: number) => {
		state = (state * 48_271) % 2_147_483_647;
		return state % limit;
	};
};

/**
 * How a comment ends: `empty` for `<!-->` and `<!--->`, `bang` for `--!>`,
 * `close` for `-->`, and `eof` for a comment that runs to the end of the
 * input. parse5's end offset for an unclosed comment does not reach the end
 * of the HTML, so `eof` is the remaining case.
 */
export type CloserKind = 'empty' | 'bang' | 'close' | 'eof';

export const closerKind = (raw: string): CloserKind => {
	if (raw === '<!-->' || raw === '<!--->') {
		return 'empty';
	}
	if (raw.endsWith('--!>')) {
		return 'bang';
	}
	if (raw.endsWith('-->') && raw.length >= 7) {
		return 'close';
	}
	return 'eof';
};

// A comment that spans chunks also holds the markup and escaped text that the
// renderer generates between them, so tags and entities are dropped on both
// sides.
const normalize = (text: string) => text
	.replaceAll('&gt;', '>')
	.replaceAll('&lt;', '<')
	.replaceAll('&quot;', '"')
	.replaceAll('&amp;', '&')
	.replaceAll(/<\/?[a-z][a-z\d]*\/?/gi, '')
	.replaceAll(/[\s>]+/g, '');

// Each generated `<!--` has a unique number: `o12q` after a bare `<!--`, and
// `a12` or `/a12` in a marker. The number a comment starts with identifies its
// opening, and the last marker number in it identifies its closing. Without
// one, a comment compares by its first or last 3 characters.
const key = (text: string) => {
	const opening = /^(?:o\d+q|\/?a\d+)/.exec(text)?.[0] ?? text.slice(0, 3);
	const closing = [...text.matchAll(/\/?a\d+/g)].at(-1)?.[0] ?? text.slice(-3);
	return `${opening}|${closing}`;
};

// `clip` is a scanner comment that ends at a footnote definition boundary.
export type Kind = CloserKind | 'clip';

// Each comment compares by its closer kind and, unless it is empty, its key.
// A comment that runs to the end ends there on both sides, and its tail is
// source text on one side and rendered output on the other, so only its
// opening compares. So does a clipped one.
export const label = (text: string, kind: Kind) => {
	if (kind === 'empty') {
		return kind;
	}
	const textKey = key(normalize(text));
	return `${kind}:${kind === 'eof' || kind === 'clip' ? textKey.split('|')[0] : textKey}`;
};

export type CommentNode = {

	/** The comment's text, as parse5 reads it. */
	data: string;

	/** The comment's markup in the HTML, from its `<!--`. */
	raw: string;
};

// Visits every node in tree order, including the content of a template.
const walk = (node: Node, visit: (node: Node) => void) => {
	visit(node);
	if ('childNodes' in node) {
		for (const child of node.childNodes) {
			walk(child, visit);
		}
	}
	if ('content' in node) {
		walk(node.content, visit);
	}
};

/**
 * The comment nodes that parse5 builds from a real `<!--` in the HTML, in tree
 * order. parse5 also builds comment nodes from `<?x>` and `<!x>`, which are
 * left out.
 */
export const commentNodes = (html: string) => {
	const comments: CommentNode[] = [];
	const tree = parseFragment(html, {
		sourceCodeLocationInfo: true,
		scriptingEnabled: false,
	});
	walk(tree, (node) => {
		const location = node.sourceCodeLocation;
		if (node.nodeName === '#comment' && location && html.startsWith('<!--', location.startOffset)) {
			comments.push({
				data: (node as DefaultTreeAdapterMap['commentNode']).data,
				raw: html.slice(location.startOffset, location.endOffset),
			});
		}
	});
	return comments;
};

const gumboBatch = fileURLToPath(new URL('gumbo-batch', cacheDirectory));

/**
 * The comment nodes from a real `<!--` that the patched gumbo builds in each
 * HTML fragment, in tree order. It is the element stack reference: see
 * notes/gfm-comments/github-oracle.md#patched-gumbo.
 */
export const gumboCommentNodes = (htmls: string[]): CommentNode[][] => {
	if (!fs.existsSync(gumboBatch)) {
		throw new Error('The patched gumbo is not built. Run `pnpm oracle:build`.');
	}
	return execFileSync(gumboBatch, {
		input: htmls.join('\0'),
		maxBuffer: 2 ** 30,
		encoding: 'utf8',
	}).split('\0').slice(0, htmls.length).map(output => output.split('\u001E').slice(0, -1).map((entry) => {
		const [raw, data] = entry.split('\u001F');
		return {
			data,
			raw,
		};
	}));
};

/** The label of each comment node, as compare.ts compares comments. */
export const nodeLabels = (nodes: CommentNode[]) => nodes.map(
	({ data, raw }) => label(data, closerKind(raw)),
);

/**
 * The label of each comment the scanner reports in `source`. A comment
 * without a closer runs to the end.
 */
export const scannerLabels = (source: string, comments: Comment[]) => comments.map(({
	start, contentStart, contentEnd, end,
}) => label(source.slice(contentStart, contentEnd), contentEnd === end ? 'eof' : closerKind(source.slice(start, end))));

/** The text of every text node in the HTML, in tree order. */
export const textOf = (html: string) => {
	let text = '';
	walk(parseFragment(html, { scriptingEnabled: false }), (node) => {
		if (node.nodeName === '#text') {
			text += (node as DefaultTreeAdapterMap['textNode']).value;
		}
	});
	return text;
};

type CommentVisitor = (
	start: number,
	contentStart: number,
	contentEnd: number,
	end: number,
	nextLinePrefix: string,
	onCommentLine: boolean,
) => void;

type ScanFunction = (
	source: string,
	visit: CommentVisitor,
) => Comment[] | void;

// `findComments` since the src/ reorganization; `scanComments` before it.
type ScannerModule = {
	findComments?: ScanFunction;
	scanComments?: ScanFunction;
};

/**
 * Loads `findComments` from `src/index.ts` of this checkout, or from the given
 * file, such as `src/index.ts` or the older `src/scan-comments/index.ts` in
 * another checkout, to compare a baseline. It adapts the older `scanComments`
 * name, the pre-cleanup visitor signature, and the current array return value
 * to one function that returns `Comment[]`. `url` is the file it loaded, for
 * loading the modules beside it.
 */
export const loadScanner = async (file?: string) => {
	const url = file
		? pathToFileURL(path.resolve(file))
		: new URL('../../src/index.ts', import.meta.url);
	const module = await import(url.href) as ScannerModule;
	const scan = module.findComments ?? module.scanComments;
	if (!scan) {
		throw new Error(`${url.href} exports neither findComments nor scanComments`);
	}
	return {
		findComments: (source: string): Comment[] => {
			const collected: Comment[] = [];
			const result = scan(source, (
				start,
				contentStart,
				contentEnd,
				end,
				nextLinePrefix,
				onCommentLine,
			) => {
				collected.push({
					start,
					end,
					contentStart,
					contentEnd,
					nextLinePrefix,
					onCommentLine,
				});
			});
			return Array.isArray(result) ? result : collected;
		},
		url,
	};
};
