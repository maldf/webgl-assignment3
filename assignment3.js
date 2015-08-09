"use strict";

var canvas;
var gl;
var vBuffer;
var cBuffer;
var iBuffer;
var vBufferIdx;                     // current fill index of vertex buffer
var iBufferIdx;                     // current fill index of element buffer

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

const NUM_VERTS = 50000;
const VERT_DATA_SIZE = 12;          // each vertex = (3 axes ) * sizeof(float)
const COLOR_DATA_SIZE = 16;         // each vertex = (4 colors) * sizeof(float)

const NUM_ELEMS = 50000;  
const ELEM_DATA_SIZE = Uint16Array.BYTES_PER_ELEMENT;

var objs = [];

var mvMatrixLoc;
var prMatrixLoc;
var drawLineLoc;

//-------------------------------------------------------------------------------------------------
function CADObject() 
{
    this.vertIdx = -1;
    this.elemIdx = -1;

    // object in world space
    this.rotate = [0, 0, 0];
    this.scale  = [1, 1, 1];
    this.translate = [0, 0, 0];
}

CADObject.prototype.addPoint = function(p, col)
{
    /*
    var tcol = col.slice();
    for (var i = 0; i < 3; ++i) {
        tcol[i] *= Math.random();
    }
    */
    //var point = flatten(p.concat(col));
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, vBufferIdx * VERT_DATA_SIZE, flatten(p));
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, vBufferIdx * COLOR_DATA_SIZE, flatten(col));
    if (this.vertIdx == -1) {
        // start of object
        this.vertIdx = vBufferIdx;
    }
    vBufferIdx++;
}

CADObject.prototype.addTopology = function(t)
{
    // adjust topology indexes to point to vertices in vertex array
    // with offset this.vertIdx
    var topo = [];
    for (var i = 0; i < t.length; ++i) {
        topo.push(t[i] + this.vertIdx);
    }
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, iBufferIdx * ELEM_DATA_SIZE, new Uint16Array(topo)); 
    if (this.elemIdx == -1) {
        // start of object
        this.elemIdx = iBufferIdx;
    }
    iBufferIdx += topo.length;
}

CADObject.prototype.transform = function(camera)
{
    // transform from instance -> world coordinates
    var s = scalem(this.scale);
    var rx = rotate(this.rotate[0], [1, 0, 0]);
    var ry = rotate(this.rotate[1], [0, 1, 0]);
    var rz = rotate(this.rotate[2], [0, 0, 1]);
    var t = translate(this.translate);
    var r = mult(rz, mult(ry, rx));
    var world = mult(t, mult(r, s));
    // combine with camera transformation to create model-view matrix
    var mv = mult(camera, world);
    gl.uniformMatrix4fv(mvMatrixLoc, gl.FALSE, flatten(mv));
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
        this.addPoint(vert[i], this.color);
    }
    
    // drawn as 2x TRIANGLE_FAN, with vertex 2 and 4 as center
    var topology = [
        2, 1, 0, 3, 7, 6, 5, 1,
        4, 0, 1, 5, 6, 7, 3, 0
    ];
    this.addTopology(topology);

    // draw lines 
    var lineTopology = [
        2, 1, 1, 0, 0, 3, 3, 2, 3, 7, 2, 6, 1, 5, 0, 4,
        4, 5, 5, 6, 6, 7, 7, 4
    ];
    this.addTopology(lineTopology);
}

Cube.prototype.draw = function()
{
    gl.uniform1i(drawLineLoc, 0);
    gl.drawElements(gl.TRIANGLE_FAN, 8, gl.UNSIGNED_SHORT, this.elemIdx * ELEM_DATA_SIZE);
    gl.drawElements(gl.TRIANGLE_FAN, 8, gl.UNSIGNED_SHORT, (this.elemIdx + 8) * ELEM_DATA_SIZE);
    
    gl.uniform1i(drawLineLoc, 1);
    gl.drawElements(gl.LINES, 24, gl.UNSIGNED_SHORT, (this.elemIdx + 16) * ELEM_DATA_SIZE);
}

//-------------------------------------------------------------------------------------------------
function Sphere(color, recurse) {
    CADObject.call(this);
    this.color = color;
    this.recurse = recurse || 3;
}
Sphere.prototype = Object.create(CADObject.prototype);

Sphere.prototype.addMeshPoint = function(p) 
{
    // add points normalized to unit circle length
    normalize(p);
    // only add new points, if already exist, return its index
    for (var i = 0; i < this.vert.length; ++i) {
        if (equal(this.vert[i], p)) {
            return i;
        }
    }
    this.vert.push(p);
    // return vertex index
    return this.vert.length - 1;
}

