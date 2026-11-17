/**
 * Sends every GitHub probe fixture to GitHub's `/markdown` API again and
 * reports the fixtures whose output changed. Run it by hand, never in tests
 * or CI: each fixture is one API request, sent one at a time.
 *
 * Usage:
 *   node scripts/oracle/reprobe.ts [--id <id>]...   compare
 *   node scripts/oracle/reprobe.ts --record         probe fixtures without output
 *   node scripts/oracle/reprobe.ts --update [--id <id>]...
 *                                                   also write changed outputs
 *
 * Requires the `gh` CLI, signed in. Send only synthetic documents.
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { renderGitHub } from './oracle.ts';

// Only the fields this script reads or writes; the rest pass through.
type GitHubProbe = {
	id: string;
	input: string;
	output: string | null;
	date: string | null;
};

const fixturesPath = new URL('../../tests/fixtures/github-probes.json', import.meta.url);
const probes: GitHubProbe[] = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

const { values } = parseArgs({
	options: {
		id: {
			type: 'string',
			multiple: true,
		},
		record: { type: 'boolean' },
		update: { type: 'boolean' },
	},
});

const today = new Date().toISOString().slice(0, 10);

// GitHub suffixes footnote ids with a hash that differs between requests.
const normalize = (html: string) => html.replaceAll(/(user-content-fn(?:ref)?-[^"]*?)-[\da-f]{32}/g, '$1-HASH');

const ids = new Set(values.id);
for (const id of ids) {
	if (!probes.some(probe => probe.id === id)) {
		throw new Error(`No fixture with id ${id}`);
	}
}

const selected = probes.filter((probe) => {
	if (ids.size > 0) {
		return ids.has(probe.id);
	}
	return values.record ? probe.output === null : true;
});

let changed = 0;
for (const probe of selected) {
	const output = renderGitHub(probe.input);
	if (probe.output === null) {
		probe.output = output;
		probe.date = today;
		console.log(`recorded ${probe.id}`);
		continue;
	}
	if (normalize(output) === normalize(probe.output)) {
		console.log(`same     ${probe.id}`);
		continue;
	}
	changed += 1;
	console.log(`CHANGED  ${probe.id}`);
	console.log(`  input:    ${JSON.stringify(probe.input)}`);
	console.log(`  recorded: ${JSON.stringify(probe.output)} (${probe.date})`);
	console.log(`  now:      ${JSON.stringify(output)}`);
	if (values.update) {
		probe.output = output;
		probe.date = today;
	}
}

if (values.record || values.update) {
	fs.writeFileSync(fixturesPath, `${JSON.stringify(probes, null, '\t')}\n`);
}
console.log(`${selected.length} probed, ${changed} changed`);
if (changed > 0 && !values.update) {
	process.exitCode = 1;
}
