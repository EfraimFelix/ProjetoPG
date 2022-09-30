"use strict";

var gl;
var program;
var model;
var scene;

var pos_final = 24;
var movement = null;
var movement_enable = false;
var rotation = null;

var shot = false;

var gameStatus = null;

var cd = 50; // Cooldown do tiro

// Ativa comandos do player
document.addEventListener("keydown", (event) => {
  const key = event.code;

  // Mover para frente
  if (key === "ArrowUp" || key === "KeyW") {
    movement = "up";
    movement_enable = true;
  }

  // Atirar
  if (key == "Space" || key == "KeyZ" || key == "KeyJ") {
    shot = true;
  }

  // Rotacionar no proprio eixo
  if (key === "ArrowLeft" || key === "KeyA") {
    rotation = "left";
  } else if (key === "ArrowRight" || key === "KeyD") {
    rotation = "right";
  }
});

// Desativa comandos do player
document.addEventListener("keyup", (event) => {
  const key = event.code;
  if (key === "ArrowUp" || key === "KeyW") {
    movement_enable = false;
  }
  if (
    key === "ArrowLeft" ||
    key === "KeyA" ||
    key === "ArrowRight" ||
    key === "KeyD"
  )
    rotation = null;

  if (key == "Space" || key == "KeyZ" || key == "KeyJ") shot = false;
});

window.onload = function init() {
  // Get A WebGL context
  var canvas = document.getElementById("gl-canvas");
  gl = canvas.getContext("webgl2");
  if (!gl) {
    alert("WebGL 2.0 isn't available");
    return;
  }

  program = initShaders(gl, "shaders/vertex.glsl", "shaders/fragment.glsl");

  model = loadModel("ball");

  scene = loadScene();

  requestAnimationFrame(render);
};

function loadScene() {
  let extents = getExtents(model.geometry.position);
  let range = m4.subtractVectors(extents.max, extents.min);

  let objOffset = m4.scaleVector(
    m4.addVectors(extents.min, m4.scaleVector(range, 0.5)),
    1
  );

  const u_obj_ball = m4.translation(...objOffset);
  const cameraTarget = [0, 0, 0];
  const radius = m4.length(range) * 1.2;
  const cameraPosition = m4.addVectors(cameraTarget, [0, 0, radius]);

  const zNear = radius / 100;
  const zFar = radius * 3;

  const fieldOfViewRadians = degToRad(60);
  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

  const up = [0, 1, 0];

  const camera = m4.lookAt(cameraPosition, cameraTarget, up);

  const view = m4.inverse(camera);
  const light = m4.normalize([-1, 3, 5]);

  var projectionLocation = gl.getUniformLocation(program, "u_projection");
  var viewLocation = gl.getUniformLocation(program, "u_view");
  var worldObjLocation = gl.getUniformLocation(program, "u_world");
  var lightLocation = gl.getUniformLocation(program, "u_lightDirection");
  var v_color = gl.getUniformLocation(program, "v_color");

  return {
    // Objetos
    u_obj_ball,
    objs_asteroids: [
      {
        direction: [-0.2, 0, 0],
        position: [5, 5, 0],
        size: 1,
        colide: false,
      },
      {
        direction: [0.1, 0.2, 0],
        position: [-8, -5, 0],
        size: 1,
        colide: false,
      },
      {
        direction: [0.1, -0.05, 0],
        position: [-10, 10, 0],
        size: 1,
        colide: false,
      },
    ],
    obj_player: {
      direction: [0.0, 0.0, 0],
      position: [0, 0, 0],
      angle: 0,
      size: 1,
      velocity: [0, 0, 0],
      bullets: [],
    },
    worldObjLocation,

    v_color,

    // Iluminação
    u_lightDirection: light,
    lightLocation,

    // Camera
    u_view: view,
    u_projection: projection,
    projectionLocation,
    viewLocation,
  };
}