Sphere.prototype.addVertices = function() 
{
    // create sphere from icosahedron, ref:
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
        this.addPoint(this.vert[i], this.color);
    }
 
    // send triangles to element buffer
    var topo = [];
    for (var i = 0; i < faces.length; ++i) {
        topo = topo.concat(faces[i]);
    }
    this.addTopology(topo);
    this.elemCnt = faces.length * 3;
 
    // lines
    topo = [];
    var lineCache = {};
    var cache_and_add = function(x, y) {
        if (x > y) {
            var tmp = x;
            x = y;
            y = tmp;
        }
        var prop = x + '_' + y;
        if (!lineCache[prop]) {
            lineCache[prop] = 1;
            topo.push(x, y);
        };
    }
    for (var i = 0; i < faces.length; ++i) {
        cache_and_add(faces[i][0], faces[i][1]);
        cache_and_add(faces[i][1], faces[i][2]);
        cache_and_add(faces[i][2], faces[i][0]);
    }
    this.addTopology(topo);
    this.lineCnt = topo.length;
}

Sphere.prototype.draw = function() 
{
    gl.uniform1i(drawLineLoc, 0);
    gl.drawElements(gl.TRIANGLES, this.elemCnt, gl.UNSIGNED_SHORT, this.elemIdx * ELEM_DATA_SIZE);
    
    gl.uniform1i(drawLineLoc, 1);
    gl.drawElements(gl.LINES, this.lineCnt, gl.UNSIGNED_SHORT, (this.elemIdx + this.elemCnt) * ELEM_DATA_SIZE);
}

//-------------------------------------------------------------------------------------------------
function Cone(color, angle) {
    CADObject.call(this);
    this.color = color;
    this.angle = angle || 20;
    this.segments = 0;
}
Cone.prototype = Object.create(CADObject.prototype);

Cone.prototype.addVertices = function() 
{
    // circle in y = -1 plane
    var vert = [];
    vert.push([0, -1, 0]);
    this.segments = Math.ceil(360 / this.angle);
    for (var i = 0; i < this.segments; ++i) {
        var alpha = i *  2 * Math.PI / this.segments;
        vert.push([Math.cos(alpha), -1, Math.sin(alpha)]);
    }
    // cone point
    vert.push([0, 1, 0]); 
 
    for (var i = 0; i < vert.length; ++i) {
        this.addPoint(vert[i], this.color);
    }

    // topology
    var topo = [];
    topo.push(0);
    for (var i = 1; i <= this.segments; ++i) {
        topo.push(i);
    }
    topo.push(1);
    topo.push(this.segments + 1);
    for (var i = 1; i <= this.segments; ++i) {
        topo.push(i);
    }
    topo.push(1);
    this.addTopology(topo);
    
    // lines
    var topo = [];
    for (var i = 1; i < this.segments; ++i) {
        topo.push(i, i + 1);
        topo.push(this.segments + 1, i);
    }
    topo.push(this.segments, 1);
    topo.push(this.segments + 1, this.segments);
    this.addTopology(topo);
    this.lineCnt = topo.length;
}

Cone.prototype.draw = function() 
{
    gl.uniform1i(drawLineLoc, 0);
    gl.drawElements(gl.TRIANGLE_FAN, this.segments + 2, gl.UNSIGNED_SHORT, this.elemIdx * ELEM_DATA_SIZE);
    gl.drawElements(gl.TRIANGLE_FAN, this.segments + 2, gl.UNSIGNED_SHORT, (this.elemIdx + this.segments + 2) * ELEM_DATA_SIZE);
    
    gl.uniform1i(drawLineLoc, 1);
    gl.drawElements(gl.LINES, this.lineCnt, gl.UNSIGNED_SHORT, (this.elemIdx + 2 * (this.segments + 2)) * ELEM_DATA_SIZE);
}

//-------------------------------------------------------------------------------------------------
function Cylinder(color, angle) {
    CADObject.call(this);
    this.color = color;
    this.angle = angle || 20;
    this.segments = 0;
}
Cylinder.prototype = Object.create(CADObject.prototype);

