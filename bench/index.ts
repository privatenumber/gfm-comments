/**
 * Compares ways to find the comments GitHub renders in real Markdown files.
 *
 * The corpus is every `.md` file in this package's `node_modules` that
 * contains `<!--`, deduplicated by content, so it changes only when the
 * lockfile does. Each approach is graded against GitHub's renderer, so the
 * oracle must be built first with `pnpm oracle:build`.
 */
import os from 'node:os';
import { bench, run, do_not_optimize as keep } from 'mitata';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { findComments } from '../src/index.ts';
import { commentNodes, render } from '../scripts/oracle/oracle.ts';
import { loadCorpus, scanCorpus } from './inputs/corpus.ts';

const { documents, characters } = await loadCorpus();

// Each approach returns the text of every comment it finds.
const approaches = {
	regex: (source: string) => [...source.matchAll(/<!--([\s\S]*?)-->/g)].map(match => match[1]),
	findComments: (source: string) => findComments(source).map(
		comment => source.slice(comment.contentStart, comment.contentEnd),
	),

	/**
	 * Renders the Markdown to HTML and parses the HTML as a browser does. This
	 * is the usual correct approach, but it gives no source offsets.
	 */
	'micromark + parse5': (source: string) => commentNodes(micromark(source, {
		allowDangerousHtml: true,
		extensions: [gfm()],
		htmlExtensions: [gfmHtml()],
	})).map(comment => comment.data),
};

/**
 * Grades each approach against GitHub's renderer, cmark-gfm, whose HTML is
 * parsed as a browser does. A container's prefix, such as `> `, is part of a
 * multiline comment's source but not of its rendered text, so the comparison
 * ignores whitespace and `>`.
 */
const normalize = (text: string) => text.replaceAll(/[\s>]+/g, '');
const expected = render(documents).map(
	html => commentNodes(html).map(comment => normalize(comment.data)),
);
console.log(`Node.js ${process.version}, ${os.cpus()[0].model}`);
console.log(`${documents.length} files, ${characters} characters, ${expected.flat().length} comments that GitHub renders`);
for (const [name, find] of Object.entries(approaches)) {
	let found = 0;
	let wrong = 0;
	for (const [index, document] of documents.entries()) {
		const missing = [...expected[index]];
		for (const text of find(document)) {
			found += 1;
			const match = missing.indexOf(normalize(text));
			if (match === -1) {
				wrong += 1;
			} else {
				missing.splice(match, 1);
			}
		}
		wrong += missing.length;
	}
	console.log(`${name}: ${found} comments, ${wrong} wrong or missing`);
}

for (const [name, find] of Object.entries(approaches)) {
	bench(name, () => {
		keep(scanCorpus(documents, find));
	});
}

await run();
