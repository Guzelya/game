/* eslint-disable complexity */
/* eslint-disable react/no-multi-comp */
/* eslint-disable max-statements */
"use strict";

/* global THREE, dat */
var vertex = new THREE.Vector3();
var color = new THREE.Color();

var blocker = document.getElementById("blocker");

var win = document.getElementById("win");

blocker.style.display = "none";

win.style.display = "none";

function main() {
  const canvas = document.querySelector("#c");
  const renderer = new THREE.WebGLRenderer({ canvas });

  const fov = 45;
  const aspect = 2; // the canvas default
  const near = 0.1;
  const far = 1000;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.set(0, 40, 80);

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableKeys = false;
  controls.target.set(0, 5, 0);
  controls.update();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("white");

  function addLight(...pos) {
    const color = 0xffffff;
    const intensity = 1;
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(...pos);
    scene.add(light);
    scene.add(light.target);
  }
  addLight(5, 5, 2);
  addLight(-5, 5, 5);

  // // floor

  // var floorGeometry = new THREE.PlaneBufferGeometry(2000, 2000, 100, 100);
  // floorGeometry.rotateX(-Math.PI / 2);

  // // vertex displacement

  // var position = floorGeometry.attributes.position;

  // for (var i = 0, l = position.count; i < l; i++) {
  //   vertex.fromBufferAttribute(position, i);

  //   vertex.x += Math.random() * 20 - 10;
  //   vertex.y += Math.random() * 2;
  //   vertex.z += Math.random() * 20 - 10;

  //   position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  // }

  // floorGeometry = floorGeometry.toNonIndexed(); // ensure each face has unique vertices

  // position = floorGeometry.attributes.position;
  // var colors = [];

  // for (var i = 0, l = position.count; i < l; i++) {
  //   color.setHSL(Math.random() * 0.3 + 0.5, 0.75, Math.random() * 0.25 + 0.75);
  //   colors.push(color.r, color.g, color.b);
  // }

  // floorGeometry.addAttribute(
  //   "color",
  //   new THREE.Float32BufferAttribute(colors, 3)
  // );

  // var floorMaterial = new THREE.MeshBasicMaterial({
  //   vertexColors: THREE.VertexColors
  // });

  // var floor = new THREE.Mesh(floorGeometry, floorMaterial);
  // scene.add(floor);
  // // end floor

  const manager = new THREE.LoadingManager();
  manager.onLoad = init;

  const progressbarElem = document.querySelector("#progressbar");
  manager.onProgress = (url, itemsLoaded, itemsTotal) => {
    progressbarElem.style.width = `${((itemsLoaded / itemsTotal) * 100) | 0}%`;
  };

  const models = {
    zebra: { url: "resources/models/animals/Zebra.gltf" },
    horse: { url: "resources/models/animals/Horse.gltf" },
    knight: { url: "resources/models/knight/KnightCharacter.gltf" },
    phoenix: { url: "resources/models/animals/scene.gltf" }
  };
  {
    const gltfLoader = new THREE.GLTFLoader(manager);
    for (const model of Object.values(models)) {
      gltfLoader.load(model.url, gltf => {
        model.gltf = gltf;
      });
    }
  }

  function prepModelsAndAnimations() {
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    Object.values(models).forEach(model => {
      box.setFromObject(model.gltf.scene);
      box.getSize(size);
      model.size = size.length();
      const animsByName = {};
      model.gltf.animations.forEach(clip => {
        animsByName[clip.name] = clip;
        // Should really fix this in .blend file
        if (clip.name === "Walk") {
          clip.duration /= 2;
        }
      });
      model.animations = animsByName;
    });
  }

  function removeArrayElement(array, element) {
    const ndx = array.indexOf(element);
    if (ndx >= 0) {
      array.splice(ndx, 1);
    }
  }

  const kForward = new THREE.Vector3(0, 0, 1);
  const globals = {
    camera,
    canvas,
    debug: true,
    time: 0,
    moveSpeed: 16,
    deltaTime: 0,
    player: null,
    congaLine: []
  };
  const gameObjectManager = new GameObjectManager();
  const inputManager = new InputManager();

  // Base for all components
  class Component {
    constructor(gameObject) {
      this.gameObject = gameObject;
    }
    update() {}
  }

  class CameraInfo extends Component {
    constructor(gameObject) {
      super(gameObject);
      this.projScreenMatrix = new THREE.Matrix4();
      this.frustum = new THREE.Frustum();
    }
    update() {
      const { camera } = globals;
      this.projScreenMatrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      this.frustum.setFromMatrix(this.projScreenMatrix);
    }
  }

  class SkinInstance extends Component {
    constructor(gameObject, model) {
      super(gameObject);
      this.model = model;
      this.animRoot = THREE.SkeletonUtils.clone(this.model.gltf.scene);
      this.mixer = new THREE.AnimationMixer(this.animRoot);
      gameObject.transform.add(this.animRoot);
      this.actions = {};
    }
    setAnimation(animName) {
      const clip = this.model.animations[animName];
      // turn off all current actions
      for (const action of Object.values(this.actions)) {
        action.enabled = false;
      }
      // get or create existing action for clip
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      action.reset();
      action.play();
      this.actions[animName] = action;
    }
    update() {
      this.mixer.update(globals.deltaTime);
    }
  }

  class FiniteStateMachine {
    constructor(states, initialState) {
      this.states = states;
      this.transition(initialState);
    }
    get state() {
      return this.currentState;
    }
    transition(state) {
      const oldState = this.states[this.currentState];
      if (oldState && oldState.exit) {
        oldState.exit.call(this);
      }
      this.currentState = state;
      const newState = this.states[state];
      if (newState.enter) {
        newState.enter.call(this);
      }
    }
    update() {
      const state = this.states[this.currentState];
      if (state.update) {
        state.update.call(this);
      }
    }
  }

  const gui = new dat.GUI();
  gui.add(globals, "debug").onChange(showHideDebugInfo);

  const labelContainerElem = document.querySelector("#labels");
  function showHideDebugInfo() {
    labelContainerElem.style.display = globals.debug ? "" : "none";
  }
  class StateDisplayHelper extends Component {
    constructor(gameObject, size) {
      super(gameObject);
      this.elem = document.createElement("div");
      labelContainerElem.appendChild(this.elem);
      this.pos = new THREE.Vector3();

      this.helper = new THREE.PolarGridHelper(size / 2, 1, 1, 16);
      gameObject.transform.add(this.helper);
    }
    setState(s) {
      this.elem.textContent = s;
    }
    setColor(cssColor) {
      this.elem.style.color = cssColor;
      this.helper.material.color.set(cssColor);
    }
    update() {
      this.helper.visible = globals.debug;
      if (!globals.debug) {
        return;
      }
      const { pos } = this;
      const { transform } = this.gameObject;
      const { canvas } = globals;
      pos.copy(transform.position);

      // get the normalized screen coordinate of that position
      // x and y will be in the -1 to +1 range with x = -1 being
      // on the left and y = -1 being on the bottom
      pos.project(globals.camera);

      // convert the normalized position to CSS coordinates
      const x = (pos.x * 0.5 + 0.5) * canvas.clientWidth;
      const y = (pos.y * -0.5 + 0.5) * canvas.clientHeight;

      // move the elem to that position
      this.elem.style.transform = `translate(-50%, -50%) translate(${x}px,${y}px)`;
    }
  }

  class Player extends Component {
    constructor(gameObject) {
      super(gameObject);
      const model = models.phoenix;
      globals.playerRadius = model.size / 8;
      this.text = gameObject.addComponent(StateDisplayHelper, model.size / 4);
      this.skinInstance = gameObject.addComponent(SkinInstance, model);
      this.skinInstance.setAnimation("Take 001_Armature_0");
      this.turnSpeed = globals.moveSpeed / 4;
      this.offscreenTimer = 0;
      this.maxTimeOffScreen = 3;
    }
    update() {
      const { deltaTime, moveSpeed } = globals;
      const { transform } = this.gameObject;
      const delta =
        (inputManager.keys.left.down ? 1 : 0) +
        (inputManager.keys.right.down ? -1 : 0);
      //transform.rotation.y += this.turnSpeed * delta * deltaTime;
      //transform.translateOnAxis(kForward, moveSpeed * deltaTime);

      // direction vector is initialized to point in the same direction of the head of the bird
      let direction = new THREE.Vector3(1, 0, 0);

      // rotate 90 degrees on right arrow key press
      if (inputManager.keys.right.down) {
        transform.rotation.y -= Math.PI / 36;
      }

      // rotate 90 degrees on left arrow key press
      if (inputManager.keys.left.down) {
        // rotates 90 degrees
        transform.rotation.y += Math.PI / 36;

        // the following code gets the direction vector that our bird is facing
        var matrix = new THREE.Matrix4();
        matrix.extractRotation(transform.matrix);
        console.log("MATRIX", matrix);

        matrix.multiplyVector3(direction);
        console.log("DIRECTION", direction);
      }

      // move in direction of head by one unit
      if (inputManager.keys.up.down) {
        transform.translateOnAxis(direction, 1);
      }

      // move backwars
      if (inputManager.keys.down.down) {
        transform.translateOnAxis(direction, -1);
      }

      const { frustum } = globals.cameraInfo;
      if (frustum.containsPoint(transform.position)) {
        this.offscreenTimer = 0;
      } else {
        this.offscreenTimer += deltaTime;
        if (this.offscreenTimer >= this.maxTimeOffScreen) {
          transform.position.set(0, 0, 0);
        }
      }
    }
  }

  function init() {
    // hide the loading bar
    const loadingElem = document.querySelector("#loading");
    loadingElem.style.display = "none";

    prepModelsAndAnimations();

    {
      const gameObject = gameObjectManager.createGameObject(camera, "camera");
      globals.cameraInfo = gameObject.addComponent(CameraInfo);
    }

    {
      const gameObject = gameObjectManager.createGameObject(scene, "player");
      gameObject.addComponent(Player);
    }
  }

  // Returns true of obj1 and obj2 are close
  function isClose(obj1, obj1Radius, obj2, obj2Radius) {
    const minDist = obj1Radius + obj2Radius;
    const dist = obj1.position.distanceTo(obj2.position);
    return dist < minDist;
  }

  // keeps v between -min and +min
  function minMagnitude(v, min) {
    return Math.abs(v) > min ? min * Math.sign(v) : v;
  }

  const aimTowardAndGetDistance = (function() {
    const delta = new THREE.Vector3();

    return function aimTowardAndGetDistance(source, targetPos, maxTurn) {
      delta.subVectors(targetPos, source.position);
      // compute the direction we want to be facing
      const targetRot = Math.atan2(delta.x, delta.z) + Math.PI * 1.5;
      // rotate in the shortest direction
      const deltaRot =
        ((targetRot - source.rotation.y + Math.PI * 1.5) % (Math.PI * 2)) -
        Math.PI;
      // make sure we don't turn faster than maxTurn
      const deltaRotation = minMagnitude(deltaRot, maxTurn);
      // keep rotation between 0 and Math.PI * 2
      source.rotation.y = THREE.Math.euclideanModulo(
        source.rotation.y + deltaRotation,
        Math.PI * 2
      );
      // return the distance to the target
      return delta.length();
    };
  })();

  class Animal extends Component {
    constructor(gameObject, model) {
      super(gameObject);
      this.helper = gameObject.addComponent(StateDisplayHelper, model.size);
      const hitRadius = model.size / 2;
      const skinInstance = gameObject.addComponent(SkinInstance, model);
      skinInstance.mixer.timeScale = globals.moveSpeed / 4;
      const transform = gameObject.transform;
      const playerTransform = globals.player.gameObject.transform;
      const maxTurnSpeed = Math.PI * (globals.moveSpeed / 4);
      const targetHistory = [];
      let targetNdx = 0;

      function addHistory() {
        const targetGO = globals.congaLine[targetNdx];
        const newTargetPos = new THREE.Vector3();
        newTargetPos.copy(targetGO.transform.position);
        targetHistory.push(newTargetPos);
      }

      this.fsm = new FiniteStateMachine(
        {
          idle: {
            enter: () => {
              skinInstance.setAnimation("Idle");
            },
            update: () => {
              // check if player is near
              if (
                isClose(
                  transform,
                  hitRadius,
                  playerTransform,
                  globals.playerRadius
                )
              ) {
                //this.fsm.transition("waitForEnd");
                // display win screen
                blocker.style.display = "block";
                win.style.display = "block";
              }
            }
          },
          waitForEnd: {
            enter: () => {
              skinInstance.setAnimation("Jump");
            },
            update: () => {
              // get the gameObject at the end of the conga line
              const lastGO = globals.congaLine[globals.congaLine.length - 1];
              const deltaTurnSpeed = maxTurnSpeed * globals.deltaTime;
              const targetPos = lastGO.transform.position;
              aimTowardAndGetDistance(transform, targetPos, deltaTurnSpeed);
              // check if last thing in conga line is near
              if (
                isClose(
                  transform,
                  hitRadius,
                  lastGO.transform,
                  globals.playerRadius
                )
              ) {
                this.fsm.transition("goToLast");
              }
            }
          },
          goToLast: {
            enter: () => {
              // remember who we're following
              targetNdx = globals.congaLine.length - 1;
              // add ourselves to the conga line
              globals.congaLine.push(gameObject);
              skinInstance.setAnimation("Walk");
            },
            update: () => {
              addHistory();
              // walk to the oldest point in the history
              const targetPos = targetHistory[0];
              const maxVelocity = globals.moveSpeed * globals.deltaTime;
              const deltaTurnSpeed = maxTurnSpeed * globals.deltaTime;
              const distance = aimTowardAndGetDistance(
                transform,
                targetPos,
                deltaTurnSpeed
              );
              const velocity = distance;
              transform.translateOnAxis(
                kForward,
                Math.min(velocity, maxVelocity)
              );
              if (distance <= maxVelocity) {
                this.fsm.transition("follow");
              }
            }
          },
          follow: {
            update: () => {
              addHistory();
              // remove the oldest history and just put ourselves there.
              const targetPos = targetHistory.shift();
              transform.position.copy(targetPos);
              const deltaTurnSpeed = maxTurnSpeed * globals.deltaTime;
              aimTowardAndGetDistance(
                transform,
                targetHistory[0],
                deltaTurnSpeed
              );
            }
          }
        },
        "idle"
      );
    }
    update() {
      this.fsm.update();
      const dir = THREE.Math.radToDeg(this.gameObject.transform.rotation.y);
      this.helper.setState(`${this.fsm.state}:${dir.toFixed(0)}`);
    }
  }

  function init() {
    // hide the loading bar
    const loadingElem = document.querySelector("#loading");
    loadingElem.style.display = "none";

    prepModelsAndAnimations();

    {
      const gameObject = gameObjectManager.createGameObject(camera, "camera");
      globals.cameraInfo = gameObject.addComponent(CameraInfo);
    }

    {
      const gameObject = gameObjectManager.createGameObject(scene, "player");
      globals.player = gameObject.addComponent(Player);
      globals.congaLine = [gameObject];
    }

    const animalModelNames = ["zebra", "horse", "phoenix"];

    const gameObject = gameObjectManager.createGameObject(scene, "zebra");
    gameObject.addComponent(Animal, models["zebra"]);
    gameObject.transform.position.x = 50;
  }

  function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
    }
    return needResize;
  }

  let then = 0;
  function render(now) {
    // convert to seconds
    globals.time = now * 0.001;
    // make sure delta time isn't too big.
    globals.deltaTime = Math.min(globals.time - then, 1 / 20);
    then = globals.time;

    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }

    gameObjectManager.update();
    inputManager.update();

    renderer.render(scene, camera);

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

main();
