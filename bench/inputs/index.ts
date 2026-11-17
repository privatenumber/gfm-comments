import { scanCorpus, type Corpus } from './corpus.ts';
import { workloads } from './workloads.ts';

type FindComments = (source: string) => unknown[];

export type Input = {
	name: string;
	characters: number;
	run: (findComments: FindComments) => number;
};

/** The corpus plus the fixed workloads, named and sized for a results table. */
export const createInputs = (corpus: Corpus): Input[] => [
	{
		name: 'corpus',
		characters: corpus.characters,
		run: findComments => scanCorpus(corpus.documents, findComments),
	},
	...workloads.map(workload => ({
		name: workload.name,
		characters: workload.source.length,
		run: (findComments: FindComments) => findComments(workload.source).length,
	})),
];
