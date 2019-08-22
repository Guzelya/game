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
    let block = false;
    const pos = this.gameObject.transform.position.clone();
    pos.y += 30;
    let raycaster = new THREE.Raycaster(pos, direction);
    for ( let obstacle of globals.obstacles){
      const intersect = raycaster.intersectObjects(obstacle.gameObject);
      if( intersect.length > 0){
        if(intersect[0].distance < 50){
          block = true;
          break;
        }
      }
    }
    
    

    // rotate 10 degrees on right arrow key press
    if (inputManager.keys.right.down) {
      transform.rotation.y -= Math.PI / 36;
    }

    // rotate 10 degrees on left arrow key press
    if (inputManager.keys.left.down) {
      // rotates 10 degrees
      transform.rotation.y += Math.PI / 36;

      // the following code gets the direction vector that our bird is facing
      var matrix = new THREE.Matrix4();
      matrix.extractRotation(transform.matrix);

      direction.applyMatrix4(matrix);
    }

    // move in direction of head by one unit
    if (inputManager.keys.up.down && !block) {
      transform.translateOnAxis(direction, 1);
    }

    // move backwards
    if (inputManager.keys.down.down) {
      transform.translateOnAxis(direction, -1);
    }

    //camera follows (position, at speed (between 0 and 1))
    globals.camera.position.lerp(
      {
        x: this.gameObject.transform.position.x - 50,
        y: this.gameObject.transform.position.y + 70,
        z: this.gameObject.transform.position.z
      },
      0.5
    );

    //camera is always facing player
    globals.camera.lookAt(this.gameObject.transform.position);
  }


}
