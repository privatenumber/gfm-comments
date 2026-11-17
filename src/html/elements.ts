// Start tags that never stay on the stack. Beyond the standard's void
// elements, `frame` and `frameset` are ignored in body and `image` becomes
// `img`. GitHub /markdown on 2026-11-17 showed that `menuitem` and `isindex`
// do not stay open either, as in older versions of the standard.
const voidTagNames = new Set(['area', 'base', 'basefont', 'bgsound', 'br', 'col', 'embed', 'frame', 'frameset', 'hr', 'image', 'img', 'input', 'isindex', 'keygen', 'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr']);

// HTML integration points. Their children are HTML, apart from `svg`, `math`,
// and, in MathML, `mglyph` and `malignmark`. An end tag processed as HTML
// cannot close one or anything below it, because each is a special element
// and a scope boundary:
// https://html.spec.whatwg.org/multipage/parsing.html#html-integration-point
// https://html.spec.whatwg.org/multipage/parsing.html#mathml-text-integration-point
// `annotation-xml` with an HTML `encoding` is not modeled, because the stack
// does not read attributes.
const svgIntegrationPoints = new Set(['foreignobject', 'desc', 'title']);
const mathIntegrationPoints = new Set(['mi', 'mo', 'mn', 'ms', 'mtext']);

// The names below are at most 10 characters, so longer names skip the Set
// lookups (see the measured fast path for void names in `processElement`).

// Start tags that close a `p` in button scope. GitHub /markdown on 2026-11-17
// showed that `search` and `dialog` do not, unlike the standard.
// `plaintext` and `xmp` are tag-filtered.
// https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inbody
const closesParagraphNames = new Set(['address', 'article', 'aside', 'blockquote', 'center', 'details', 'dir', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'header', 'hgroup', 'main', 'menu', 'nav', 'ol', 'p', 'section', 'summary', 'ul', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'listing', 'form', 'li', 'dd', 'dt', 'table', 'hr']);

