/**
 * The size limit for the `pnpm size` measurement, an esbuild proxy that is
 * about 1% smaller than the published `dist/index.mjs`. It is about 2% above
 * the 2026-11-17 implicit-close measurement of 51,294 bytes minified and
 * 19,969 bytes gzip, so growth beyond the 2% headroom fails while an unrelated change
 * passes.
 *
 * After a size change, measure with `pnpm size` and set each number to the new
 * measurement plus about 2%. `tests/specs/size.ts` enforces this.
 */
export const SIZE_BUDGET = {
	minified: 52_320,
	gzip: 20_370,
} as const;
