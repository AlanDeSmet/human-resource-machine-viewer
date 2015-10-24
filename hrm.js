/*
This file is part of human-resource-machine-viewer, 
copyright 2015 Alan De Smet.

human-resource-machine-viewer is free software you can
redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option)
any later version.

human-resource-machine-viewer is distributed in the hope that it
will be useful, but WITHOUT ANY WARRANTY; without even the
implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
PURPOSE.  See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with human-resource-machine-view.  If not, see
<http://www.gnu.org/licenses/>.
*/

function hrm_viewer() {

////////////////////////////////////////////////////////////////////////////////
function simple_svg(width, height) {
	var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute('version', '1.1');
	svg.setAttribute('baseProfile', 'full');
	svg.setAttribute('width', width);
	svg.setAttribute('height', height);
	svg.setAttribute('xmlns', "http://www.w3.org/2000/svg");
	this.svg = svg;


	this.new_el = function(name) {
		return document.createElementNS(this.svg.namespaceURI,name);
	}

	var marker_size = 2.75;
	var path = this.new_el('path');
	path.setAttribute('d', "M0,0"+" "+
		"L0,"+marker_size+" "+
		"L"+marker_size+","+(marker_size/2)+" "+
		"Z");
	//path.setAttribute('stroke', 'red');
	path.setAttribute('stroke-width', 0);
	path.setAttribute('class', 'jumppatharrow');

	var marker = this.new_el('marker');
	marker.setAttribute('id', 'markerArrow');
	marker.setAttribute('markerWidth', marker_size);
	marker.setAttribute('markerHeight', marker_size);
	marker.setAttribute('refX', '0');
	marker.setAttribute('refY', marker_size/2);
	marker.setAttribute('orient', 'auto');
	marker.setAttribute('markerUnits', 'strokeWidth');
	marker.appendChild(path);

	var defs = this.new_el('defs');
	defs.appendChild(marker);
	this.svg.appendChild(defs);

	this.rect = function(x,y,width,height, color) {
		var e = this.new_el('rect');
		e.setAttribute('x',x);
		e.setAttribute('y',y);
		e.setAttribute('width',width);
		e.setAttribute('height',height);
		e.setAttribute('fill',color);
		this.svg.appendChild(e);
	}

	this.circle = function(x, y, radius, color) {
		var e = this.new_el('circle');
		e.setAttribute('cx',x);
		e.setAttribute('cy',y);
		e.setAttribute('r',radius);
		e.setAttribute('fill',color);
		this.svg.appendChild(e);
	}

	this.polyline = function(points, width, color) {
		var e = this.new_el('polyline');
		var pts = "";
		for(var i = 0; i < points.length; i++) {
			pts += points[i][0] + " " + points[i][1] + " ";
		}
		e.setAttribute('points', pts);
		e.setAttribute('stroke-linecap', 'round');
		e.setAttribute('stroke', color);
		e.setAttribute('fill', 'transparent');
		e.setAttribute('stroke-width', width);
		this.svg.appendChild(e);
	}

	this.path = function(command, thisclass) {
		var e = this.new_el('path');
		e.setAttribute('d', command);
		//e.setAttribute('stroke-linecap', 'round');
		//e.setAttribute('stroke', color);
		e.setAttribute('class', thisclass);
		e.setAttribute('fill', 'transparent');
		e.setAttribute('style', 'marker-end: url(#markerArrow)');
		//e.setAttribute('stroke-width', width);
		this.svg.appendChild(e);
	}
}

////////////////////////////////////////////////////////////////////////////////
function new_hrm_label_svg(max_width, height, enclabel) {

	var brush_width = Math.min(max_width,height)/10;
	var zlib = window.atob(enclabel);
	var zlibu8 = new Uint8Array(zlib.length);
	for(var i = 0; i < zlib.length; i++) {
		zlibu8[i] = zlib.charCodeAt(i);
	}
	var raw = pako.inflate(zlibu8);

	var hrm_max = 65535;


	var dv = new DataView(raw.buffer);
	var elements = dv.getUint16(0, true);
	var points = [];
	var list_points = [];

	var min_x = hrm_max;
	var max_x = 0;
	for(var i = 0; i < elements && (i*4+6)<= raw.length; i++) {
		var index = i*4+4;
		var x = dv.getUint16(index, true);
		var y = dv.getUint16(index+2, true);
		if(x == 0 && y == 0) {
			list_points.push(points);
			points = [];
		} else {
			points.push([x,y]);
			max_x = Math.max(max_x, x);
			min_x = Math.min(min_x, x);
		}
	}

	for(var i = 0; i < list_points.length; i++) {
		for(var j = 0; j < list_points[i].length; j++) {
			list_points[i][j][0] = list_points[i][j][0] - min_x;
			list_points[i][j][0] =
			rescale_label(list_points[i][j][0], hrm_max, max_width) + brush_width*2;
			list_points[i][j][1] = rescale_label(list_points[i][j][1], hrm_max, height);
		}
	}

	var width = ((max_x - min_x)*max_width)/hrm_max + brush_width*4;
	if(max_x < min_x) { width = max_width; }

	var new_svg = new simple_svg(width,height);
	for(var i = 0; i < list_points.length; i++) {
		var points = list_points[i];
		if(points.length == 0) {
		} else if(points.length == 1) {
			new_svg.circle(points[0][0], points[0][1], brush_width, 'black');
		} else {
			new_svg.polyline(points, brush_width, 'black');
		}
	}

	return new_svg.svg;
}

function rescale_label(x, oldmax, newmax) {
	return x * newmax / oldmax;
}

////////////////////////////////////////////////////////////////////////////////



var re_asm_comment = /^--/;
var re_jump_dst = /^(\S+):/;
var re_whitespace = /\s+/;
var re_define = /^DEFINE\s+(\S+)\s+(\S+)/i;
var re_memory_addr = /^\d+$/;
var re_memory_indirect = /^\[(d+)\]$/;

function tokenize_line(line) {
	var match;

	line = line.replace(/^\s+/, '');
	line = line.replace(/\s+$/, '');

	if(line == "") { return [ 'blank' ]; }
	if(match = re_jump_dst.exec(line)) { return ['jumpdst', match[1]]; }
	if(re_asm_comment.test(line)) { return ['asm_comment', line]; }

	var tokens = line.split(re_whitespace);

	var cmd = tokens[0].toLowerCase();

	var onearg = ['copyfrom', 'copyto', 'bumpup', 'bumpdown', 'jump', 'jumpn', 'jumpz', 'add', 'sub', 'comment'];
	var zeroarg = ['inbox', 'outbox'];

	if(tokens.length == 2) {
		for(var i = 0; i < onearg.length; i++) {
			if(cmd == onearg[i]) { return [cmd, tokens[1]]; }
		}
	} else if(tokens.length == 1) {
		for(var i = 0; i < zeroarg.length; i++) {
			if(cmd == zeroarg[i]) { return [cmd]; }
		}
	}

	return [ 'invalid', line ];
}

function is_code(cmd) {
	if(cmd == 'invalid' || cmd == 'blank' || cmd == 'jumpdst' || cmd == 'asm_comment' || cmd == 'comment') { return 0; }
	return 1;
}

function count_code_lines(lines) {
	var code_lines = 0;
	for(var i = 0; i < lines.length; i++) {
		var tokens = tokenize_line(lines[i]);
		if(is_code(tokens[0])) {
			code_lines++;
		}
	}
	return code_lines;
}

function extract_labels(ilines) {
	var out = {};
	out.olines = [];
	out.labels = {};
	out.labels['comment'] = {};
	out.labels['label'] = {};
	for(var i = 0; i < ilines.length; i++) {
		var thisline = ilines[i];
		//console.log(i,thisline);
		if(match = re_define.exec(thisline)) {
			//console.log('hit');
			var body = '';
			var more = 1;
			while(more) {
				i++;
				var line = ilines[i];
				line = line.replace(/^\s+/, '');
				line = line.replace(/\s+$/, '');
				if(/;$/.test(line)) {
					line = line.replace(/;$/, '');
					more = 0;
				}
				body += line;
				if(i >= ilines.length) { more = 0; }
			}
			var mytype = match[1].toLowerCase();
			out.labels[mytype][match[2]] = body;
			//console.log(mytype,">"+match[2]+"->",body);
		} else {
			//console.log('miss');
			out.olines.push(thisline);
		}
	}

	return out;
}

function create_jump_diagram(width, height, offset_left, offset_top, srcs, dsts) {
	var new_svg = new simple_svg(width, height);
	//new_svg.rect(0,0,table_width,table_height, 'green');

	var max_start_x = 0;
	var gaps = [];
	for(var i = 0; i < srcs.length; i++) {
		var src = srcs[i]['el'];
		var start_x = src.offset().left + src.outerWidth() - offset_left;
		if(max_start_x < start_x) { max_start_x = start_x; }
		var sy = src.offset().top;

		var label = srcs[i]['dst'];
		if(label in dsts) {
			var dst = dsts[label];
			var dy = dst.offset().top;
			gaps.push(Math.abs(dy-sy));
		}
	}
	gaps.sort(function(a,b){ return a-b; });

	// A "transit" is the point on the arc furthest to the right.  We try to
	// space them out evenly.
	var first_transit = max_start_x + 0;
	var transit_width = 10;
	var last_transit = width - transit_width;
	var num_transits = Math.floor((last_transit - first_transit)/transit_width + 1);

	var transit_breaks = [];
	var gaps_per_transit = gaps.length / num_transits;
	for(var i = 0; i < num_transits; i++) {
		transit_breaks.push(gaps[Math.floor(gaps_per_transit*i)]);
	}
	//console.log("transits",num_transits);
	//console.log("gaps_per_transit",gaps_per_transit);
	//console.log("gaps", gaps);
	//console.log("transit_breaks", transit_breaks);

	for(var i = 0; i < srcs.length; i++) {
		var label = srcs[i]['dst'];
		var src = srcs[i]['el'];
		if(label in dsts) {
			var dst = dsts[label];

			var startx = src.offset().left-offset_left + src.outerWidth();
			var starty = src.offset().top-offset_top + src.outerHeight()/2;

			var endx = dst.offset().left-offset_left + dst.outerWidth() + 25;
			var endy = dst.offset().top-offset_top + dst.outerHeight()/2;

			var gap_y = Math.abs(endy-starty);
			var transit = 0;
			for(transit = 0; transit < transit_breaks.length; transit++) {
				if(gap_y < transit_breaks[transit]) { break; }
			}
			var mid_x = first_transit + transit*transit_width;
			//console.log("(gap:",gap_y,")",first_transit,"+",transit,"*",transit_width,"=",mid_x);

			var mid_y = (starty + endy) / 2;
			var bcurve_y = (starty - endy) / 2;
			var path_cmd = ["M", startx, starty,
				"C", startx + 20, starty,
					mid_x, mid_y + bcurve_y,
					mid_x, mid_y,
				"C", mid_x, mid_y - bcurve_y,
					endx + 20, endy,
					endx, endy
					].join(" ");
			new_svg.path(path_cmd,'jumppath');
		} else {
			console.log("jump label", label, "lacks a matching destination");
		}
	}

	return new_svg.svg;
}

this.append_code_table = function(id, data) {
	var root_div = $('#'+id);

	var lines = data.split(new RegExp('\r?\n'));

	var root = $(document.createElement('table'));
	
	if(lines[0] == "-- HUMAN RESOURCE MACHINE PROGRAM --") { lines.shift(); }

	var labels = extract_labels(lines);
	lines = labels.olines;

	var dsts = {};
	var srcs = [];


	var num_len = 2;
	var pad = "00000";
	// TODO: This is the wrong way to count lines; many aren't.
	var code_lines = count_code_lines(lines);
	if(code_lines.length > 9999) { num_len = 5; }
	else if(code_lines.length > 999) { num_len = 4; }
	else if(code_lines.length > 99) { num_len = 3; } 
	var line_number = 0;
	for(var i = 0; i < lines.length; i++) {
		var tokens = tokenize_line(lines[i]);
		if(tokens[0] == 'blank') { continue; }
		var newclass = tokens[0];
		var iscode = is_code(tokens[0]);

		var text = newclass;
		var jmpdst;
		if(text == 'bumpup') { text = 'bump +'; }
		else if(text == 'bumpdown') { text = 'bump −'; }
		else if(text == 'asm_comment') {
			text = tokens[1];
			tokens = [];
		} else if(text == 'jumpdst') {
			text = tokens[1];
			tokens = [];
		} else if(text == 'jump' || text == 'jumpn' || text == 'jumpz') {
			jmpdst = tokens[1];
			tokens = [];
		}
		
		var comment_id;
		if(text == 'comment') {
			comment_id = tokens[1];
			if(comment_id in labels.labels['comment']) {
				text = '';
				tokens = [];
			}
		}

		var e_cmd = $(document.createElement('span'));
		e_cmd.text(text);
		e_cmd.addClass(newclass);
		e_cmd.addClass('cmd');

		if(newclass == 'jumpdst') {
			dsts[text] = e_cmd;
		}


		if(newclass == "comment") {
			if(comment_id in labels.labels['comment']) {
				var svg = new_hrm_label_svg(140, 40, labels.labels['comment'][comment_id]);
				svg = $(svg);
				e_cmd.append(svg);
			}
		}

		var e_arg = 0;
		if(tokens.length == 2) {
			e_arg = $(document.createElement('span'));
			e_arg.addClass(newclass);
			e_arg.addClass('arg');
			var tmp;
			if(re_memory_addr.test(tokens[1])) {
				if(tokens[1] in labels.labels['label']) {
					var svg = new_hrm_label_svg(70, 20, labels.labels['label'][tokens[1]]);
					svg = $(svg);
					e_arg.append(svg);
				} else {
					e_arg.text(tokens[1]);
				}
			} else if(tmp = /\[(\d+)\]/.exec(tokens[1])) {
				var num = tmp[1];
				if(num in labels.labels['label']) {
					e_arg.append(document.createTextNode("[ "));
					var svg = new_hrm_label_svg(70, 20, labels.labels['label'][num]);
					svg = $(svg);
					e_arg.append(svg);
					e_arg.append(document.createTextNode(" ]"));
				} else {
					e_arg.text(tokens[1]);
				}
			} else {
				e_arg.text(tokens[1]);
			}
		}
		if(newclass=='jump' || newclass=='jumpn' || newclass=="jumpz") {
			srcs.push({dst:jmpdst, el:e_cmd});
		}

		var new_td_num = $(document.createElement('td'));
		if(iscode) {
			line_number++;
			var linenum = (pad+line_number).slice(-num_len);
			new_td_num.text(linenum);
		}
		new_td_num.addClass('linenum');

		var new_td_code = $(document.createElement('td'));
		new_td_code.append(e_cmd);
		//console.log(tokens[0]);
		if(e_arg) {
			new_td_code.append($(document.createTextNode(' ')));
			new_td_code.append(e_arg);
			//console.log("   "+tokens[1]);
		}

		var new_row = $(document.createElement('tr'));
		new_row.append(new_td_num);
		new_row.append(new_td_code);
		root.append(new_row);
	}

	root_div.append(root);


	var table_pos = root.offset();
	var table_width = root.outerWidth();
	var table_height = root.outerHeight();

	//table_width = 300;
	//table_height = 50;

	var svg = create_jump_diagram(
		table_width + 50, table_height,
		root_div.offset().left, root_div.offset().top,
		srcs, dsts);
	root_div.append(svg);
}

this.download_and_append_code_table = function (id, url) {
	var t = this;
	function code_arrived(data) {
		t.append_code_table(id, data);
	}
	$.get(url, code_arrived, "text")
}


}
