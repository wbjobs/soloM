import * as THREE from 'three';
import type { Device } from '../types';
import type { NodeObject } from './NodeFactory';

export class InteractionManager {
  private domElement: HTMLElement;
  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private nodes: Map<string, NodeObject> = new Map();
  private meshes: THREE.Mesh[] = [];
  private hoveredNode: NodeObject | null = null;
  private selectedNode: NodeObject | null = null;

  private onClickCallback: ((device: Device | null) => void) | null = null;
  private onHoverCallback: ((device: Device | null) => void) | null = null;

  private boundOnMouseMove: (event: MouseEvent) => void;
  private boundOnClick: (event: MouseEvent) => void;

  constructor(
    domElement: HTMLElement,
    camera: THREE.PerspectiveCamera,
    scene: THREE.Scene
  ) {
    this.domElement = domElement;
    this.camera = camera;
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnClick = this.onClick.bind(this);

    this.domElement.addEventListener('mousemove', this.boundOnMouseMove);
    this.domElement.addEventListener('click', this.boundOnClick);
  }

  public setNodes(nodes: Map<string, NodeObject>): void {
    this.nodes = nodes;
    this.meshes = Array.from(nodes.values()).map(n => n.mesh);
    this.hoveredNode = null;
    this.selectedNode = null;
  }

  private onMouseMove(event: MouseEvent): void {
    this.updateMousePosition(event);
    this.updateHover();
  }

  private onClick(event: MouseEvent): void {
    this.updateMousePosition(event);
    const intersects = this.raycaster.intersectObjects(this.meshes);

    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh;
      const deviceId = mesh.userData.deviceId;
      const node = this.nodes.get(deviceId);

      if (node) {
        this.selectedNode = node;
        if (this.onClickCallback) {
          this.onClickCallback(node.device);
        }
      }
    } else {
      this.selectedNode = null;
      if (this.onClickCallback) {
        this.onClickCallback(null);
      }
    }
  }

  private updateMousePosition(event: MouseEvent): void {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private updateHover(): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.meshes);

    let newHovered: NodeObject | null = null;

    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh;
      const deviceId = mesh.userData.deviceId;
      newHovered = this.nodes.get(deviceId) || null;
    }

    if (newHovered !== this.hoveredNode) {
      this.hoveredNode = newHovered;

      if (this.onHoverCallback) {
        this.onHoverCallback(newHovered ? newHovered.device : null);
      }

      this.domElement.style.cursor = newHovered ? 'pointer' : 'grab';
    }
  }

  public update(): void {
  }

  public onNodeClick(callback: (device: Device | null) => void): void {
    this.onClickCallback = callback;
  }

  public onNodeHover(callback: (device: Device | null) => void): void {
    this.onHoverCallback = callback;
  }

  public getSelectedNode(): NodeObject | null {
    return this.selectedNode;
  }

  public getHoveredNode(): NodeObject | null {
    return this.hoveredNode;
  }

  public clear(): void {
    this.nodes.clear();
    this.meshes = [];
    this.hoveredNode = null;
    this.selectedNode = null;
  }

  public dispose(): void {
    this.domElement.removeEventListener('mousemove', this.boundOnMouseMove);
    this.domElement.removeEventListener('click', this.boundOnClick);
    this.clear();
    this.onClickCallback = null;
    this.onHoverCallback = null;
  }
}
