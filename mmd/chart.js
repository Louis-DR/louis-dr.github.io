
function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
	var angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;

	return {
		x: centerX + (radius * Math.cos(angleInRadians)),
		y: centerY + (radius * Math.sin(angleInRadians))
	};
}

function describeArc(x, y, radius, startAngle, endAngle) {

	var start = polarToCartesian(x, y, radius, endAngle);
	var end = polarToCartesian(x, y, radius, startAngle);

	var largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

	var d = [
        "M", x, y,
        "L", start.x, start.y,
        "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
        "Z"
	].join(" ");

	return d;
}

function parseDiagram(md) {
	let out = "";
	let tokenizer = /(?<=\n|^)(%?)([\w- ]+) *:([\s\S]*?)(?=\n(?=[\s\S]*:)|$)/gm;
	let data = [];
	let total = 0;
	let colors = [
		"IndianRed",
		"SteelBlue",
		"DarkSeaGreen",
		"GoldenRod",
        "Sienna",
		"MediumOrchid",
        "LightSeaGreen",
        "YellowGreen",
        "Peru",
	];
	let settings = {
		"stroke_width": 0,
		"stroke_color": "black",
		"radius": 80,
		"inside-radius": 20,
		"label": "legend",
		"angle": 0,
		"angle-cut": 0, //add an option to scale the graph to vertically align with the size with the cut angle
		"direction": "clockwise",
		"order": "normal/alphabetical/sort"
	}
	let legend_unit = 20;
	let legend_size = 10;

	while ((token = tokenizer.exec(md))) {
		if (token[1]) {
			settings[token[2].replace('-','_')] = token[3].trim(' ').toLowerCase();
		} else {
			let el = {};
			el.label = token[2];
			let raw = token[3].trim(' ').split(/\s+/);
			if (raw.length >= 1) {
				el.value = parseFloat(raw[0]);
				total += parseFloat(raw[0]);
			}
			if (raw.length >= 2)
				el.color = raw[1];
			else el.color = colors.shift();
			data.push(el);
		}
	}

	let clockwise = ! ["ccw", "counter-clockwise", "anti-clockwise", "reverse"].includes(settings.direction);

	let start = parseInt(settings.angle);
	let end = 0;
	for (const el of data) {
		end = (start + (clockwise?1:-1) * (el.value/total)*360);

		let sector = '<path fill="'
					 + el.color
					 + '" stroke="'
					 + settings.stroke_color
					 + '" stroke-width="'
					 + settings.stroke_width
					 + '" d="'
					 + (clockwise?describeArc(100, 100, settings.radius, start, end)
					             :describeArc(100, 100, settings.radius, end, start))
					 + '"></path>';
		start = end;
		out += sector;
	}

	let legend_start = 100 - (data.length-1)*legend_unit/2;
	for (const el of data) {
		let lel = '<rect x="'
				  + 220
				  + '" y="'
				  + (legend_start-legend_size/2)
				  + '" width="'
				  + (legend_size*1.5)
				  + '" height="'
				  + legend_size
				  + '" fill="'
				  + el.color
				  + '"/>';
		let lel_text = '<text x="'
		               + 240
		               + '" y="'
		               + (legend_start-legend_size/2+legend_size)
					   + '" font-size=0.6em'
					   + ' font-family="'
					   + 'Roboto'
					   + '">'
					   + el.label
					   + '</text>';
		legend_start += legend_unit;
		out += lel;
		out += lel_text;
	}

	return out;
}

