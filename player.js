/* eslint-disable complexity */
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

    // move backwards
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