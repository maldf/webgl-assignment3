"use strict";

var canvas;
var gl;
var vBuffer;
var iBuffer;
var vBufferIdx;                     // current fill index of vertex buffer
var iBufferIdx;                     // current fill index of element buffer

const NUM_VERTS = 10000;
const VERT_DATA_SIZE = 12;          // each vertex = (3 axes ) * sizeof(float)
const COLOR_DATA_SIZE = 16;         // each vertex = (4 colors) * sizeof(float)

const NUM_ELEMS = 10000;  
const ELEM_DATA_SIZE = Uint16Array.BYTES_PER_ELEMENT;

var objs = [];
var meshes = [];
var objCount = 0;
var currObj = null;

var mvMatrixLoc;
var prMatrixLoc;
var colorLoc;

var lineColor = [0, 0, 0, 1];
var camEye = [500, 600, -750];
var camAt  = [0, 500, 0];

var scaleMax  = [200, 200, 200];
var rotateMax = [180, 180, 180];
var posMax    = [1000, 1000, 1000];

var scaleMin  = [0, 0, 0];
var rotateMin = negate(rotateMax);
var posMin    = negate(posMax);

//-------------------------------------------------------------------------------------------------
function Mesh() 
{
    this.vertIdx = -1;
    this.elemIdx = -1;
}

Mesh.prototype.addPoint = function(p)
{
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, vBufferIdx * VERT_DATA_SIZE, flatten(p));
    if (this.vertIdx == -1) {
        // start of object
        this.vertIdx = vBufferIdx;
    }
    vBufferIdx++;
}

Mesh.prototype.addTopology = function(t)
{
    // adjust topology indexes to point to vertices in vertex array
    // with offset this.vertIdx
    var adjTopo = [];
    for (var i = 0; i < t.length; ++i) {
        adjTopo.push(t[i] + this.vertIdx);
    }
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, iBufferIdx * ELEM_DATA_SIZE, new Uint16Array(adjTopo)); 
    if (this.elemIdx == -1) {
        // start of object
        this.elemIdx = iBufferIdx;
    }
    iBufferIdx += adjTopo.length;
}

//-------------------------------------------------------------------------------------------------
function CADObject(name, mesh, color)
{
    this.name = name;
    this.mesh = mesh;
    this.color = color;

    // object in world space
    this.rotate = [0, 0, 0];
    this.scale  = [1, 1, 1];
    this.translate = [0, 0, 0];
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
function Cube() 
{
    Mesh.call(this);
}
Cube.prototype = Object.create(Mesh.prototype);

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
        this.addPoint(vert[i]);
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
    gl.drawElements(gl.TRIANGLE_FAN, 8, gl.UNSIGNED_SHORT, this.elemIdx * ELEM_DATA_SIZE);
    gl.drawElements(gl.TRIANGLE_FAN, 8, gl.UNSIGNED_SHORT, (this.elemIdx + 8) * ELEM_DATA_SIZE);
    
    gl.uniform4fv(colorLoc, lineColor);
    gl.drawElements(gl.LINES, 24, gl.UNSIGNED_SHORT, (this.elemIdx + 16) * ELEM_DATA_SIZE);
}

//-------------------------------------------------------------------------------------------------
function Sphere(recurse) {
    Mesh.call(this);
    this.recurse = recurse || 3;
}
Sphere.prototype = Object.create(Mesh.prototype);

Sphere.prototype.addMeshPoint = function(p) 
{
    // add points normalized to unit circle length
    normalize(p);
    // only add new points; if point already exists, return its index
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
        this.addPoint(this.vert[i]);
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
    gl.drawElements(gl.TRIANGLES, this.elemCnt, gl.UNSIGNED_SHORT, this.elemIdx * ELEM_DATA_SIZE);
    
    gl.uniform4fv(colorLoc, lineColor);
    gl.drawElements(gl.LINES, this.lineCnt, gl.UNSIGNED_SHORT, (this.elemIdx + this.elemCnt) * ELEM_DATA_SIZE);
}