// Table elements. Their end tags close through any element below the table,
// as the table insertion modes do, and the start tags other than `table` are
// ignored outside a table.
const tableNames = new Set(['table', 'caption', 'colgroup', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr']);

// The default scope boundaries, which are also markers in the list of active
// formatting elements apart from `table`. `html` is never a raw element on
// GitHub's stack.
// https://html.spec.whatwg.org/multipage/parsing.html#has-an-element-in-scope
// https://html.spec.whatwg.org/multipage/parsing.html#concept-parser-marker
const scopeNames = new Set(['applet', 'caption', 'table', 'td', 'th', 'marquee', 'object', 'template']);

// HTML special elements that can be on the stack, which `hr` never is:
// https://html.spec.whatwg.org/multipage/parsing.html#special
// GitHub's parser does not treat `search` as special. GitHub /markdown on
// 2026-11-17 showed that `noscript` is, as scripting is disabled.
// `html`, `body`, `head`, and `select` are left out because their own rules
// are not modeled, and void and tag-filtered elements are never on the stack.
const specialNames = new Set([...closesParagraphNames, ...tableNames, ...scopeNames, 'button', 'noscript']);

// https://html.spec.whatwg.org/multipage/parsing.html#formatting
const formattingNames = new Set(['a', 'b', 'big', 'code', 'em', 'font', 'i', 'nobr', 's', 'small', 'strike', 'strong', 'tt', 'u']);

const isHeading = (name: string) => name.length === 2 && name[0] === 'h' && name[1] >= '1' && name[1] <= '6';

type Element = {
	name: string;
	foreign: boolean;

	/**
	 * For a foreign element, the position of the `svg` or `math` that starts
	 * its run of foreign elements, or -1.
	 */
	root: number;

	/** The position of the nearest integration point at or below the element, or -1. */
	integrationPoint: number;

	/** The position of the nearest HTML element at or below the element, or -1. */
	html: number;

	// The positions of the nearest boundaries at or below the element, or -1:
	// a special element, a special element other than `address`, `div`, and
	// `p`, and the boundaries of the default, button, and list item scopes.
	// Integration points are special and bound every scope.
	special: number;
	specialBlock: number;
	scope: number;
	buttonScope: number;
	listScope: number;
	position: number;
	indexes: number[];
};

type NameNode = {
	children?: Map<string, NameNode> | undefined;
	indexes?: number[] | undefined;
};

/**
 * The browser's stack of open elements, kept only as far as it decides
 * whether the current node is SVG or MathML content, where `<![CDATA[`
 * opens a CDATA section:
 * https://html.spec.whatwg.org/multipage/parsing.html#tree-construction
 */
export const createElementStack = () => {
	const elements: Element[] = [];
	// HTML heading end tags match any HTML heading level.
	const htmlHeadings: number[] = [];
	// Keep each Map key below V8's 16,384-character length-only hashing threshold.
	const positions: NameNode = { children: new Map() };
	const nameNode = (name: string, create: boolean, remove = false) => {
		// Most names are one chunk, so they skip the path and its cleanup walk.
		// The node stays while a longer open name continues below it.
		if (remove && name.length <= 16_383) {
			const node = positions.children!.get(name)!;
			if (node.children?.size) {
				node.indexes = undefined;
			} else {
				positions.children!.delete(name);
			}
			return undefined;
		}
		let node = positions;
		const path: [NameNode, string][] | undefined = remove ? [] : undefined;
		for (let offset = 0; offset < name.length; offset += 16_383) {
			const chunk = name.slice(offset, offset + 16_383);
			path?.push([node, chunk]);
			let child = node.children?.get(chunk);
			if (!child) {
				if (!create) {
					return undefined;
				}
				child = {};
				(node.children ??= new Map()).set(chunk, child);
			}
			node = child;
		}
		if (path) {
			node.indexes = undefined;
			while (path.length > 0 && !node.children?.size && !node.indexes) {
				const [parent, chunk] = path.pop()!;
				parent.children!.delete(chunk);
				node = parent;
			}
		}
		return node;
	};
	const findIndexes = (name: string) => nameNode(name, false)?.indexes;
	const isIntegrationPoint = (element: Element) => element.integrationPoint === element.position;
	// Whether an element opened now is foreign.
	const opensForeign = (name: string) => {
		const parent = elements.at(-1);
		// An open HTML `select` ignores `svg` and `math` before this runs.
		if (!parent?.foreign) {
			return name === 'svg' || name === 'math';
		}
		return !isIntegrationPoint(parent)
			|| name === 'svg'
			|| name === 'math'
			|| (elements[parent.root].name === 'math' && (name === 'mglyph' || name === 'malignmark'));
	};
	const push = (name: string, foreign: boolean) => {
		const parent = elements.at(-1);
		const node = nameNode(name, true)!;
		node.indexes ??= [];
		const { indexes } = node;
		const position = elements.length;
		// `svg` and `math` start a run at an integration point, and `svg` does
		// at a MathML `annotation-xml`. Elsewhere in a run, they take the run's
		// namespace.
		// https://html.spec.whatwg.org/multipage/parsing.html#tree-construction-dispatcher
		const continuesRun = foreign && !!parent?.foreign
			&& (isIntegrationPoint(parent) ? name !== 'svg' && name !== 'math' : name !== 'svg' || parent.name !== 'annotation-xml' || elements[parent.root].name !== 'math');
		const root = foreign ? (continuesRun ? parent!.root : position) : -1;
		const integrationPoint = foreign && (elements[root]?.name ?? name) === 'svg'
			? svgIntegrationPoints.has(name)
			: foreign && mathIntegrationPoints.has(name);
		const short = !foreign && name.length <= 10;
		// MathML `annotation-xml` is special and a scope boundary whatever its
		// `encoding`.
		const boundary = integrationPoint || (foreign ? name === 'annotation-xml' && elements[root].name === 'math' : short && scopeNames.has(name));
		const special = boundary || (short && specialNames.has(name));
		const element = {
			name,
			foreign,
			root,
			integrationPoint: integrationPoint ? position : (parent?.integrationPoint ?? -1),
			html: foreign ? (parent?.html ?? -1) : position,
			special: special ? position : (parent?.special ?? -1),
			specialBlock: special && name !== 'address' && name !== 'div' && name !== 'p' ? position : (parent?.specialBlock ?? -1),
			scope: boundary ? position : (parent?.scope ?? -1),
			buttonScope: boundary || (!foreign && name === 'button') ? position : (parent?.buttonScope ?? -1),
			listScope: boundary || (!foreign && (name === 'ol' || name === 'ul')) ? position : (parent?.listScope ?? -1),
			position,
			indexes,
		};
		elements.push(element);
		indexes.push(element.position);
		if (!foreign && isHeading(name)) {
			htmlHeadings.push(position);
		}
		return element;
	};
	const popTo = (position: number) => {
		while (elements.length > position) {
			const element = elements.pop()!;
			if (!element.foreign && isHeading(element.name)) {
				htmlHeadings.pop();
			}
			element.indexes.pop();
			if (element.indexes.length === 0) {
				nameNode(element.name, false, true);
			}
		}
	};

	const isOpen = (element: Element) => elements[element.position] === element;

	// The list of active formatting elements, which reopens formatting
	// elements that an implied close popped:
	// https://html.spec.whatwg.org/multipage/parsing.html#list-of-active-formatting-elements
	// Each marker records the list length when its element opened.
	const formatting: Element[] = [];
	const markers: {
		element: Element;
		start: number;
	}[] = [];
	// Where the entries after the last marker start. A marker whose element
	// closed clears the entries after it.
	const activeStart = () => {
		while (markers.length > 0 && !isOpen(markers.at(-1)!.element)) {
			formatting.length = markers.pop()!.start;
		}
		return markers.at(-1)?.start ?? 0;
	};
	// https://html.spec.whatwg.org/multipage/parsing.html#reconstruct-the-active-formatting-elements
	const reconstruct = () => {
		const start = activeStart();
		let index = formatting.length;
		while (index > start && !isOpen(formatting[index - 1])) {
			index -= 1;
		}
		for (; index < formatting.length; index += 1) {
			formatting[index] = push(formatting[index].name, false);
		}
	};
	const addFormatting = (element: Element) => {
		const start = activeStart();
		// The Noah's Ark clause keeps at most three entries with one name after
		// the last marker. It compares attributes too, which the stack does not
		// read. The cap bounds each reconstruction and list search at 42 entries.
		let count = 0;
		let earliest = -1;
		for (let index = formatting.length - 1; index >= start; index -= 1) {
			if (formatting[index].name === element.name) {
				count += 1;
				earliest = index;
			}
		}
		if (count >= 3) {
			formatting.splice(earliest, 1);
		}
		formatting.push(element);
	};

	// Closes a `p` in button scope.
	const closeParagraph = () => {
		const p = findIndexes('p')?.at(-1);
		if (p !== undefined && p >= elements.at(-1)!.buttonScope) {
			popTo(p);
		}
	};

	// Applies the in-body start tag rules that close elements, and returns
	// whether the element is inserted.
	// https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inbody
	const startTag = (name: string, short: boolean) => {
		if (short && tableNames.has(name) && name !== 'table') {
			const table = findIndexes('table')?.at(-1);
			return table !== undefined && !elements[table].foreign;
		}
		if (short && closesParagraphNames.has(name)) {
			// `li` closes the nearest `li`, and `dd` or `dt` the nearest of either,
			// unless a special element other than `address`, `div`, and `p` is
			// above it.
			const target = name === 'li'
				? findIndexes('li')?.at(-1)
				: (name === 'dd' || name === 'dt' ? Math.max(findIndexes('dd')?.at(-1) ?? -1, findIndexes('dt')?.at(-1) ?? -1) : -1);
			if (target !== undefined && target !== -1 && target >= elements.at(-1)!.specialBlock) {
				popTo(target);
			}
			closeParagraph();
			const current = elements.at(-1);
			if (isHeading(name) && current && !current.foreign && isHeading(current.name)) {
				popTo(current.position);
			}
			return true;
		}
		if (name === 'button') {
			const button = findIndexes('button')?.at(-1);
			if (button !== undefined && button >= elements.at(-1)!.scope) {
				popTo(button);
			}
		}
		if (name !== 'template') {
			reconstruct();
		}
		return true;
	};

	const closeElement = (name: string) => {
		const current = elements.at(-1);
		let position = findIndexes(name)?.at(-1);
		// In foreign content, an end tag closes the nearest element with its name
		// above the nearest HTML element, through integration points. Otherwise
		// it is processed as HTML, which cannot reach the nearest integration
		// point or anything below it.
		// https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inforeign
		if (position !== undefined && current!.foreign && position > current!.html) {
			popTo(position);
			return;
		}
		if (isHeading(name)) {
			// As HTML, a heading end tag closes the nearest HTML heading of any
			// level. Foreign headings do not participate in this lookup.
			position = htmlHeadings.at(-1);
		}
		const short = name.length <= 10;
		if (short && formattingNames.has(name)) {
			// The adoption agency algorithm, as far as it decides what stays open:
			// it ignores an element that is not in scope, and otherwise ends up
			// closing everything above it.
			// https://html.spec.whatwg.org/multipage/parsing.html#adoption-agency-algorithm
			// Without an entry, it runs the steps for any other end tag.
			const start = activeStart();
			let index = formatting.length - 1;
			while (index >= start && formatting[index].name !== name) {
				index -= 1;
			}
			if (index >= start) {
				const element = formatting[index];
				if (isOpen(element) && element.position < current!.scope) {
					return;
				}
				formatting.splice(index, 1);
				if (isOpen(element)) {
					popTo(element.position);
				}
				return;
			}
		}
		// A foreign element here is below an integration point. An HTML element
		// of the same name further below is not looked for.
		if (position === undefined || elements[position].foreign) {
			return;
		}
		// Table end tags close through anything inside the table, and
		// `template` through anything, including integration points, because
		// table scope has no other boundaries. Any other end tag cannot reach the
		// nearest integration point. `p` and `li` use the button and list item
		// scopes, other special elements the default scope, and any other end
		// tag, including `</noscript>`, stops at a special element.
		let boundary = -1;
		if (!(name === 'template' || (short && tableNames.has(name)))) {
			if (position <= current!.integrationPoint) {
				return;
			}
			if (name === 'p') {
				boundary = current!.buttonScope;
			} else if (name === 'li') {
				boundary = current!.listScope;
			} else {
				boundary = short && specialNames.has(name) && name !== 'noscript' ? current!.scope : current!.special;
			}
		}
		if (position >= boundary) {
			popTo(position);
		}
	};
	const processElement = (name: string, closing: boolean, selfClosed = false) => {
		const select = findIndexes('select')?.at(-1);
		let inSelect = false;
		if (select !== undefined && !elements[select].foreign) {
			inSelect = true;
			if (closing) {
				if (name !== 'select' && name !== 'option' && name !== 'optgroup' && name !== 'template') {
					return;
				}
				if (name === 'option' && elements.at(-1)?.name !== 'option') {
					return;
				}
				if (name === 'optgroup') {
					if (elements.at(-1)?.name === 'option' && elements.at(-2)?.name === 'optgroup') {
						popTo(elements.length - 1);
					}
					if (elements.at(-1)?.name !== 'optgroup') {
						return;
					}
				}
			} else if (name === 'select' || name === 'input' || name === 'keygen' || name === 'textarea') {
				popTo(select);
				if (name === 'select') {
					return;
				}
				inSelect = false;
			} else if (name === 'option' || name === 'optgroup') {
				if (elements.at(-1)?.name === 'option') {
					popTo(elements.length - 1);
				}
				if (name === 'optgroup' && elements.at(-1)?.name === 'optgroup') {
					popTo(elements.length - 1);
				}
			} else if (name !== 'script' && name !== 'template') {
				return;
			}
		}
		// No void name is longer than 8 characters. The length check is a measured
		// fast path: with distinct 16,400-character names, `voidTagNames.has` made
		// each doubling of the input cost 2.7-2.9x instead of 1.8x (2026-11-15).
		if (closing) {
			closeElement(name);
			return;
		}
		const foreign = opensForeign(name);
		const parent = elements.at(-1);
		const short = !foreign && name.length <= 10;
		// The in-body rules apply to HTML elements and to `svg` and `math`
		// outside a foreign run.
		if (
			!inSelect
			&& (!parent?.foreign || isIntegrationPoint(parent))
			&& (!foreign || name === 'svg' || name === 'math')
			&& !startTag(name, short)
		) {
			return;
		}
		if ((name.length > 8 || !voidTagNames.has(name) || foreign) && !(selfClosed && (foreign || name === 'svg' || name === 'math'))) {
			const element = push(name, foreign);
			if (short && formattingNames.has(name)) {
				addFormatting(element);
			} else if (short && name !== 'table' && scopeNames.has(name)) {
				markers.push({
					element,
					start: formatting.length,
				});
			}
		}
	};

	return {
		elements,
		processElement,
	};
};
