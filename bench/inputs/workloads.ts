/**
 * Fixed workloads that isolate one Markdown construct each. They are built
 * from explicit repetition counts, never from the lockfile or randomness, so
 * the same source is used on every run and on every git ref.
 */
export type Workload = {
	name: string;
	source: string;
};

const commentDense = Array.from({ length: 1500 }, (_, index) => `Paragraph ${index} with an inline <!-- note ${index} --> and **strong** text.\n\n<!-- block ${index} -->\n\n`).join('');

const blockquoteList = Array.from({ length: 800 }, (_, index) => {
	const depth = 1 + (index % 4);
	const prefix = '> '.repeat(depth);
	return [
		`${prefix}- item ${index} <!-- q${index} -->`,
		`${prefix}  - nested **item** [link](/${index})`,
		prefix,
		`${prefix}> quoted <!-- r${index} -->`,
		'',
	].join('\n');
}).join('\n');

const tableColumns = 6;
const tableHeader = [
	`| ${Array.from({ length: tableColumns }, (_, column) => `h${column}`).join(' | ')} |`,
	`| ${Array.from({ length: tableColumns }, (_, column) => (column % 2 === 0 ? '---:' : ':---')).join(' | ')} |`,
].join('\n');
const tableRow = (row: number) => `| ${Array.from({ length: tableColumns }, (_, column) => `cell ${row}.${column} <!-- t${row}.${column} -->`).join(' | ')} |`;
const tableRows = Array.from({ length: 700 }, (_, row) => tableRow(row)).join('\n');
const tables = `${tableHeader}\n${tableRows}\n`;

const inlineLinks = `${Array.from({ length: 500 }, (_, index) => `Paragraph <!-- l${index} --> with [link ${index}](/u/${index}) and ![image](/i/${index}.png), <https://example.com/${index}>, www.example.com/${index}, and [reference][r].\n\n`).join('')}[r]: /reference\n`;

const htmlBlocks = Array.from({ length: 400 }, (_, index) => [
	`<div class="block-${index}" data-index="${index}">`,
	`<!-- h${index} -->`,
	`<p>Text <!-- i${index} --> with <span title="a">markup</span>.</p>`,
	'</div>',
	'',
	'<details>',
	`<summary>s${index}</summary>`,
	'',
	`<!-- d${index} -->`,
	'',
	'</details>',
	'',
	(index % 10 === 0 ? `<svg><![CDATA[ > <!-- svg${index} --> ]]></svg>\n` : ''),
].join('\n')).join('\n');

const adversarialNesting = `${[
	'<!-- start -->',
	'*a '.repeat(3000),
	'_b '.repeat(3000),
	`${'['.repeat(2000)}x`,
	`${'<svg>'.repeat(500)}${'</svg>'.repeat(500)}`,
	'<!-- end -->',
	"<div title='",
	'`x` '.repeat(1000),
	`<span ${'data-x="1" '.repeat(500)}>`,
].join('\n\n')}\n`;

const words = ['the', 'scanner', 'reads', 'markdown', 'without', 'building', 'a', 'tree', 'and', 'reports', 'comments'];
const sentence = (paragraph: number, index: number) => {
	const length = 12 + ((paragraph + index) % 7);
	const text = Array.from({ length }, (_, word) => words[(paragraph * 3 + index * 5 + word) % words.length]).join(' ');
	return `${text}.`;
};
const paragraphText = (paragraph: number) => Array.from({ length: 4 }, (_, index) => sentence(paragraph, index)).join(' ');
const longPlainText = `${Array.from({ length: 900 }, (_, paragraph) => {
	const comment = paragraph % 100 === 0 ? `<!-- plain ${paragraph} --> ` : '';
	return `${comment}${paragraphText(paragraph)}`;
}).join('\n\n')}\n`;

export const workloads: Workload[] = [
	{
		name: 'comment-dense',
		source: commentDense,
	},
	{
		name: 'blockquote-list',
		source: blockquoteList,
	},
	{
		name: 'tables',
		source: tables,
	},
	{
		name: 'inline-links',
		source: inlineLinks,
	},
	{
		name: 'html-blocks',
		source: htmlBlocks,
	},
	{
		name: 'adversarial-nesting',
		source: adversarialNesting,
	},
	{
		name: 'long-plain-text',
		source: longPlainText,
	},
];