function loadModel(obj_name) {
  const geometry = parseOBJ(loadFileAJAX(`models/${obj_name}.obj`))
    .geometries[0].data;

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const positionLocation = gl.getAttribLocation(program, "a_position");
  const positionBuffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flatten(geometry.position), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

  const colorLocation = gl.getAttribLocation(program, "a_color");
  const colorBuffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flatten(geometry.texcoord), gl.STATIC_DRAW);
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(colorLocation);

  const normalLocation = gl.getAttribLocation(program, "a_normal");
  const normalBuffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flatten(geometry.normal), gl.STATIC_DRAW);
  gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(normalLocation);

  return {
    geometry,
    positionLocation,
    colorLocation,
    normalLocation,
    vao,
  };
}

function render(time) {
  time *= 0.001; // convert to seconds

  resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  gl.enable(gl.DEPTH_TEST);

  gl.useProgram(program);

  gl.uniform3fv(scene.lightLocation, scene.u_lightDirection);
  gl.uniformMatrix4fv(scene.viewLocation, false, scene.u_view);
  gl.uniformMatrix4fv(scene.projectionLocation, false, scene.u_projection);

  renderPlayer();
  renderAsteroids(time);
  renderBullet();

  verifyCollisionAsteroids();
  verifyCollisionPlayer();

  if (gameStatus != "GAMEOVER") requestAnimationFrame(render);
}

// Renderiza o jogador
function renderPlayer() {
  const obj_player = scene.obj_player;
  let u_world = m4.zRotation(degToRad(135));
  u_world = m4.multiply(
    u_world,
    m4.scale(
      u_world,
      obj_player.size * 0.1,
      obj_player.size * 0.1,
      obj_player.size * 0.1
    )
  );

  // Calculo da velocidade final do objeto
  const velocityFinal = Math.sqrt(
    Math.pow(obj_player.velocity[1], 2) + Math.pow(obj_player.velocity[0], 2)
  );

  let speed = 0.001;
  if (movement_enable) speed *= 3;

  if (movement == "up" && !movement_enable) {
    if (velocityFinal > 0.01) {
      let velocity_angle =
        (Math.atan(obj_player.velocity[1] / obj_player.velocity[0]) * 180) /
        Math.PI;

      obj_player.velocity[1] += speed * Math.sin(velocity_angle);
      obj_player.velocity[0] += speed * Math.cos(velocity_angle);
    } else {
      obj_player.velocity[1] = 0;
      obj_player.velocity[0] = 0;
    }
  }

  if (movement == "up" && movement_enable) {
    if (velocityFinal < 0.2) {
      obj_player.velocity[1] -= speed * Math.sin(obj_player.angle);
      obj_player.velocity[0] -= speed * Math.cos(obj_player.angle);
    }
  }

  obj_player.position[1] += obj_player.velocity[1];
  obj_player.position[0] += obj_player.velocity[0];

  const posPlayer = getPositions(
    scene.obj_player.size,
    scene.obj_player.position
  );

  // Verifica se o objeto jogador bateu na borda
  if (posPlayer[0] > pos_final)
    obj_player.position[0] = -pos_final / scene.obj_player.size;

  if (posPlayer[0] < -pos_final)
    obj_player.position[0] = pos_final / scene.obj_player.size;

  if (posPlayer[1] > pos_final)
    obj_player.position[1] = -pos_final / scene.obj_player.size;

  if (posPlayer[1] < -pos_final)
    obj_player.position[1] = pos_final / scene.obj_player.size;

  if (rotation === "left") obj_player.angle += 0.1;
  else if (rotation === "right") obj_player.angle -= 0.1;

  u_world = m4.multiply(
    u_world,
    m4.translation(
      obj_player.position[0],
      obj_player.position[1],
      obj_player.position[2]
    )
  );

  u_world = m4.multiply(u_world, m4.zRotation(obj_player.angle));

  u_world = m4.multiply(u_world, scene.u_obj_ball);
  gl.uniformMatrix4fv(scene.worldObjLocation, false, u_world);
  gl.uniformMatrix4fv(scene.worldObjLocation, false, u_world);
  // gl.uniform4fv(scene.v_color, [1, 1, 1, 0.5]);
  gl.drawArrays(gl.TRIANGLES, 0, model.geometry.position.length / 3);
}

