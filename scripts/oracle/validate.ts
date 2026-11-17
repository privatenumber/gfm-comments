/**
 * Compares the oracle's visible text with GitHub's `/markdown` rendering on
 * generated documents. GitHub's output has no comment nodes to compare, so a
 * difference is text that one side hides in a comment and the other shows.
 * Two comments that hide the same text with different boundaries look the
 * same.
 *
 * Each document is one API request, sent one at a time, so keep the count
 * small. Run it by hand, never in tests or CI. Requires the `gh` CLI.
 *
 * Usage: node scripts/oracle/validate.ts <count> <seed>
 */
import {
	createRandom, render, renderGitHub, textOf,
} from './oracle.ts';

const count = Number(process.argv[2]);
const random = createRandom(Number(process.argv[3]));
const fragments = ['x <!-- a -->', 'x <!-- /a -->', '<!--', '-->', '<!-->', '<!--->', ' --->', '\n', '\n', '\n\n', ' ', 'text', '`', '``', '\n```\n', '\n    ', '> ', '- ', '1. ', '| - |', '|', '# ', '\n===\n', '\n***\n', '\\', '<div>', '\n<div>\n', '<span>', '\n<span>\n', '<pre>', '</pre>', '<?x', '?>', '<!X', '>', '<a title="', '">', '\t', 'w'];
const withoutSpace = (text: string) => text.replaceAll(/\s+/g, '');

let bad = 0;
for (let i = 0; i < count; i += 1) {
	let document = '';
	const length = 3 + random(14);
	for (let j = 0; j < length; j += 1) {
		document += fragments[random(fragments.length)];
	}
	const github = renderGitHub(document);
	const [oracle] = render([document]);
	const githubText = withoutSpace(textOf(github));
	const oracleText = withoutSpace(textOf(oracle));
	if (githubText !== oracleText) {
		bad += 1;
		console.log(JSON.stringify(document));
		console.log('  github:', JSON.stringify(githubText));
		console.log('  oracle:', JSON.stringify(oracleText));
	}
}
console.log({
	count,
	bad,
});
