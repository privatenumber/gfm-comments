/**
 * Prints one line per document: the document, the start of the oracle's HTML,
 * and each comment node parse5 builds from a `<!--` in it, with its closer
 * kind. Use it to see quickly how the oracle reads several variants.
 *
 * Usage: node scripts/oracle/nodes.ts '<JSON array of documents>'
 */
import { closerKind, commentNodes, render } from './oracle.ts';

const documents: string[] = JSON.parse(process.argv[2]);
for (const [index, html] of render(documents).entries()) {
	const nodes = commentNodes(html).map(node => [node.data, closerKind(node.raw)]);
	console.log(
		JSON.stringify(documents[index]).padEnd(44),
		JSON.stringify(html).slice(0, 70).padEnd(72),
		JSON.stringify(nodes),
	);
}
