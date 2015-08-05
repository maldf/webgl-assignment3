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

CADObject.prototype.addPoints = function(p, col)
{
    col = [Math.random(), Math.random(), Math.random(), 1];
    var points = flatten(p.concat(col));

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
function Cube(color) 
{
    CADObject.call(this);
    this.color = color;
}
Cube.prototype = Object.create(CADObject.prototype);

Cube.prototype.addVertices = function()
{
    const vert = [
        [-1, -1,  1],
        [-1,  1,  1],
        [ 1,  1,  1],
        [ 1, -1,  1],
        [-1, -1, -1],
        [-1,  1, -1],
        [ 1,  1, -1],
        [ 1, -1, -1]
    ];

    for (var i = 0; i < vert.length; ++i) {
        this.addPoints(vert[i], this.color);
    }
    
    // drawn as 2x TRIANGLE_FAN
    const topology = [
        2, 1, 0, 3, 7, 6, 5, 1,
        4, 0, 1, 5, 6, 7, 3, 0
    ];

    this.addTopology(topology);
}

Cube.prototype.draw = function()
{
    gl.drawElements(gl.TRIANGLE_FAN, 8, gl.UNSIGNED_SHORT, this.elemIdx);
    gl.drawElements(gl.TRIANGLE_FAN, 8, gl.UNSIGNED_SHORT, this.elemIdx + 8 * ELEM_DATA_SIZE);
}

//-------------------------------------------------------------------------------------------------
function Sphere(color, recurse) {
    CADObject.call(this);
    this.color = color;
    this.recurse = recurse || 2;
}
Sphere.prototype = Object.create(CADObject.prototype);

Sphere.prototype.addMeshPoint = function(p) 
{
    // add points normalized to unit circle length
    normalize(p);
    this.vert.push(p);
    // return index
    return this.vert.length - 1;
}

Sphere.prototype.addVertices = function() 
{
    // create sphere from icosahedron
    // http://blog.andreaskahler.com/2009/06/creating-icosphere-mesh-in-code.html
    // create 12 vertices of a icosahedron
    var t = (1.0 + Math.sqrt(5.0)) / 2.0;
    this.vert = [];
    this.addMeshPoint([-1,  t,  0]);
    this.addMeshPoint([ 1,  t,  0]);
    this.addMeshPoint([-1, -t,  0]);
    this.addMeshPoint([ 1, -t,  0]);

    this.addMeshPoint([ 0, -1,  t]);
    this.addMeshPoint([ 0,  1,  t]);
    this.addMeshPoint([ 0, -1, -t]);
    this.addMeshPoint([ 0,  1, -t]);

    this.addMeshPoint([ t,  0, -1]);
    this.addMeshPoint([ t,  0,  1]);
    this.addMeshPoint([-t,  0, -1]);
    this.addMeshPoint([-t,  0,  1]);
   
    var faces = [];
    // 5 faces around point 0
    faces.push([0, 11, 5]);
    faces.push([0, 5, 1]);
    faces.push([0, 1, 7]);
    faces.push([0, 7, 10]);
    faces.push([0, 10, 11]);

    // 5 adjacent faces
    faces.push([1, 5, 9]);
    faces.push([5, 11, 4]);
    faces.push([11, 10, 2]);
    faces.push([10, 7, 6]);
    faces.push([7, 1, 8]);

    // 5 faces around point 3
    faces.push([3, 9, 4]);
    faces.push([3, 4, 2]);
    faces.push([3, 2, 6]);
    faces.push([3, 6, 8]);
    faces.push([3, 8, 9]);

    // 5 adjacent faces
    faces.push([4, 9, 5]);
    faces.push([2, 4, 11]);
    faces.push([6, 2, 10]);
    faces.push([8, 6, 7]);
    faces.push([9, 8, 1]);

    // refine triangles
    for (var i = 0; i < this.recurse; ++i) {
        var faces2 = [];
        for (var j = 0; j < faces.length; ++j) {
            var tri = faces[j];
            // replace triangle by 4 triangles
            var a = this.addMeshPoint(mix(this.vert[tri[0]], this.vert[tri[1]], 0.5));
            var b = this.addMeshPoint(mix(this.vert[tri[1]], this.vert[tri[2]], 0.5));
            var c = this.addMeshPoint(mix(this.vert[tri[2]], this.vert[tri[0]], 0.5));

            faces2.push([tri[0], a, c]);
            faces2.push([tri[1], b, a]);
            faces2.push([tri[2], c, b]);
            faces2.push([a, b, c]);
        }
        faces = faces2;
    }
    
    // send final vertices to GPU buffer
    for (var i = 0; i < this.vert.length; ++i) {
        this.addPoints(this.vert[i], this.color);
    }
   
    var topo = [];
    for (var i = 0; i < faces.length; ++i) {
        topo = topo.concat(faces[i]);
    }
    this.addTopology(topo);
    this.triangleCnt = faces.length;
}

Sphere.prototype.draw = function() 
{
    gl.drawElements(gl.TRIANGLES, this.triangleCnt * 3, gl.UNSIGNED_SHORT, this.elemIdx);
}

//-------------------------------------------------------------------------------------------------
function Cone(color, angle) {
    CADObject.call(this);
    this.color = color;
    this.angle = angle;
    this.segments = 0;
}
Cone.prototype = Object.create(CADObject.prototype);

Cone.prototype.addVertices = function() 
{
    // circle in y = -1 plane
    var vert = [];
    vert.push([0, -1, 0]);
    this.segments = Math.ceil(360 / this.angle);
    for (var i = 0; i <= this.segments; ++i) {
        var alpha = i *  2 * Math.PI / this.segments;
        vert.push([Math.cos(alpha), -1, Math.sin(alpha)]);
    }
    // cone point
    vert.push([0, 0, 0]); 
 
    for (var i = 0; i < vert.length; ++i) {
        this.addPoints(vert[i], this.color);
    }

    // topology
    var topo = [];
    for (var i = 0; i < this.segments + 2; ++i) {
        topo.push(i);
    }
    topo.push(this.segments + 2);
    for (var i = 1; i < this.segments + 2; ++i) {
        topo.push(i);
    }
    this.addTopology(topo);
}

Cone.prototype.draw = function() 
{
    gl.drawElements(gl.TRIANGLE_FAN, this.segments + 2, gl.UNSIGNED_SHORT, this.elemIdx);
    gl.drawElements(gl.TRIANGLE_FAN, this.segments + 2, gl.UNSIGNED_SHORT, this.elemIdx + (this.segments + 2) * ELEM_DATA_SIZE);
}

//-------------------------------------------------------------------------------------------------
function Cylinder(color, angle) {
    CADObject.call(this);
    this.color = color;
    this.angle = angle;
    this.segments = 0;
}
Cylinder.prototype = Object.create(CADObject.prototype);

Cylinder.prototype.addVertices = function() 
{
    // bottom circle in y = -1 plane
    var vert = [];
    vert.push([0, 0, 0]);
    this.segments = Math.ceil(360 / this.angle);
    for (var i = 0; i <= this.segments; ++i) {
        var alpha = i *  2 * Math.PI / this.segments;
        vert.push([Math.cos(alpha), 0, Math.sin(alpha)]);
    }
    // top circle in y = 1 plane
    vert.push([0, 1, 0]); 
    for (var i = 0; i <= this.segments; ++i) {
        var alpha = i *  2 * Math.PI / this.segments;
        vert.push([Math.cos(alpha), 1, Math.sin(alpha)]);
    }

    for (var i = 0; i < vert.length; ++i) {
        this.addPoints(vert[i], this.color);
    }

    // topology
    var topo = [];
    // top and bottom with TRIANGLE_FAN
    for (var i = 0; i < vert.length; ++i) {
        topo.push(i);
    }
    // draw sides with TRIANGLE_STRIP
    for (var i = 1; i <= this.segments; ++i) {
        topo.push(i);
        topo.push(this.segments + 2 + i);
    }
    // close circle
    topo.push(1);
    topo.push(this.segments + 3);
    this.addTopology(topo);
}

Cylinder.prototype.draw = function() 
{
    gl.drawElements(gl.TRIANGLE_FAN, this.segments + 2, gl.UNSIGNED_SHORT, this.elemIdx);
    gl.drawElements(gl.TRIANGLE_FAN, this.segments + 2, gl.UNSIGNED_SHORT, this.elemIdx + (this.segments + 2) * ELEM_DATA_SIZE);
    gl.drawElements(gl.TRIANGLE_STRIP, this.segments * 2 + 2, gl.UNSIGNED_SHORT, this.elemIdx + 2 * (this.segments + 2) * ELEM_DATA_SIZE);
}

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

    //objs.push(new Cube([1, 0, 0, 1]));
    objs.push(new Sphere([0, 1, 1, 1]));
    objs.push(new Cone([0, 1, 0, 1], 10));
    objs.push(new Cylinder([0, 0, 1, 1], 10))
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

    requestAnimFrame(render);
}

