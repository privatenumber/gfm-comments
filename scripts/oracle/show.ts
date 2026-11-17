/**
 * Prints, for each document, the oracle's HTML, the comment nodes parse5
 * builds from it with their closer kinds, and the scanner's comments. Use it
 * to classify each mismatch that compare.ts reports.
 *
 * Usage:
 *   node scripts/oracle/show.ts [--scanner <src/index.ts>] '<JSON array of documents>'
 */
import { parseArgs } from 'node:util';
import {
	closerKind, commentNodes, loadScanner, render,
} from './oracle.ts';

const { values, positionals } = parseArgs({
	options: {
		scanner: { type: 'string' },
	},
	allowPositionals: true,
});
if (positionals.length !== 1) {
	throw new Error('Expected one JSON array of documents');
}

const documents: string[] = JSON.parse(positionals[0]);
const { findComments } = await loadScanner(values.scanner);
for (const [index, html] of render(documents).entries()) {
	const document = documents[index];
	console.log('DOCUMENT', JSON.stringify(document));
	console.log(html);
	for (const node of commentNodes(html)) {
		console.log(`ORACLE  ${closerKind(node.raw).padEnd(5)}`, JSON.stringify(node.data));
	}
	for (const {
		start, contentStart, contentEnd, end,
	} of findComments(document)) {
		console.log(`SCANNER ${JSON.stringify(document.slice(start, end))}`, [start, contentStart, contentEnd, end]);
	}
}