//-------------------------------------------------------------------------------------------------
function Cone(angle) {
    Mesh.call(this);
    this.angle = angle || 20;
    this.segments = 0;
}
Cone.prototype = Object.create(Mesh.prototype);

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
        this.addPoint(vert[i]);
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
    gl.drawElements(gl.TRIANGLE_FAN, this.segments + 2, gl.UNSIGNED_SHORT, this.elemIdx * ELEM_DATA_SIZE);
    gl.drawElements(gl.TRIANGLE_FAN, this.segments + 2, gl.UNSIGNED_SHORT, (this.elemIdx + this.segments + 2) * ELEM_DATA_SIZE);
    
    gl.uniform4fv(colorLoc, lineColor);
    gl.drawElements(gl.LINES, this.lineCnt, gl.UNSIGNED_SHORT, (this.elemIdx + 2 * (this.segments + 2)) * ELEM_DATA_SIZE);
}

//-------------------------------------------------------------------------------------------------
function Cylinder(angle) {
    Mesh.call(this);
    this.angle = angle || 20;
    this.segments = 0;
}
Cylinder.prototype = Object.create(Mesh.prototype);

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
        this.addPoint(vert[i]);
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
    gl.drawElements(gl.TRIANGLE_FAN, this.segments + 2, gl.UNSIGNED_SHORT, this.elemIdx * ELEM_DATA_SIZE);
    gl.drawElements(gl.TRIANGLE_FAN, this.segments + 2, gl.UNSIGNED_SHORT, (this.elemIdx + this.segments + 2) * ELEM_DATA_SIZE);
    gl.drawElements(gl.TRIANGLE_STRIP, 2 * this.segments + 2, gl.UNSIGNED_SHORT, (this.elemIdx + 2 * (this.segments + 2)) * ELEM_DATA_SIZE);
    
    gl.uniform4fv(colorLoc, lineColor);
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
    
    iBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, NUM_ELEMS * ELEM_DATA_SIZE, gl.STATIC_DRAW); 
    iBufferIdx = 0;

    canvas.addEventListener("mousemove", mouse_move);
 
    colorLoc    = gl.getUniformLocation(program, "vColor");
    mvMatrixLoc = gl.getUniformLocation(program, "mvMatrix");
    prMatrixLoc = gl.getUniformLocation(program, "prMatrix");
    
    // Create meshes
    meshes['cube']     = new Cube();
    meshes['sphere']   = new Sphere(2);
    meshes['cone']     = new Cone(15);
    meshes['cylinder'] = new Cylinder(15);
    for (var key in meshes) {
        if (meshes.hasOwnProperty(key)) {
            meshes[key].addVertices();
        }
    }

    // test objects
    /*
    var obj = new CADObject('tst1' ,meshes['cube'], [0.8, 0.7, 0, 1]);
    obj.scale = [80, 40, 50];
    obj.translate = [-300, 500, 0];
    objs.push(obj);
    
    var obj = new CADObject('tst2' ,meshes['sphere'], [0, 1, 1, 1]);
    obj.scale = [70, 70, 70];
    obj.translate = [0, 750, 100];
    objs.push(obj);
    
    var obj = new CADObject('tst3' ,meshes['cone'], [1, 0, 1, 1]);
    obj.scale = [80, 50, 80];
    obj.translate = [220, 500, 60];
    objs.push(obj);
    
    var obj = new CADObject('tst4' ,meshes['cylinder'], [0, 0.5, 0.8, 1]);
    obj.scale = [50, 120, 50];
    obj.translate = [0, 250, 100];
    objs.push(obj);
    
    render();
    */

    // handle create
    document.getElementById('btn-create').onclick = create_new_obj;
    // handle clear
    document.getElementById("btn-clear").onclick = reset_scene;
    // handle select of active object
    document.getElementById("sel-obj").onchange = function() {
        for (var i = 0; i < objs.length; ++i) {
            if (objs[i].name == this.value) {
                currObj = objs[i];
                break;
            }
        }
        cur_obj_set_controls();
    }

    document.getElementById('range-scale-x').oninput = cur_obj_change;
    document.getElementById('range-scale-y').oninput = cur_obj_change;
    document.getElementById('range-scale-z').oninput = cur_obj_change;
    document.getElementById('range-rotate-x').oninput = cur_obj_change;
    document.getElementById('range-rotate-y').oninput = cur_obj_change;
    document.getElementById('range-rotate-z').oninput = cur_obj_change;
    document.getElementById('range-pos-x').oninput = cur_obj_change;
    document.getElementById('range-pos-y').oninput = cur_obj_change;
    document.getElementById('range-pos-z').oninput = cur_obj_change;
    
    document.getElementById("obj-color").value = "#20d0ff";          // default
    document.getElementById("obj-color").oninput = cur_obj_change;
    
    document.getElementById('range-cam-x').oninput = cam_change;
    document.getElementById('range-cam-y').oninput = cam_change;
    document.getElementById('range-cam-z').oninput = cam_change;
    document.getElementById('range-lookat-x').oninput = cam_change;
    document.getElementById('range-lookat-y').oninput = cam_change;
    document.getElementById('range-lookat-z').oninput = cam_change;

    reset_scene();
}

