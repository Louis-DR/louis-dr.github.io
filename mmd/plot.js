INDENTATION_SPACES = 2

WIDTH = 500
HEIGHT = 400

ATTR_LIST = [
    'x','y','z',
    's','scale','scale-x','scale-y','scale-z',
    'err-x','err-y','err-z',
    'length','height','width',
    'color'
]

/**
 * == Attributes ==
 * x,y,z : coordinate attributes
 * scale, scale-x, scale-y, scale-z : scale of the marker
 * length, width : size of a rectangle
 * x2,y2,z2 : other corner of a rectangle
 * err-x, err-y, err-z : error bar
 * color
 *
 * == Drawing options ==
 * color
 * opacity
 *
 * line (on off)
 * line-width
 * line-dash
 * line-color
 * line-opacity
 * line-stroke-width
 * line-stoke-color
 * line-stroke-opacity
 *
 * marker (off, style)
 * marker-size
 * marker-color
 * marker-opacity
 * marker-stroke-width
 * marker-stroke-color
 * marker-stroke-opacity
 *
 */

function parsePlot(md) {
    object = parseSYAML(md);

    console.log(object)

	let out = "";

    out += `<defs>
                <style>
                    @font-face {
                        font-family: CMU;
                        src: url("/cmunrm.ttf");
                    }
                </style>
            </defs>`;

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

    let params = [
        {"key":"opacity"                 , "syntax":["opacity"]               , "default_value":1},

        {"key":"marker_size"             , "syntax":["size","marker-size"]    , "default_value":5},
        {"key":"marker_opacity"          , "syntax":["marker-opacity"]        , "default_value":1},
        {"key":"marker_stroke_width"     , "syntax":["stroke-width", "marker-stroke-width"]           , "default_value":-1},
        {"key":"marker_stroke_color"     , "syntax":["stroke", "stroke-color", "marker-stroke-color"] , "default_value":-1},
        {"key":"marker_stroke_opacity"   , "syntax":["stroke-opacity", "marker-stroke-opacity"]       , "default_value":1},

        {"key":"line_opacity"            , "syntax":["line-opacity"]          , "default_value":1},
        {"key":"line_width"              , "syntax":["line-width"]            , "default_value":2},
    ]

    let series_list = []
    for (const [key, value] of Object.entries(object)) {
        let series = {}

        if ('label' in value) series.label = value.label
        else series.label = key

        let data_size = 0
        for (attr of ATTR_LIST) {
            if (attr in value) {
                let len_attr = value[attr]._data[0].length;
                if ((len_attr > 1) && (len_attr != data_size) && data_size) console.log('ERROR')
                data_size = len_attr
            }
        }
        series.size = data_size;

        if ('x' in value) series.x = value.x._data[0]
        else series.x = [...Array(data_size).keys()];

        if ('y' in value) series.y = value.y._data[0]
        else series.y = Array(data_size).fill(0);

        if ('z' in value) series.z = value.z._data[0]
        else series.z = Array(data_size).fill(0);

        if ('scale' in value) {
            series.scale = value.scale._data[0];
            series.scaled = true;
        }
        else if ('s' in value) {
            series.scale = value.s._data[0];
            series.scaled = true;
        }
        else {
            series.scale = Array(data_size).fill(1);
            series.scaled = false;
        }

        if ('color' in value) series.color = value.color._data[0]
        else series.color = colors.shift();

        for (param of params) {
            series[param.key] = param.default_value;
            for (syntax of param.syntax)
                if (syntax in value)
                    series[param.key] = value[syntax]._data[0]
        }

        if (series.marker_stroke_color == -1) series.marker_stroke_color = series.color;
        else if (series.marker_stroke_width == -1) series.marker_stroke_width = 1;

        series_list.push(series);
    }

    let min_x = 0,
        max_x = 0,
        min_y = 0,
        max_y = 0;
    let x_ticks_step = 1,
        y_ticks_step = 2;

    let min_scale_data = 10e100,
        max_scale_data = -10e100;
    let min_scale_param = 0.1,
        max_scale_param = 10;
    let marker_radius = 5;

    for (series of series_list) {
        let temp_min_x = Math.min(...series.x);
        if (temp_min_x<min_x) min_x = temp_min_x;
        let temp_max_x = Math.max(...series.x);
        if (temp_max_x>max_x) max_x = temp_max_x;

        let temp_min_y = Math.min(...series.y);
        if (temp_min_y<min_y) min_y = temp_min_y;
        let temp_max_y = Math.max(...series.y);
        if (temp_max_y>max_y) max_y = temp_max_y;

        let temp_min_scale = Math.min(...series.scale);
        if (temp_min_scale<min_scale_data) min_scale_data = temp_min_scale;
        let temp_max_scale = Math.max(...series.scale);
        if (temp_max_scale>max_scale_data) max_scale_data = temp_max_scale;
    }

    max_x *= 1.05;
    max_y *= 1.05;

    function scale2radius(s, ser) {
        let min_marker_area = min_scale_param*Math.PI*ser.marker_size*ser.marker_size,
            max_marker_area = max_scale_param*Math.PI*ser.marker_size*ser.marker_size;

        let radius_multiplier = Math.sqrt((max_marker_area - min_marker_area)/(max_scale_data-min_scale_data))/Math.PI
        let radius_offset = Math.sqrt(min_marker_area)/Math.PI

        return s*radius_multiplier + radius_offset;
    }

    for (series of series_list) {
        if (series.scaled)
            series.radii = series.scale.map(x => scale2radius(x, series));
        else
            series.radii = Array(series.size).fill(series.marker_size);
    }

    let title_height = 1;

    let x_ticks_height = 8;
    let x_ticks_labels_margin = 4;
    let x_ticks_labels_height = 16;
    let x_title_margin = 4;
    let x_title_height = 16;

    let y_ticks_width = 8;
    let y_ticks_labels_margin = 4;
    let y_ticks_labels_width = 16;
    let y_title_margin = 4;
    let y_title_width = 16;

    let margins = [10,10,10,10];


    let graph_x1 = margins[3] + y_title_width + y_title_margin + y_ticks_labels_width + y_ticks_labels_margin + y_ticks_width,
        graph_y1 = title_height + margins[0],
        graph_x2 = WIDTH - margins[1],
        graph_y2 = HEIGHT - x_ticks_height - x_ticks_labels_margin - x_ticks_labels_height - x_title_margin - x_title_height - margins[2];
    let graph_width = graph_x2 - graph_x1,
        graph_height = graph_y2 - graph_y1;

    out += `<mask id="graph_mask">
                <!-- Everything under a white pixel will be visible -->
                <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="black" />
                <!-- Everything under a white pixel will be visible -->
                <rect x="${graph_x1}" y="${graph_y1}" width="${graph_width}" height="${graph_height}" fill="white" />
            </mask>`;





    // let bg_box = `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="grey"/>`
    // out += bg_box;

    // let title_box = `<rect x="0" y="0" width="${WIDTH}" height="${title_height}" fill="red"/>`
    // out += title_box;

    // let graph_box = `<rect x="${graph_x1}" y="${graph_y1}" width="${graph_width}" height="${graph_height}" fill="blue"/>`
    // out += graph_box;

    // let y_title_x1 = margins[3],
    //     y_title_y1 = title_height + margins[0];
    // let y_title_height = graph_height;
    // let y_title_box = `<rect x="${y_title_x1}" y="${y_title_y1}" width="${y_title_width}" height="${y_title_height}" fill="green"/>`
    // out += y_title_box;

    // let x_title_x1 = graph_x1,
    //     x_title_y1 = HEIGHT - x_title_height - margins[2];
    // let x_title_width = graph_width;
    // let x_title_box = `<rect x="${x_title_x1}" y="${x_title_y1}" width="${x_title_width}" height="${x_title_height}" fill="lime"/>`
    // out += x_title_box;


    // let y_ticks_labels_x1 = margins[3] + y_title_width + y_title_margin,
    //     y_ticks_labels_y1 = title_height + margins[0];
    // let y_ticks_labels_height = graph_height;
    // let y_ticks_labels_box = `<rect x="${y_ticks_labels_x1}" y="${y_ticks_labels_y1}" width="${y_ticks_labels_width}" height="${y_ticks_labels_height}" fill="orange"/>`
    // out += y_ticks_labels_box;

    // let x_ticks_labels_x1 = graph_x1,
    //     x_ticks_labels_y1 = HEIGHT - x_ticks_labels_height - x_title_margin - x_title_height - margins[2];
    // let x_ticks_labels_width = graph_width;
    // let x_ticks_labels_box = `<rect x="${x_ticks_labels_x1}" y="${x_ticks_labels_y1}" width="${x_ticks_labels_width}" height="${x_ticks_labels_height}" fill="yellow"/>`
    // out += x_ticks_labels_box;


    // let y_ticks_x1 = margins[3] + y_title_width + y_title_margin + y_ticks_labels_width + y_ticks_labels_margin,
    //     y_ticks_y1 = title_height + margins[0];
    // let y_ticks_height = graph_height;
    // let y_ticks_box = `<rect x="${y_ticks_x1}" y="${y_ticks_y1}" width="${y_ticks_width}" height="${y_ticks_height}" fill="purple"/>`
    // out += y_ticks_box;

    // let x_ticks_x1 = graph_x1,
    //     x_ticks_y1 = HEIGHT - x_ticks_height - x_ticks_labels_margin - x_ticks_labels_height - x_title_margin - x_title_height - margins[2];
    // let x_ticks_width = graph_width;
    // let x_ticks_box = `<rect x="${x_ticks_x1}" y="${x_ticks_y1}" width="${x_ticks_width}" height="${x_ticks_height}" fill="pink"/>`
    // out += x_ticks_box;






    function math2svg(xm,ym) {
        let xsvg = graph_x1 + graph_width * xm / (max_x - min_x);
        let ysvg = graph_y1 + graph_height * (1 - ym / (max_y - min_y));
        return [xsvg,ysvg];
    }

    let x_axis = `<line x1="${graph_x1}" y1="${graph_y2}" x2="${graph_x2}" y2="${graph_y2}" stroke="black" stroke-linecap="square"/>`;
    let y_axis = `<line x1="${graph_x1}" y1="${graph_y1}" x2="${graph_x1}" y2="${graph_y2}" stroke="black" stroke-linecap="square"/>`;
    out += x_axis;
    out += y_axis;

    for (x_tick = min_x%x_ticks_step; x_tick <= max_x; x_tick += x_ticks_step) {
        let xsvg = graph_x1 + graph_width * x_tick / (max_x - min_x);
        let tick = `<line x1="${xsvg}" y1="${graph_y2}" x2="${xsvg}" y2="${graph_y2+x_ticks_height}" stroke="black" />`;
        out += tick;
        let x_tick_label = `<text font-size="12px" font-family="CMU" x="${xsvg}" y="${graph_y2+x_ticks_height+x_ticks_labels_margin}" alignment-baseline="hanging" text-anchor="middle">${x_tick}</text>`
        out += x_tick_label;
    }

    for (y_tick = min_y%y_ticks_step; y_tick <= max_y; y_tick += y_ticks_step) {
        let ysvg = graph_y1 + graph_height * (1 - y_tick / (max_y - min_y));
        let tick = `<line x1="${graph_x1}" y1="${ysvg}" x2="${graph_x1-y_ticks_width}" y2="${ysvg}" stroke="black" />`;
        out += tick;
        let y_tick_label = `<text font-size="12px" font-family="CMU" x="${graph_x1-y_ticks_width-y_ticks_labels_margin}" y="${ysvg}" alignment-baseline="middle" text-anchor="end">${y_tick}</text>`
        out += y_tick_label;
    }

    let title_x = WIDTH/2,
        title_y = title_height/2;
    // out += title;

    let y_title_x = margins[3] + y_title_width/2,
        y_title_y = graph_y1 + graph_height/2;
    let y_title = `<text font-size="16px" font-family="CMU" transform="translate(${y_title_x},${y_title_y}) rotate(-90)" alignment-baseline="middle" text-anchor="middle">Y axis title</text>`
    out += y_title;

    let x_title_x = graph_x1 + graph_width/2,
        x_title_y = HEIGHT - margins[2] - x_title_height/2;
    let x_title = `<text font-size="16px" font-family="CMU" x="${x_title_x}" y="${x_title_y}" alignment-baseline="middle" text-anchor="middle">X axis title</text>`
    out += x_title;

    for (series of series_list) {
        let group = `<g opacity="${series.opacity}" mask="url(#graph_mask)">`;
        let line = `<polyline fill="none"
                              opacity="${series.line_opacity}"
                              stroke="${series.color}"
                              stroke-width="${series.line_width}"
                              points="`
        for (idx in series.x) {
            let [xsvg, ysvg] = math2svg(series.x[idx], series.y[idx]);
            let r = series.radii[idx];
            let marker = `<circle cx="${xsvg}"
                                  cy="${ysvg}"
                                  r="${r}"
                                  fill="${series.color}"
                                  opacity="${series.marker_opacity}"
                                  stroke="${series.marker_stroke_color}"
                                  stroke-width="${series.marker_stroke_width}"
                                  stroke-opacity="${series.marker_stroke_opacity}"
                                  stroke-alignment="${series.marker_stroke_alignment}"
                                  />`;
            group += marker;
            line += ` ${xsvg},${ysvg} `;
        }
        line += '"/>';
        group += line
        group += '</g>';
        out += group;
    }

    return out;
}