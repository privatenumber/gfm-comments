import { glob, readFile } from 'node:fs/promises';

export type Corpus = {
	documents: string[];
	characters: number;
};

/**
 * The Markdown files in this package's `node_modules` that contain `<!--`,
 * deduplicated by content and read in path order. The corpus changes only
 * when the lockfile does, so it is not a fixed workload like `workloads.ts`.
 */
export const loadCorpus = async (): Promise<Corpus> => {
	const root = new URL('../../node_modules/.pnpm/', import.meta.url);
	const paths: string[] = [];
	for await (const file of glob('**/*.md', { cwd: root })) {
		paths.push(file);
	}
	paths.sort();

	const unique = new Set<string>();
	for (const file of paths) {
		const text = await readFile(new URL(file, root), 'utf8');
		if (text.includes('<!--')) {
			unique.add(text);
		}
	}

	const documents = [...unique];
	return {
		documents,
		characters: documents.reduce((sum, document) => sum + document.length, 0),
	};
};

/** Scans each document separately, as a consumer reads one file at a time. */
export const scanCorpus = (documents: string[], findComments: (source: string) => unknown[]) => {
	let comments = 0;
	for (const document of documents) {
		comments += findComments(document).length;
	}
	return comments;
};