//-------------------------------------------------------------------------------------------------
function create_new_obj()
{
    var type = document.getElementById('sel-type').value;
    var sel_obj = document.getElementById('sel-obj');
    var opt = document.createElement('option');
    objCount++;
    var name = type + objCount;
    opt.value = name;
    opt.innerHTML = name;
    sel_obj.appendChild(opt);
    sel_obj.value = opt.value;

    objs.push(new CADObject(name, meshes[type], [0.8, 0.8, 0.8, 1]));
    currObj = objs[objs.length - 1];
    currObj.color = convert_string_to_rgb(document.getElementById("obj-color").value);
    currObj.scale = [50, 50, 50];
    currObj.translate = camAt.slice();
    cur_obj_set_controls();
    render();
}
//-------------------------------------------------------------------------------------------------
function reset_scene()
{
    objs = [];
    currObj = null;
    objCount = 0;
    var sel_obj = document.getElementById('sel-obj');
    sel_obj.innerHTML = '';

    camEye = [500, 600, 500];
    camAt  = [0, 500, 0];
    cam_set();
    render();
}

//-------------------------------------------------------------------------------------------------
function clip_to_range(x, min, max)
{
    if (Array.isArray(x)) {
        for (var i = 0; i < x.length; ++i) {
            if (x[i] < min[i]) 
                x[i] = min[i];
            else if (x[i] > max[i])
                x[i] = max[i];
        }
    } else {
        if (x < min) x = min;
        else if (x > max) x = max;
    }

    return x;
}

//-------------------------------------------------------------------------------------------------
function cur_obj_set_controls()
{
    if (!currObj) {
        return;
    }
    
    var col = currObj.color.slice();
    col[0] *= 255;
    col[1] *= 255;
    col[2] *= 255;
    document.getElementById("obj-color").value = "#" + col[0].toString(16) + col[1].toString(16) + col[2].toString(16);
    
    clip_to_range(currObj.scale, scaleMin, scaleMax);
    clip_to_range(currObj.rotate, rotateMin, rotateMax);
    clip_to_range(currObj.translate, posMin, posMax);
    document.getElementById('range-scale-x').value = document.getElementById('scale-x').innerHTML = currObj.scale[0];
    document.getElementById('range-scale-y').value = document.getElementById('scale-y').innerHTML = currObj.scale[1];
    document.getElementById('range-scale-z').value = document.getElementById('scale-z').innerHTML = currObj.scale[2];
    document.getElementById('range-rotate-x').value = document.getElementById('rotate-x').innerHTML = currObj.rotate[0];
    document.getElementById('range-rotate-y').value = document.getElementById('rotate-y').innerHTML = currObj.rotate[1];
    document.getElementById('range-rotate-z').value = document.getElementById('rotate-z').innerHTML = currObj.rotate[2];
    document.getElementById('range-pos-x').value = document.getElementById('pos-x').innerHTML = currObj.translate[0];
    document.getElementById('range-pos-y').value = document.getElementById('pos-y').innerHTML = currObj.translate[1];
    document.getElementById('range-pos-z').value = document.getElementById('pos-z').innerHTML = currObj.translate[2];
}

