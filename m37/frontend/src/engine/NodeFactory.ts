import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import * as TWEEN from '@tweenjs/tween.js';
import type { Device } from '../types';
import { DEVICE_COLORS, DEVICE_SIZES, DEVICE_SHAPES } from '../config/deviceConfig';

export interface NodeObject {
  device: Device;
  mesh: THREE.Mesh;
  glow: THREE.Mesh;
  label: CSS2DObject;
  labelElement: HTMLElement;
  originalColor: number;
}

const GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>();

function getSharedGeometry(shape: string, size: number): THREE.BufferGeometry {
  const key = `${shape}_${size.toFixed(2)}`;
  if (!GEOMETRY_CACHE.has(key)) {
    let geo: THREE.BufferGeometry;
    switch (shape) {
      case 'box':
        geo = new THREE.BoxGeometry(size, size * 0.6, size * 0.6);
        break;
      case 'cylinder':
        geo = new THREE.CylinderGeometry(size * 0.5, size * 0.5, size * 0.8, 16);
        break;
      case 'cone':
        geo = new THREE.ConeGeometry(size * 0.5, size, 16);
        break;
      case 'sphere':
      default:
        geo = new THREE.IcosahedronGeometry(size * 0.5, 1);
        break;
    }
    GEOMETRY_CACHE.set(key, geo);
  }
  return GEOMETRY_CACHE.get(key)!;
}

const GLOW_GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>();

function getSharedGlowGeometry(size: number): THREE.BufferGeometry {
  const key = `glow_${size.toFixed(2)}`;
  if (!GLOW_GEOMETRY_CACHE.has(key)) {
    GLOW_GEOMETRY_CACHE.set(key, new THREE.SphereGeometry(size * 0.8, 16, 16));
  }
  return GLOW_GEOMETRY_CACHE.get(key)!;
}

export class NodeFactory {
  private nodes: Map<string, NodeObject> = new Map();
  private objects: THREE.Object3D[] = [];
  private animations: Array<() => void> = [];
  private css2dRenderer: CSS2DRenderer;

  constructor(css2dRenderer: CSS2DRenderer) {
    this.css2dRenderer = css2dRenderer;
  }

  public createNodes(devices: Device[]): Map<string, NodeObject> {
    this.nodes.clear();
    this.objects = [];

    devices.forEach(device => {
      if (!device.position) return;

      const nodeObject = this.createNode(device);
      this.nodes.set(device.id, nodeObject);
      this.objects.push(nodeObject.mesh, nodeObject.glow);
    });

    return this.nodes;
  }

  private createNode(device: Device): NodeObject {
    const type = device.type;
    const color = DEVICE_COLORS[type] ?? DEVICE_COLORS.unknown;
    const size = DEVICE_SIZES[type] ?? DEVICE_SIZES.unknown;
    const shape = DEVICE_SHAPES[type] ?? DEVICE_SHAPES.unknown;

    const geometry = getSharedGeometry(shape, size);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.3,
      roughness: 0.4,
      emissive: color,
      emissiveIntensity: 0.1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(device.position!.x, device.position!.y, device.position!.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.deviceId = device.id;

    const glow = this.createGlowMesh(size, color);
    mesh.add(glow);

    const { label, labelElement } = this.createLabel(device.name || device.id, type);
    label.position.set(0, size + 0.5, 0);
    mesh.add(label);

    this.addFloatAnimation(mesh);
    this.addPulseAnimation(glow);

    return {
      device,
      mesh,
      glow,
      label,
      labelElement,
      originalColor: color,
    };
  }

  private createGlowMesh(size: number, color: number): THREE.Mesh {
    const glowGeometry = getSharedGlowGeometry(size);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.scale.set(1.5, 1.5, 1.5);
    return glow;
  }

  private createLabel(text: string, deviceType: string): { label: CSS2DObject; labelElement: HTMLElement } {
    const container = document.createElement('div');
    container.className = 'topo-node-label';
    container.setAttribute('data-device-type', deviceType);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'topo-label-name';
    nameSpan.textContent = text.length > 16 ? text.substring(0, 15) + '…' : text;

    const typeSpan = document.createElement('span');
    typeSpan.className = 'topo-label-type';
    typeSpan.textContent = deviceType.replace('_', ' ');

    container.appendChild(nameSpan);
    container.appendChild(typeSpan);

    const label = new CSS2DObject(container);
    label.userData.isLabel = true;

    return { label, labelElement: container };
  }

  private addFloatAnimation(mesh: THREE.Mesh): void {
    const baseY = mesh.position.y;
    const offset = Math.random() * Math.PI * 2;
    const duration = 2000 + Math.random() * 1000;

    const animate = () => {
      const time = Date.now() / duration + offset;
      mesh.position.y = baseY + Math.sin(time) * 0.1;
    };

    this.animations.push(animate);
  }

  private addPulseAnimation(glow: THREE.Mesh): void {
    const originalScale = 1.5;
    const animate = () => {
      const time = Date.now() * 0.002;
      const scale = originalScale + Math.sin(time) * 0.2;
      glow.scale.set(scale, scale, scale);
      (glow.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(time) * 0.05;
    };

    this.animations.push(animate);
  }

  public updateAnimations(): void {
    TWEEN.update();
    this.animations.forEach(animate => animate());
  }

  public highlightNode(deviceId: string): void {
    const node = this.nodes.get(deviceId);
    if (!node) return;

    const material = node.mesh.material as THREE.MeshStandardMaterial;

    new TWEEN.Tween(material)
      .to({ emissiveIntensity: 0.8 }, 200)
      .easing(TWEEN.Easing.Quadratic.Out)
      .start();

    new TWEEN.Tween(node.mesh.scale)
      .to({ x: 1.3, y: 1.3, z: 1.3 }, 200)
      .easing(TWEEN.Easing.Back.Out)
      .start();

    (node.glow.material as THREE.MeshBasicMaterial).opacity = 0.4;

    node.labelElement.classList.add('topo-label-highlighted');
  }

  public clearHighlight(): void {
    this.nodes.forEach((node) => {
      const material = node.mesh.material as THREE.MeshStandardMaterial;

      new TWEEN.Tween(material)
        .to({ emissiveIntensity: 0.1 }, 300)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

      new TWEEN.Tween(node.mesh.scale)
        .to({ x: 1, y: 1, z: 1 }, 300)
        .easing(TWEEN.Easing.Back.Out)
        .start();

      (node.glow.material as THREE.MeshBasicMaterial).opacity = 0.15;

      node.labelElement.classList.remove('topo-label-highlighted');
    });
  }

  public getObjects(): THREE.Object3D[] {
    return this.objects;
  }

  public getNodes(): Map<string, NodeObject> {
    return this.nodes;
  }

  public clear(): void {
    this.nodes.forEach(node => {
      if (node.labelElement.parentNode) {
        node.labelElement.parentNode.removeChild(node.labelElement);
      }
    });
    this.nodes.clear();
    this.animations = [];
    this.objects = [];
  }
}