//Renderiza os asteroids
function renderAsteroids(time) {
  for (let i = 0; i < scene.objs_asteroids.length; i++) {
    let obj = scene.objs_asteroids[i];

    obj.position[0] += obj.direction[0];
    obj.position[1] += obj.direction[1];

    // Verifica se o asteroid bateu na borda
    if (obj.position[0] > pos_final) {
      obj.position[0] = -pos_final;
    }
    if (obj.position[0] < -pos_final) {
      obj.position[0] = pos_final;
    }

    if (obj.position[1] > pos_final) {
      obj.position[1] = -pos_final;
    }
    if (obj.position[1] < -pos_final) {
      obj.position[1] = pos_final;
    }

    //Para cada asteroid
    let u_world = m4.identity();
    u_world = m4.scale(u_world, obj.size * 0.1, obj.size * 0.1, obj.size * 0.1);
    u_world = m4.multiply(
      u_world,
      m4.translation(obj.position[0], obj.position[1], 0)
    );
    u_world = m4.multiply(u_world, m4.xRotation(time * 1));
    u_world = m4.multiply(u_world, m4.zRotation(time * 1));

    u_world = m4.multiply(u_world, scene.u_obj_ball);
    gl.uniformMatrix4fv(scene.worldObjLocation, false, u_world);
    gl.uniformMatrix4fv(scene.worldObjLocation, false, u_world);
    // gl.uniform4fv(scene.v_color, [1, 0, 0, 1]);
    gl.drawArrays(gl.TRIANGLES, 0, model.geometry.position.length / 3);
  }
}

// Gera o tiro do jogador
function renderBullet() {
  cd--;
  const obj_player = scene.obj_player;

  let angle = obj_player.angle;

  const distorX = 2 * Math.cos(angle + Math.PI / 2);
  const distorY = 2 * Math.sin(angle + Math.PI / 2);

  let coordX = obj_player.position[1] * 2 + distorX;
  let coordY = -obj_player.position[0] * 2 + distorY;

  if (shot && cd < 0) {
    cd = 10;
    if (scene.obj_player.bullets.length < 3)
      scene.obj_player.bullets.push({
        direction: [0.0, 0.0, 0],
        position: [coordX, coordY, 0],
        angle: angle,
        size: 0.5,
        velocity: [
          Math.cos(angle + Math.PI / 2),
          Math.sin(angle + Math.PI / 2),
          0,
        ],
        lifetime: 40,
      });
  }

  for (let i = 0; i < scene.obj_player.bullets.length; i++) {
    const obj_bullet = scene.obj_player.bullets[i];

    obj_bullet.lifetime--;

    obj_bullet.position[0] += obj_bullet.velocity[0];
    obj_bullet.position[1] += obj_bullet.velocity[1];

    let u_world = m4.identity();
    u_world = m4.multiply(
      u_world,
      m4.scale(
        u_world,
        obj_bullet.size * 0.1,
        obj_bullet.size * 0.1,
        obj_bullet.size * 0.1
      )
    );
    u_world = m4.multiply(
      u_world,
      m4.translation(obj_bullet.position[0], obj_bullet.position[1], 0.1)
    );

    u_world = m4.multiply(u_world, scene.u_obj_ball);
    gl.uniformMatrix4fv(scene.worldObjLocation, false, u_world);
    gl.uniformMatrix4fv(scene.worldObjLocation, false, u_world);
    // gl.uniform4fv(scene.v_color, [1, 1, 0, 1]);
    gl.drawArrays(gl.TRIANGLES, 0, model.geometry.position.length / 3);

    if (obj_bullet.lifetime <= 0) {
      scene.obj_player.bullets.splice(i, 1);
    }
  }

  const screen = {
    angle: obj_player.angle.toFixed(3),
    playerX: obj_player.position[0].toFixed(3),
    playerY: obj_player.position[1].toFixed(3),
    bala_X: coordX.toFixed(3),
    bala_Y: coordY.toFixed(3),
    cd: cd,
  };
}