//-------------------------------------------------------------------------------------------------
function cur_obj_change()
{
    if (currObj) {
        currObj.color = convert_string_to_rgb(document.getElementById("obj-color").value);

        var scale_x = document.getElementById('range-scale-x').value;
        var scale_y = document.getElementById('range-scale-y').value;
        var scale_z = document.getElementById('range-scale-z').value;
        currObj.scale[0] = document.getElementById('scale-x').innerHTML = scale_x;
        currObj.scale[1] = document.getElementById('scale-y').innerHTML = scale_y;
        currObj.scale[2] = document.getElementById('scale-z').innerHTML = scale_z;

        var rot_x = document.getElementById('range-rotate-x').value;
        var rot_y = document.getElementById('range-rotate-y').value;
        var rot_z = document.getElementById('range-rotate-z').value;
        currObj.rotate[0] = document.getElementById('rotate-x').innerHTML = rot_x;
        currObj.rotate[1] = document.getElementById('rotate-y').innerHTML = rot_y;
        currObj.rotate[2] = document.getElementById('rotate-z').innerHTML = rot_z;

        var pos_x = document.getElementById('range-pos-x').value;
        var pos_y = document.getElementById('range-pos-y').value;
        var pos_z = document.getElementById('range-pos-z').value;
        currObj.translate[0] = document.getElementById('pos-x').innerHTML = pos_x;
        currObj.translate[1] = document.getElementById('pos-y').innerHTML = pos_y;
        currObj.translate[2] = document.getElementById('pos-z').innerHTML = pos_z;
    }
    
    render();
}

//-------------------------------------------------------------------------------------------------
function cam_set()
{
    document.getElementById('range-cam-x').value = document.getElementById('cam-x').innerHTML = camEye[0];
    document.getElementById('range-cam-y').value = document.getElementById('cam-y').innerHTML = camEye[1];
    document.getElementById('range-cam-z').value = document.getElementById('cam-z').innerHTML = camEye[2];
    document.getElementById('range-lookat-x').value = document.getElementById('lookat-x').innerHTML = camAt[0];
    document.getElementById('range-lookat-y').value = document.getElementById('lookat-y').innerHTML = camAt[1];
    document.getElementById('range-lookat-z').value = document.getElementById('lookat-z').innerHTML = camAt[2];
}

//-------------------------------------------------------------------------------------------------
function cam_change()
{
    camEye[0] = document.getElementById('range-cam-x').value;
    camEye[1] = document.getElementById('range-cam-y').value;
    camEye[2] = document.getElementById('range-cam-z').value;
    document.getElementById('cam-x').innerHTML = camEye[0];
    document.getElementById('cam-y').innerHTML = camEye[1];
    document.getElementById('cam-z').innerHTML = camEye[2];

    camAt[0] = document.getElementById('range-lookat-x').value;
    camAt[1] = document.getElementById('range-lookat-y').value;
    camAt[2] = document.getElementById('range-lookat-z').value;
    document.getElementById('lookat-x').innerHTML = camAt[0];
    document.getElementById('lookat-y').innerHTML = camAt[1];
    document.getElementById('lookat-z').innerHTML = camAt[2];

    render();
}

//-------------------------------------------------------------------------------------------------
// convert string "#rrggbb" to vec4() with rgb color
function convert_string_to_rgb(str) 
{
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
var prev_mouse_pos = [0, 0];
function mouse_move(ev)
{
    if (currObj && ev.buttons) {
        if (ev.buttons & 1) {
            var incX = Number(ev.clientX - prev_mouse_pos[0]);
            var incY = Number(prev_mouse_pos[1] - ev.clientY);
            currObj.translate[0] += incX; 
            currObj.translate[1] += incY; 

            cur_obj_set_controls();
            render();
        }
    }

    prev_mouse_pos = [ev.clientX, ev.clientY];
}

//-------------------------------------------------------------------------------------------------
function render()
{
    var cam = lookAt(camEye, camAt, [0, 1, 0]);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    var pr = perspective(90, 2, 1, 4000);
    //var pr = ortho(-1000, 1000, -500, 500, -1000, 1000);

    gl.uniformMatrix4fv(prMatrixLoc, gl.FALSE, flatten(pr));

    // iterate over all objects, do model-view transformation
    for (var i = 0; i < objs.length; ++i) {
        gl.uniform4fv(colorLoc, flatten(objs[i].color));
        objs[i].transform(cam); 
        objs[i].mesh.draw();
    }

    // testing
    //requestAnimFrame(render);
}

