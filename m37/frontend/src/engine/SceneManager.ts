import * as THREE from 'three';

export class SceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private gridHelper: THREE.GridHelper | null = null;
  private axesHelper: THREE.AxesHelper | null = null;
  private ambientLight: THREE.AmbientLight;
  private directionalLight: THREE.DirectionalLight;
  private pointLights: THREE.PointLight[] = [];
  private options: {
    backgroundColor: number;
    showGrid: boolean;
    showAxes: boolean;
  };

  constructor(options: {
    backgroundColor: number;
    showGrid: boolean;
    showAxes: boolean;
  }) {
    this.options = options;
    this.scene = this.createScene();
    this.camera = this.createCamera();
    this.ambientLight = this.createAmbientLight();
    this.directionalLight = this.createDirectionalLight();
    this.pointLights = this.createPointLights();
    this.setupHelpers();
    this.setupFog();
  }

  private createScene(): THREE.Scene {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(this.options.backgroundColor);
    return scene;
  }

  private createCamera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(20, 20, 20);
    return camera;
  }

  private createAmbientLight(): THREE.AmbientLight {
    const light = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(light);
    return light;
  }

  private createDirectionalLight(): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(50, 100, 50);
    light.castShadow = true;
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 500;
    light.shadow.camera.left = -100;
    light.shadow.camera.right = 100;
    light.shadow.camera.top = 100;
    light.shadow.camera.bottom = -100;
    this.scene.add(light);
    return light;
  }

  private createPointLights(): THREE.PointLight[] {
    const positions = [
      [30, 30, 30],
      [-30, 30, -30],
      [30, -30, -30],
      [-30, -30, 30],
    ];
    const lights: THREE.PointLight[] = [];

    positions.forEach((pos, i) => {
      const color = i % 2 === 0 ? 0x4488ff : 0xff8844;
      const light = new THREE.PointLight(color, 0.3, 100);
      light.position.set(pos[0], pos[1], pos[2]);
      this.scene.add(light);
      lights.push(light);
    });

    return lights;
  }

  private setupHelpers(): void {
    if (this.options.showGrid) {
      this.gridHelper = new THREE.GridHelper(100, 100, 0x333333, 0x222222);
      this.gridHelper.position.y = -5;
      this.scene.add(this.gridHelper);
    }

    if (this.options.showAxes) {
      this.axesHelper = new THREE.AxesHelper(10);
      this.scene.add(this.axesHelper);
    }
  }

  private setupFog(): void {
    this.scene.fog = new THREE.FogExp2(this.options.backgroundColor, 0.008);
  }

  public getScene(): THREE.Scene {
    return this.scene;
  }

  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  public addObjects(objects: THREE.Object3D[]): void {
    objects.forEach(obj => this.scene.add(obj));
  }

  public removeObjects(objects: THREE.Object3D[]): void {
    objects.forEach(obj => {
      this.scene.remove(obj);
      this.disposeObject(obj);
    });
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }

  public setShowGrid(show: boolean): void {
    if (show && !this.gridHelper) {
      this.gridHelper = new THREE.GridHelper(100, 100, 0x333333, 0x222222);
      this.gridHelper.position.y = -5;
      this.scene.add(this.gridHelper);
    } else if (!show && this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper = null;
    }
  }

  public setShowAxes(show: boolean): void {
    if (show && !this.axesHelper) {
      this.axesHelper = new THREE.AxesHelper(10);
      this.scene.add(this.axesHelper);
    } else if (!show && this.axesHelper) {
      this.scene.remove(this.axesHelper);
      this.axesHelper = null;
    }
  }
}