// Verifica a colisão entre cada asteroide
function verifyCollisionAsteroids() {
  for (let i = 0; i < scene.objs_asteroids.length; i++)
    scene.objs_asteroids[i].colide = false;

  // Verificando colisão entre asteroids na cena
  for (let i = 0; i < scene.objs_asteroids.length; i++) {
    let obj_enemy_1 = scene.objs_asteroids[i];

    for (let j = 0; j < scene.objs_asteroids.length; j++) {
      let obj_enemy_2 = scene.objs_asteroids[j];
      if (j == i || obj_enemy_1.colide) continue;

      const posEnemy1 = getPositions(obj_enemy_1.size, obj_enemy_1.position);
      const posEnemy2 = getPositions(obj_enemy_2.size, obj_enemy_2.position);

      const xd = posEnemy1[0] - posEnemy2[0];
      const yd = posEnemy1[1] - posEnemy2[1];

      const sumRadius = (obj_enemy_1.size + obj_enemy_2.size) * 0.8;
      const sqrRadius = sumRadius * sumRadius;

      const distSqr = Math.sqrt(xd * xd + yd * yd);

      //Resolvendo colisao se houver
      if (distSqr <= sqrRadius) {
        scene.objs_asteroids[i].colide = true;

        let nx = xd / distSqr;
        let ny = yd / distSqr;

        let scalar =
          -2 *
          (nx * scene.objs_asteroids[i].direction[0] +
            ny * scene.objs_asteroids[i].direction[1]);

        nx = nx * scalar;
        ny = ny * scalar;

        scene.objs_asteroids[i].direction[0] += nx;
        scene.objs_asteroids[i].direction[1] += ny;

        nx = -xd / distSqr;
        ny = -yd / distSqr;

        scalar =
          -2 *
          (nx * scene.objs_asteroids[j].direction[0] +
            ny * scene.objs_asteroids[j].direction[1]);

        nx = nx * scalar;
        ny = ny * scalar;

        scene.objs_asteroids[j].direction[0] += nx;
        scene.objs_asteroids[j].direction[1] += ny;

        scene.objs_asteroids[i].position[0] +=
          scene.objs_asteroids[i].direction[0];
        scene.objs_asteroids[i].position[1] +=
          scene.objs_asteroids[i].direction[1];
        scene.objs_asteroids[j].position[0] +=
          scene.objs_asteroids[j].direction[0];
        scene.objs_asteroids[j].position[1] +=
          scene.objs_asteroids[j].direction[1];
      }
    }
  }
}

// Verifica Colisão entre o player e os asteroides
function verifyCollisionPlayer() {
  const obj_player = scene.obj_player;
  for (let i = 0; i < scene.objs_asteroids.length; i++) {
    let obj_enemy = scene.objs_asteroids[i];

    const posPlayer = getPositions(obj_player.size, obj_player.position);
    const posEnemy = getPositions(obj_enemy.size, obj_enemy.position);

    const xd = posPlayer[1] - posEnemy[0];
    const yd = -posPlayer[0] - posEnemy[1];

    const sumRadius = obj_player.size + obj_enemy.size;
    const sqrRadius = sumRadius * sumRadius;

    const distSqr = xd * xd + yd * yd;

    if (distSqr <= sqrRadius) gameStatus = "GAMEOVER";
  }
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
  const needResize =
    canvas.width !== displayWidth || canvas.height !== displayHeight;

  if (needResize) {
    // Make the canvas the same size
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }

  return needResize;
}

// Retornar posição baseado no tamanho de cada objeto
function getPositions(size, positions) {
  const ratio = 1 / size;
  return positions.map((x) => x / ratio);
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}
