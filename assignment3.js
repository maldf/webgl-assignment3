"use strict";

var canvas;
var gl;
var vBuffer;
var iBuffer;
var vBufferIdx;
var iBufferIdx;

/*
var mouse_btn = false;              // state of mouse button
var index = 0;                      // index into ARRAY_BUFFER on GPU

function Point(x, y) {
    this.x = x;
    this.y = y;
}
var lineColor = vec4(0, 0, 1, 1);   // current line color selected
var lineWidth = 1;                  // current line width selected

// store metadata about each line 
function Poly(start, count, width) {
    this.start = start;             // start index in ARRAY_BUFFER
    this.count = count;             // number of line segments in polygon
    this.width = width;             // line width
    // color is send down with each vertex
}
var lines = [];                     // all lines drawn on canvas

*/

const NUM_VERTS = 20000;
const VERT_DATA_SIZE = 28;

const NUM_ELEMS = 10000;  
const ELEM_DATA_SIZE = Uint16Array.BYTES_PER_ELEMENT;

var objs = [];

var theta = [0, 0, 0];
var thetaLoc;

//-------------------------------------------------------------------------------------------------
function CADObject() 
{
    this.vertIdx = -1;
    this.elemIdx = -1;
}

CADObject.prototype.addPoints = function(p)
{
    var points = flatten(p);

    gl.bufferSubData(gl.ARRAY_BUFFER, vBufferIdx, points);
    if (this.vertIdx == -1) {
        this.vertIdx = vBufferIdx;
    }
    vBufferIdx += points.length * 4;
}

CADObject.prototype.addTopology = function(t)
{
    // adjust element indexes to point to vertexes in vertex array
    var topo = [];
    for (var i = 0; i < t.length; ++i) {
        topo.push(t[i] + (this.vertIdx / VERT_DATA_SIZE));
    }
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, iBufferIdx, new Uint16Array(topo)); 
    this.elemIdx = iBufferIdx;
    iBufferIdx += topo.length * ELEM_DATA_SIZE;
}

//-------------------------------------------------------------------------------------------------
/*
const vertices = [
    [-1, -1,  1, 0, 0, 0, 1],
    [-1,  1,  1, 0, 0, 1, 1],
    [ 1,  1,  1, 0, 1, 0, 1],
    [ 1, -1,  1, 0, 1, 1, 1],
    [-1, -1, -1, 1, 0, 0, 1],
    [-1,  1, -1, 1, 0, 1, 1],
    [ 1,  1, -1, 1, 1, 0, 1],
    [ 1, -1, -1, 1, 1, 1, 1]
];
*/
const vertices = [
    [-1, -1,  1],
    [-1,  1,  1],
    [ 1,  1,  1],
    [ 1, -1,  1],
    [-1, -1, -1],
    [-1,  1, -1],
    [ 1,  1, -1],
    [ 1, -1, -1]
];

// drawn as TRIANGLE_FAN
const topology = [
    2, 1, 0, 3, 7, 6, 5, 1,
    4, 0, 1, 5, 6, 7, 3, 0
];

function Cube(color) 
{
    CADObject.call(this);
    this.color = color;
}
Cube.prototype = Object.create(CADObject.prototype);

Cube.prototype.addVertices = function()
{
    for (var i = 0; i < vertices.length; ++i) {
        var v = vertices[i].concat(this.color);
        this.addPoints(v);
    }
    this.addTopology(topology);
}

Cube.prototype.draw = function()
{
    gl.drawElements(gl.TRIANGLE_FAN, topology.length / 2, gl.UNSIGNED_SHORT, this.elemIdx);
    gl.drawElements(gl.TRIANGLE_FAN, topology.length / 2, gl.UNSIGNED_SHORT, this.elemIdx + (topology.length / 2) * ELEM_DATA_SIZE);
}


//-------------------------------------------------------------------------------------------------
function Sphere(color) {
    CADObject.call(this);
    this.color = color;
}
Sphere.prototype = Object.create(CADObject.prototype);
Sphere.prototype.addVertices = function() {}
Sphere.prototype.draw = function() {}


