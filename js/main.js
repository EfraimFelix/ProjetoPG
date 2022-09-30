"use strict";

var gl;
var program;
var model;
var scene;

window.onload = function init() {

	// Get A WebGL context
	var canvas = document.getElementById("gl-canvas");
	gl = canvas.getContext("webgl2");
	if (!gl) {
		alert("WebGL 2.0 isn't available");
		return;
	}

	program = initShaders(gl, 'shaders/vertex.glsl', 'shaders/fragment.glsl');

	model = loadModel(); // list of models?

	scene = loadScene(model);

	requestAnimationFrame(render);
}

function loadScene(model) { // list of objects

	// for all models
	const extents = getExtents(model.geometry.position);
	const range = m4.subtractVectors(extents.max, extents.min);
	// amount to move the object so its center is at the origin
	const objOffset = m4.scaleVector(m4.addVectors(extents.min,
		m4.scaleVector(range, 0.5)), -1);
	var u_obj = m4.translation(...objOffset);
	

	const cameraTarget = [0, 0, 0];
	const radius = m4.length(range) * 1.2;
	const cameraPosition = m4.addVectors(cameraTarget, [
		0,
		0,
		radius,
	]);

	const zNear = radius / 100;
	const zFar = radius * 3;

	const fieldOfViewRadians = degToRad(60);
	const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
	const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

	const up = [0, 1, 0];
	// Compute the camera's matrix using look at.
	const camera = m4.lookAt(cameraPosition, cameraTarget, up);

	// Make a view matrix from the camera matrix.
	const view = m4.inverse(camera);
	const light = m4.normalize([-1, 3, 5]);

	var projectionLocation = gl.getUniformLocation(program, "u_projection");
	var viewLocation = gl.getUniformLocation(program, "u_view");
	var worldObjLocation = gl.getUniformLocation(program, "u_world");
	var lightLocation = gl.getUniformLocation(program, "u_lightDirection");

	return {

		// Objects
		u_obj, worldObjLocation,

		// Light
		u_lightDirection: light, lightLocation,

		// Camera
		u_view: view,
		u_projection: projection,
		projectionLocation, viewLocation,
	};
}

function loadModel() {
	var geometry = parseOBJ(loadFileAJAX('models/book.obj')).geometries[0].data;

	var vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	var positionLocation = gl.getAttribLocation(program, "a_position");
	var positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(geometry.position), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(positionLocation);
	gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

	var colorLocation = gl.getAttribLocation(program, "a_color");
	var colorBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(geometry.color), gl.STATIC_DRAW);
	gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(colorLocation);

	var normalLocation = gl.getAttribLocation(program, "a_normal");
	var normalBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(geometry.normal), gl.STATIC_DRAW);
	gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(normalLocation);

	return {
		geometry,
		positionLocation, colorLocation, normalLocation, vao,
	};
}

function render(time) {

	time *= 0.001;  // convert to seconds

	resizeCanvasToDisplaySize(gl.canvas);
	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

	gl.enable(gl.DEPTH_TEST);

	gl.useProgram(program);

	gl.uniform3fv(scene.lightLocation, scene.u_lightDirection);
	gl.uniformMatrix4fv(scene.viewLocation, false, scene.u_view);
	gl.uniformMatrix4fv(scene.projectionLocation, false, scene.u_projection);

	// for each object
	let u_world = m4.yRotation(time);
	u_world = m4.multiply(u_world, scene.u_obj);
	gl.uniformMatrix4fv(scene.worldObjLocation, false, u_world);
	gl.bindVertexArray(model.vao);
	gl.drawArrays(gl.TRIANGLES, 0, model.geometry.position.length / 3)

	requestAnimationFrame(render);
}

function getExtents(positions) {
	const min = positions.slice(0, 3);
	const max = positions.slice(0, 3);
	for (let i = 3; i < positions.length; i += 3) {
		for (let j = 0; j < 3; ++j) {
			const v = positions[i + j];
			min[j] = Math.min(v, min[j]);
			max[j] = Math.max(v, max[j]);
		}
	}
	return { min, max };
}

function resizeCanvasToDisplaySize(canvas) {
	// Lookup the size the browser is displaying the canvas in CSS pixels.
	const displayWidth = canvas.clientWidth;
	const displayHeight = canvas.clientHeight;

	// Check if the canvas is not the same size.
	const needResize = canvas.width !== displayWidth ||
		canvas.height !== displayHeight;

	if (needResize) {
		// Make the canvas the same size
		canvas.width = displayWidth;
		canvas.height = displayHeight;
	}

	return needResize;
}

function degToRad(deg) {
	return deg * Math.PI / 180;
}