Cylinder.prototype.addVertices = function() 
{
    // bottom circle in y = -1 plane
    var vert = [];
    vert.push([0, -1, 0]);
    this.segments = Math.ceil(360 / this.angle);
    for (var i = 0; i < this.segments; ++i) {
        var alpha = i *  2 * Math.PI / this.segments;
        vert.push([Math.cos(alpha), -1, Math.sin(alpha)]);
    }
    // top circle in y = 1 plane
    vert.push([0, 1, 0]); 
    for (var i = 0; i < this.segments; ++i) {
        var alpha = i *  2 * Math.PI / this.segments;
        vert.push([Math.cos(alpha), 1, Math.sin(alpha)]);
    }

    for (var i = 0; i < vert.length; ++i) {
        this.addPoint(vert[i], this.color);
    }

    // topology
    var topo = [];
    // top and bottom with TRIANGLE_FAN
    topo.push(0);
    for (var i = 1; i <= this.segments; ++i) {
        topo.push(i);
    }
    topo.push(1);
    topo.push(this.segments + 1);
    for (var i = 1; i <= this.segments; ++i) {
        topo.push(this.segments + 1 + i);
    }
    topo.push(this.segments + 2);
    // draw sides with TRIANGLE_STRIP
    for (var i = 1; i <= this.segments; ++i) {
        topo.push(i);
        topo.push(this.segments + 1 + i);
    }
    // close circle
    topo.push(1);
    topo.push(this.segments + 2);
    this.addTopology(topo);
    
    // lines
    var topo = [];
    for (var i = 1; i < this.segments; ++i) {
        topo.push(i, i + 1);
        topo.push(this.segments + i + 1, this.segments + i + 2);
        topo.push(i, this.segments + i + 1);
    }
    // close circle
    topo.push(this.segments, 1);
    topo.push(2 * this.segments + 1, this.segments + 2);
    topo.push(this.segments, 2 * this.segments + 1);

    this.addTopology(topo);
    this.lineCnt = topo.length;
}

Cylinder.prototype.draw = function() 
{
    gl.uniform1i(drawLineLoc, 0);
    gl.drawElements(gl.TRIANGLE_FAN, this.segments + 2, gl.UNSIGNED_SHORT, this.elemIdx * ELEM_DATA_SIZE);
    gl.drawElements(gl.TRIANGLE_FAN, this.segments + 2, gl.UNSIGNED_SHORT, (this.elemIdx + this.segments + 2) * ELEM_DATA_SIZE);
    gl.drawElements(gl.TRIANGLE_STRIP, 2 * this.segments + 2, gl.UNSIGNED_SHORT, (this.elemIdx + 2 * (this.segments + 2)) * ELEM_DATA_SIZE);
    
    gl.uniform1i(drawLineLoc, 1);
    gl.drawElements(gl.LINES, this.lineCnt, gl.UNSIGNED_SHORT, (this.elemIdx + 4 * this.segments + 6) * ELEM_DATA_SIZE);
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
    // Associate shader variables with our data buffer
    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 3 * 4, 0);
    gl.enableVertexAttribArray(vPosition);
    
    cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, NUM_VERTS * COLOR_DATA_SIZE, gl.STATIC_DRAW);
    // Associate shader variables with our data buffer
    var vColor = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 4 * 4, 0);
    gl.enableVertexAttribArray(vColor);
    
    iBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, NUM_ELEMS * ELEM_DATA_SIZE, gl.STATIC_DRAW); 
    iBufferIdx = 0;

    // catch mouse down in canvas, catch other mouse events in whole window
    //window.addEventListener("mousemove", mouse_move);
    //window.addEventListener("mouseup",   mouse_up);
    //canvas.addEventListener("mousedown", mouse_down);
 
    mvMatrixLoc = gl.getUniformLocation(program, "mvMatrix");
    prMatrixLoc = gl.getUniformLocation(program, "prMatrix");
    drawLineLoc = gl.getUniformLocation(program, "drawLine");

    // test objects
    var cube = new Cube([0.8, 0.7, 0, 1]);
    cube.scale = [80, 40, 50];
    cube.translate = [-300, 500, 0];
    objs.push(cube);
    
    var sphere = new Sphere([0, 1, 1, 1], 2);
    sphere.scale = [70, 70, 70];
    sphere.translate = [0, 750, 100];
    objs.push(sphere);
    
    var cone = new Cone([1, 0, 1, 1], 20);
    cone.scale = [80, 50, 80];
    cone.translate = [220, 500, 60];
    objs.push(cone);
    
    var cylinder = new Cylinder([0, 0.5, 0.8, 1], 20);
    cylinder.scale = [50, 120, 50];
    cylinder.translate = [0, 250, 100];
    objs.push(cylinder);
    
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
var iter = 0;

function render()
{
    iter += 0.01;
    var cam = lookAt([500 * Math.sin(iter), 600, 500 * Math.cos(iter)], [0, 500, 0], [0, 1, 0]);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    var pr  = perspective(90, 2, 100, -500, 500);

    gl.uniformMatrix4fv(prMatrixLoc, gl.FALSE, flatten(pr));

    // iterate over all objects, do model-view transformation
    for (var i = 0; i < objs.length; ++i) {
        objs[i].rotate = add(objs[i].rotate, [1, 0.2, 0.1]);

        objs[i].transform(cam); 
        objs[i].draw();
    }

    requestAnimFrame(render);
}

