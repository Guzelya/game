/* eslint-disable complexity */
/* eslint-disable react/no-multi-comp */

/* eslint-disable max-statements */
"use strict";

/* global THREE */
var vertex = new THREE.Vector3();
var color = new THREE.Color();
// eslint-disable-next-line quotes

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

  // floor

  var floorGeometry = new THREE.PlaneBufferGeometry(2000, 2000, 100, 100);
  floorGeometry.rotateX(-Math.PI / 2);

  // vertex displacement

  var position = floorGeometry.attributes.position;

  for (var i = 0, l = position.count; i < l; i++) {
    vertex.fromBufferAttribute(position, i);

    vertex.x += Math.random() * 20 - 10;
    vertex.y += Math.random() * 2;
    vertex.z += Math.random() * 20 - 10;

    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  floorGeometry = floorGeometry.toNonIndexed(); // ensure each face has unique vertices

  position = floorGeometry.attributes.position;
  var colors = [];

  for (var i = 0, l = position.count; i < l; i++) {
    color.setHSL(Math.random() * 0.3 + 0.5, 0.75, Math.random() * 0.25 + 0.75);
    colors.push(color.r, color.g, color.b);
  }

  floorGeometry.addAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3)
  );

  var floorMaterial = new THREE.MeshBasicMaterial({
    vertexColors: THREE.VertexColors
  });

  var floor = new THREE.Mesh(floorGeometry, floorMaterial);
  scene.add(floor);
  // end floor

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
    Object.values(models).forEach(model => {
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

  class GameObjectManager {
    constructor() {
      this.gameObjects = new SafeArray();
    }
    createGameObject(parent, name) {
      const gameObject = new GameObject(parent, name);
      this.gameObjects.add(gameObject);
      return gameObject;
    }
    removeGameObject(gameObject) {
      this.gameObjects.remove(gameObject);
    }
    update() {
      this.gameObjects.forEach(gameObject => gameObject.update());
    }
  }

  const kForward = new THREE.Vector3(0, 0, 1);
  const globals = {
    time: 0,
    deltaTime: 0,
    moveSpeed: 16,
    camera
  };
  const gameObjectManager = new GameObjectManager();
  const inputManager = new InputManager();

  class GameObject {
    constructor(parent, name) {
      this.name = name;
      this.components = [];
      this.transform = new THREE.Object3D();
      parent.add(this.transform);
    }
    addComponent(ComponentType, ...args) {
      const component = new ComponentType(this, ...args);
      this.components.push(component);
      return component;
    }
    removeComponent(component) {
      removeArrayElement(this.components, component);
    }
    getComponent(ComponentType) {
      return this.components.find(c => c instanceof ComponentType);
    }
    update() {
      for (const component of this.components) {
        component.update();
      }
    }
  }

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

  class Player extends Component {
    constructor(gameObject) {
      super(gameObject);
      const model = models.phoenix;
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