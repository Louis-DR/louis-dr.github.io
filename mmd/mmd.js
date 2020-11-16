BLOCKQUOTE = false;

const TAGS = {
	'*': ['<em>', '</em>'],
	'_': ['<em>', '</em>'],
	'__': ['<strong>', '</strong>'],
	'**': ['<strong>', '</strong>'],
	'~': ['<u>', '</u>'],
	'~~': ['<s>', '</s>'],
	'==': ['<mark>', '</mark>'],
	'^': ['<sup>', '</sup>'],
	'^^': ['<sub>', '</sub>'],
};

// Encode special attribute characters to HTML entities in a String.
function encodeAttr(str) {
	return (str + '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Parse Markdown into an HTML String. */
function parse(md, modules, prevLinks) {
	// console.log("\n\n\nMD START",[md]);

	let tokenizer = /(\n+-{3,}(?:\n+|$))|(\n{2,})|(>+) *([^\n]*(?:\n(?:>+) *(?:[^\n]*))*)|(?:(?:^|\n+)(#+)\s*(.+)(?:\n+|$))|((?<=[^\n])---)|((?<=[^\n])--)|(__|\*\*|~~|\^\^|==|[_*~\^])|(?:`([^`].*?)`)|((?:(?:^|\n)([*+-]|\d+\.)\s+.*)+)|(?:^::: *(\w*)\n([\s\S]*?)\n:::$)|(?:!\[([^\]]*?)\](?:(?:\(([^)]+?)\))|(?:\[([^)]+?)\])))|((?<=^|[^\]])\[)|(?:\](?:\(([^\]]+?)\)))|(?:\](?:\[([^\]]+?)\]))|(?:^``` *(\w*)\n([\s\S]*?)\n```$)/gm,
	//              | hr 1              | br 2   | block emphasis 3 4                    | header 5 6                      | em dash 7     | en dash 8    | inline emphasis 9          | inline code 10| list 11 12                      | module block 13 14              | image 15 16 17                                        | link 18 19 20                                                  | code block 21 22                /
		context = [],
		out = '',
		links = prevLinks || {},
		last = 0,
		chunk, prev, token, inner, t;

	function tag(token) {
		let desc = TAGS[token || ''];
		let end = context[context.length - 1] == token;
		if (!desc) return token;
		if (!desc[1]) return desc[0];
		if (end) context.pop();
		else context.push(token);
		return desc[end | 0];
	}

	function flush() {
		let str = '';
		while (context.length) str += tag(context[context.length - 1]);
		return str;
	}

	md = md.replace(/^\[(.+?)\]:\s*(.+)$/gm, (s, name, url) => {
		links[name.toLowerCase()] = url;
		return '';
	}).replace(/^\n+|\n+$/g, '');

	// console.log("links:",links)

	while ((token = tokenizer.exec(md))) {

		// console.log(token)

		prev = md.substring(last, token.index);
		last = tokenizer.lastIndex;
		chunk = token[0];

		if (prev.match(/[^\\](\\\\)*\\$/)) {
			// escaped
		}
		// horizontal rule
		else if (token[1]) {
			chunk = '<hr/>';
		}
		// break line
		else if (token[2]) {
			chunk = flush()+'<br class="mmd-br"/>';
		}
		// block emphasis
		else if (token[3]) {
			// console.log("	BLOCK EM token[4]:", [token[4]]);
			// inside = encodeAttr(parse(token[4].replace(/(^ *)|(> *)/g,''),modules,links))
			inside = parse(token[4].replace(/(^ *)|(> *)/g,''),modules,links);
			// console.log("	BLOCK EM inside:", [inside]);
			if (BLOCKQUOTE && token[3].length==1)
				chunk = `<blockquote>${inside}</blockquote>`;
			else
				chunk = `<div class="mmd-blockem-${Math.min(token[3].length,6)}">${inside}</div>`;
		}
		// header
		else if (token[5]) {
			// console.log("	HEADER")
			chunk = `<h${Math.min(token[5].length,6)}>${parse(token[6],modules,links)}</h${Math.min(token[5].length,6)}>`;
		}
		// em-dash
		else if (token[7]) {
			chunk = '—';
		}
		// en-dash
		else if (token[8]) {
			chunk = '–';
		}
		// inline emphasis
		else if (token[9]) {
			chunk = tag(token[9]);
		}
		// inline code
		else if (token[10]) {
			chunk = `<code class="mmd-inline-code">${encodeAttr(token[10])}</code>`;
		}
		// // lists TODO: multi-level list using recursion
		// else if (t = token[12]) {
		// 	// console.log("	LIST token[11]:", [token[11]], "token[12]:", [token[12]])
		// 	if (t.match(/\./)) {
		// 		token[11] = token[11].replace(/^\d+/gm, '');
		// 	}
		// 	inner = parse(token[11].replace(/^\s*[>*+.-]/gm, ''),modules,links);
		// 	t = t.match(/\./) ? 'ol' : 'ul';
		// 	inner = inner.replace(/^(.*)(\n|$)/gm, '<li>$1</li>');
		// 	chunk = '<' + t + '>' + inner + '</' + t + '>';
		// }


		else if (t = token[12]) {
			console.log("	LIST token[11]:", [token[11]], "token[12]:", [token[12]])
			if (t.match(/\./)) {
				token[11] = token[11].replace(/^\d+/gm, '');
			}
			inner = parse(token[11].replace(/^\s*[>*+.-]/gm, ''),modules,links);
			t = t.match(/\./) ? 'ol' : 'ul';
			inner = inner.replace(/^(.*)(\n|$)/gm, '<li>$1</li>');
			chunk = '<' + t + '>' + inner + '</' + t + '>';
		}


		// module block
		else if (token[13]) {
			let moduleName = token[13].toLowerCase();
			let width = 300;
			let height = 200;
			if (moduleName=="plot") {
				width = 500;
				height = 400;
			}
			if (moduleName in modules)
				chunk = `<br class="mmd-br"/><svg class="mmd-diagram mmd-diagram-${moduleName}" width="${width}" height="${height}" version="1.1" xmlns="http://www.w3.org/2000/svg">${modules[moduleName](token[14])}</svg><br class="mmd-br"/>`;
			else
				chunk = '<br class="mmd-br"/>'
		}
		// direct image
		else if (token[16]) {
			// console.log("	DIRECT IMAGE token[16]:",token[16])
			chunk = `<img src="${encodeAttr(token[16])}" alt="${encodeAttr(token[15])}">`;
		}
		// referenced image
		else if (token[17]) {
			// console.log("	REF IMAGE token[17]:",token[17])
			chunk = `<img src="${encodeAttr(links[token[17].toLowerCase()])}" alt="${encodeAttr(token[15])}">`;
		}
		// link start
		else if (token[18]) {
			// console.log("	LINK START")
			chunk = '<a>';
		// direct link
		} else if (token[19]) {
			// console.log("	DIRECT LINK token[19]:",token[19])
			out = out.replace('<a>', `<a href="${encodeAttr(token[19])}">`);
			chunk = flush() + '</a>';
		// referenced link
		} else if (token[20]) {
			// console.log("	REF LINK token[20]:",token[20])
			out = out.replace('<a>', `<a href="${encodeAttr(links[token[20].toLowerCase()])}">`);
			chunk = flush() + '</a>';
		}
		// code block
		else if (token[22]) {
			chunk = '<pre class="mmd-code"><code' + (token[21] ? ` class="mmd-code-language-${token[21].toLowerCase()}"` : '') + `>${encodeAttr(token[22])}</code></pre>`;
		}

		// console.log("	PREV", [prev])
		// console.log("	CHUNK", [chunk])

		out += prev;
		out += chunk;
	}

	// console.log("	OUT", [out]);
	// console.log("	MD.SUBSTRING(LAST)", [md.substring(last)]);

	return (out + md.substring(last) + flush()).replace(/^\n+|\n+$/g, '');
}