//-------------------------------------------------------------------------------------------------
window.onload = function init()
{
    canvas = document.getElementById("gl-canvas");

    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) { 
        alert("WebGL isn't available"); 
    }

    //  Configure WebGL
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.9, 0.9, 0.9, 1.0);
    gl.enable(gl.DEPTH_TEST);

    //  Load shaders and initialize attribute buffers
    var program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // Load the data into the GPU
    vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, NUM_VERTS * VERT_DATA_SIZE, gl.STATIC_DRAW);
    vBufferIdx = 0;
    
    iBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, NUM_ELEMS * ELEM_DATA_SIZE, gl.STATIC_DRAW); 
    iBufferIdx = 0;

    // Associate shader variables with our data buffer
    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 7 * 4, 0);
    gl.enableVertexAttribArray(vPosition);
    var vColor = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 7 * 4, 3 * 4);
    gl.enableVertexAttribArray(vColor);

    // catch mouse down in canvas, catch other mouse events in whole window
    //window.addEventListener("mousemove", mouse_move);
    //window.addEventListener("mouseup",   mouse_up);
    //canvas.addEventListener("mousedown", mouse_down);
 
    thetaLoc = gl.getUniformLocation(program, "theta");

    objs.push(new Cube([1, 0, 0, 1]));
    //objs.push(new Cube([0, 0, 1, 1]));
    objs.push(new Sphere([0, 1, 0, 1]));
    for (var i = 0; i < objs.length; ++i) {
        objs[i].addVertices();
    }
    
    render();

    // handle color pickers
    // line color
    /*
    document.getElementById("color-picker").value = "#2050ff";          // default
    lineColor = convert_string_to_rgb(document.getElementById("color-picker").value);
    document.getElementById("color-picker").oninput = function() {
    
    thetaLoc - gl.getUniformLocation(program, "theta");
    lineColor = convert_string_to_rgb(this.value);
    }
    // canvas color
    document.getElementById("color-picker-canvas").value = "#e0e0e0";   // default
    var cc = convert_string_to_rgb(document.getElementById("color-picker-canvas").value);
    gl.clearColor(cc[0], cc[1], cc[2], 1.0);
    document.getElementById("color-picker-canvas").oninput = function() {
        var cc = convert_string_to_rgb(this.value);
        gl.clearColor(cc[0], cc[1], cc[2], 1.0);
        render();
    }
   
    // handle line width selector
    document.getElementById("sel-linewidth").value = 1;     // default
    document.getElementById("sel-linewidth").oninput = function() {
        lineWidth = this.value;
        document.getElementById("disp-linewidth").innerHTML = lineWidth;
    };

    // handle undo
    document.getElementById("btn-undo").onclick = function() {
        var line = lines.pop();
        if (line) {
            index = line.start;
        }
        document.getElementById("status").innerHTML = "";
        render();
    }
    
    // handle clear
    document.getElementById("btn-clear").onclick = function() {
        lines = [];
        index = 0;
        document.getElementById("status").innerHTML = "";
        render();
    }
    */
}

//-------------------------------------------------------------------------------------------------
/*
// convert string "#rrggbb" to vec4() with rgb color
function convert_string_to_rgb(str) {
    var color = undefined;
    // value should be in format "#rrggbb"
    // TODO: better error checking
    if (str) {
        var val = parseInt(str.slice(1), 16);
        color = vec4(((val >> 16) & 0xff) / 255, 
                     ((val >>  8) & 0xff) / 255, 
                      (val & 0xff) / 255, 1);
    }
    return color;
}

//-------------------------------------------------------------------------------------------------
// get mouse position and convert to clip coordinates
function mouse_to_canvas_coords(ev)
{
    var rect = canvas.getBoundingClientRect();
    // subtract 1 for border size and padding as set in stylesheet
    var mx = ev.clientX - rect.left - 1;
    var my = ev.clientY - rect.top - 1;

    var p = new Point(2 * mx / canvas.width - 1, 1 - 2 * my / canvas.height);
    return p;
}

//-------------------------------------------------------------------------------------------------
function add_point(ev)
{
    if (index < NUMPOINTS) {
        var pos = mouse_to_canvas_coords(ev);
        // each point is a position(vec2) and a color(vec4)
        var p = vec2(pos.x, pos.y).concat(lineColor);
        gl.bufferSubData(gl.ARRAY_BUFFER, POINT_DATA_SIZE * index, flatten(p));
        index++;
        return true;
    } else {
        document.getElementById("status").innerHTML = NUMPOINTS + " point limit reached";
        return false;
    }
}

//-------------------------------------------------------------------------------------------------
function mouse_move(ev)
{
    if (mouse_btn) {
        // send next point and its color to GPU 
        if (add_point(ev)) {
            lines[lines.length - 1].count++;
            render();
        }
    }
}

//-------------------------------------------------------------------------------------------------
function mouse_up(ev)
{
    // include endpoint in line
    mouse_move(ev);
    mouse_btn = false;
}

//-------------------------------------------------------------------------------------------------
function mouse_down(ev)
{
    // start new line segment,
    // send 1st point and its color to GPU
    if (add_point(ev)) {
        lines.push(new Poly(index - 1, 0, lineWidth));
        mouse_btn = true;
    }
}
*/

//-------------------------------------------------------------------------------------------------
function render()
{
    theta[0] += 0.4;
    theta[1] += 0.13;
    theta[2] += 0.07;
    gl.uniform3fv(thetaLoc, theta);
    
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    for (var i = 0; i < objs.length; ++i) {
        objs[i].draw();
    }

    //requestAnimFrame(render);
}

