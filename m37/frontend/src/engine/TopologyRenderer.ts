import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Device, Connection } from '../types';
import { SceneManager } from './SceneManager';
import { NodeFactory } from './NodeFactory';
import { EdgeFactory } from './EdgeFactory';
import { InteractionManager } from './InteractionManager';
import { LabelOcclusionManager } from './LabelOcclusionManager';

export interface RendererOptions {
  antialias?: boolean;
  backgroundColor?: number;
  showGrid?: boolean;
  showAxes?: boolean;
  autoRotate?: boolean;
}

export class TopologyRenderer {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private css2dRenderer: CSS2DRenderer;
  private sceneManager: SceneManager;
  private nodeFactory: NodeFactory;
  private edgeFactory: EdgeFactory;
  private interactionManager: InteractionManager;
  private labelOcclusion: LabelOcclusionManager;
  private controls: OrbitControls;
  private animationId: number | null = null;
  private devices: Device[] = [];
  private connections: Connection[] = [];
  private options: Required<RendererOptions>;
  private lastLabelUpdate: number = 0;

  constructor(container: HTMLElement, options: RendererOptions = {}) {
    this.container = container;
    this.options = {
      antialias: true,
      backgroundColor: 0x0a0e17,
      showGrid: true,
      showAxes: false,
      autoRotate: false,
      ...options,
    };

    this.renderer = this.createRenderer();
    this.css2dRenderer = this.createCSS2DRenderer();
    this.sceneManager = new SceneManager(this.options);
    this.nodeFactory = new NodeFactory(this.css2dRenderer);
    this.edgeFactory = new EdgeFactory();
    this.controls = this.createControls();
    this.interactionManager = new InteractionManager(
      this.renderer.domElement,
      this.sceneManager.getCamera(),
      this.sceneManager.getScene()
    );
    this.labelOcclusion = new LabelOcclusionManager(
      this.sceneManager.getCamera(),
      this.container
    );

    this.setup();
    this.animate();
  }

  private createRenderer(): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({
      antialias: this.options.antialias,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    this.container.appendChild(renderer.domElement);
    return renderer;
  }

  private createCSS2DRenderer(): CSS2DRenderer {
    const renderer = new CSS2DRenderer();
    renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(renderer.domElement);
    return renderer;
  }

  private createControls(): OrbitControls {
    const controls = new OrbitControls(
      this.sceneManager.getCamera(),
      this.renderer.domElement
    );
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 100;
    controls.autoRotate = this.options.autoRotate;
    controls.autoRotateSpeed = 0.5;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    return controls;
  }

  private setup(): void {
    window.addEventListener('resize', this.onResize.bind(this));
    this.onResize();
  }

  private onResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.sceneManager.getCamera().aspect = width / height;
    this.sceneManager.getCamera().updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.css2dRenderer.setSize(width, height);
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(this.animate.bind(this));
    this.controls.update();
    this.nodeFactory.updateAnimations();
    this.edgeFactory.updateAnimations();
    this.interactionManager.update();

    const now = performance.now();
    if (now - this.lastLabelUpdate > 100) {
      this.labelOcclusion.update(this.nodeFactory.getNodes());
      this.lastLabelUpdate = now;
    }

    this.renderer.render(this.sceneManager.getScene(), this.sceneManager.getCamera());
    this.css2dRenderer.render(this.sceneManager.getScene(), this.sceneManager.getCamera());
  }

  public renderTopology(devices: Device[], connections: Connection[]): void {
    this.clear();
    this.devices = devices;
    this.connections = connections;

    const nodeMap = this.nodeFactory.createNodes(devices);
    this.edgeFactory.createEdges(connections, nodeMap);

    this.sceneManager.addObjects(this.nodeFactory.getObjects());
    this.sceneManager.addObjects(this.edgeFactory.getObjects());

    this.interactionManager.setNodes(nodeMap);
    this.labelOcclusion.setNodes(nodeMap);
    this.fitCameraToScene();
  }

  public clear(): void {
    this.sceneManager.removeObjects(this.nodeFactory.getObjects());
    this.sceneManager.removeObjects(this.edgeFactory.getObjects());
    this.nodeFactory.clear();
    this.edgeFactory.clear();
    this.interactionManager.clear();
    this.labelOcclusion.clear();
    this.devices = [];
    this.connections = [];
  }

  private fitCameraToScene(): void {
    const objects = [...this.nodeFactory.getObjects()];
    if (objects.length === 0) return;

    const box = new THREE.Box3();
    objects.forEach(obj => box.expandByObject(obj));

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.sceneManager.getCamera().fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 2.5;

    this.sceneManager.getCamera().position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ);
    this.controls.target.copy(center);
    this.controls.update();
  }

  public onNodeClick(callback: (device: Device | null) => void): void {
    this.interactionManager.onNodeClick(callback);
  }

  public onNodeHover(callback: (device: Device | null) => void): void {
    this.interactionManager.onNodeHover(callback);
  }

  public setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled;
  }

  public setShowGrid(show: boolean): void {
    this.sceneManager.setShowGrid(show);
  }

  public setShowAxes(show: boolean): void {
    this.sceneManager.setShowAxes(show);
  }

  public highlightNode(deviceId: string): void {
    this.nodeFactory.highlightNode(deviceId);
    this.edgeFactory.highlightEdges(deviceId);
  }

  public clearHighlight(): void {
    this.nodeFactory.clearHighlight();
    this.edgeFactory.clearHighlight();
  }

  public showRoute(edgeIndices: number[], pathDeviceIds: string[]): void {
    this.nodeFactory.clearHighlight();
    this.edgeFactory.showRoute(edgeIndices, pathDeviceIds);

    pathDeviceIds.forEach((id, index) => {
      this.nodeFactory.highlightNode(id);
    });

    this.labelOcclusion.setMaxVisibleLabels(Math.min(80, pathDeviceIds.length + 30));
  }

  public clearRoute(): void {
    this.edgeFactory.clearRoute();
    this.nodeFactory.clearHighlight();
    this.labelOcclusion.setMaxVisibleLabels(80);
  }

  public dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener('resize', this.onResize.bind(this));
    this.clear();
    this.renderer.dispose();
    this.controls.dispose();
    this.interactionManager.dispose();
    this.labelOcclusion.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    if (this.css2dRenderer.domElement.parentNode) {
      this.css2dRenderer.domElement.parentNode.removeChild(this.css2dRenderer.domElement);
    }
  }
}
