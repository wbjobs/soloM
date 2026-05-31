import * as THREE from 'three';
import type { NodeObject } from './NodeFactory';

const DEVICE_TYPE_PRIORITY: Record<string, number> = {
  router: 7,
  firewall: 6,
  core_switch: 5,
  switch: 4,
  server: 3,
  host: 2,
  client: 1,
  unknown: 0,
};

interface LabelScreenInfo {
  id: string;
  node: NodeObject;
  screenX: number;
  screenY: number;
  distance: number;
  priority: number;
  width: number;
  height: number;
}

export class LabelOcclusionManager {
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private nodes: Map<string, NodeObject> = new Map();
  private visibleLabels: Set<string> = new Set();
  private maxVisibleLabels: number = 80;
  private minDistance: number = 0;
  private maxDistance: number = 100;
  private labelPadding: number = 4;

  constructor(camera: THREE.PerspectiveCamera, container: HTMLElement) {
    this.camera = camera;
    this.container = container;
  }

  public setNodes(nodes: Map<string, NodeObject>): void {
    this.nodes = nodes;
    this.visibleLabels.clear();
  }

  public update(nodes: Map<string, NodeObject>): void {
    this.nodes = nodes;

    const screenInfos = this.projectAllLabels();
    const visible = this.resolveOcclusion(screenInfos);
    this.applyVisibility(visible);
  }

  private projectAllLabels(): LabelScreenInfo[] {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const halfW = width / 2;
    const halfH = height / 2;
    const cameraPos = this.camera.position;

    const infos: LabelScreenInfo[] = [];

    this.nodes.forEach((node, id) => {
      const worldPos = new THREE.Vector3();
      node.mesh.getWorldPosition(worldPos);

      const distance = cameraPos.distanceTo(worldPos);
      const projected = worldPos.clone().project(this.camera);

      if (projected.z > 1) {
        node.labelElement.classList.add('topo-label-behind');
        return;
      }
      node.labelElement.classList.remove('topo-label-behind');

      const screenX = projected.x * halfW + halfW;
      const screenY = -projected.y * halfH + halfH;

      const isOnScreen = screenX >= -50 && screenX <= width + 50 &&
                         screenY >= -50 && screenY <= height + 50;

      if (!isOnScreen) {
        node.labelElement.classList.add('topo-label-offscreen');
        return;
      }
      node.labelElement.classList.remove('topo-label-offscreen');

      const priority = DEVICE_TYPE_PRIORITY[node.device.type] ?? 0;

      const labelWidth = node.labelElement.offsetWidth || 80;
      const labelHeight = node.labelElement.offsetHeight || 24;

      infos.push({
        id,
        node,
        screenX,
        screenY,
        distance,
        priority,
        width: labelWidth,
        height: labelHeight,
      });
    });

    return infos;
  }

  private resolveOcclusion(infos: LabelScreenInfo[]): Set<string> {
    infos.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.distance - b.distance;
    });

    const visible = new Set<string>();
    const occupiedRects: Array<{
      x1: number; y1: number;
      x2: number; y2: number;
    }> = [];

    const pad = this.labelPadding;

    for (const info of infos) {
      if (visible.size >= this.maxVisibleLabels) break;

      if (info.distance > this.maxDistance) continue;

      const rect = {
        x1: info.screenX - info.width / 2 - pad,
        y1: info.screenY - info.height / 2 - pad,
        x2: info.screenX + info.width / 2 + pad,
        y2: info.screenY + info.height / 2 + pad,
      };

      let overlaps = false;
      for (const existing of occupiedRects) {
        if (rect.x1 < existing.x2 && rect.x2 > existing.x1 &&
            rect.y1 < existing.y2 && rect.y2 > existing.y1) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        visible.add(info.id);
        occupiedRects.push(rect);
      }
    }

    return visible;
  }

  private applyVisibility(visible: Set<string>): void {
    this.nodes.forEach((node, id) => {
      const el = node.labelElement;
      const isVisible = visible.has(id);

      if (isVisible && !this.visibleLabels.has(id)) {
        el.classList.remove('topo-label-hidden');
        el.classList.add('topo-label-visible');
      } else if (!isVisible && this.visibleLabels.has(id)) {
        el.classList.remove('topo-label-visible');
        el.classList.add('topo-label-hidden');
      } else if (!isVisible && !this.visibleLabels.has(id)) {
        el.classList.add('topo-label-hidden');
        el.classList.remove('topo-label-visible');
      }

      const worldPos = new THREE.Vector3();
      node.mesh.getWorldPosition(worldPos);
      const distance = this.camera.position.distanceTo(worldPos);

      const maxDist = this.maxDistance;
      if (distance > maxDist * 0.7) {
        const fadeFactor = 1 - (distance - maxDist * 0.7) / (maxDist * 0.3);
        el.style.opacity = String(Math.max(0, Math.min(1, fadeFactor)));
      } else {
        el.style.opacity = '1';
      }
    });

    this.visibleLabels = visible;
  }

  public setMaxVisibleLabels(count: number): void {
    this.maxVisibleLabels = count;
  }

  public setDistanceRange(min: number, max: number): void {
    this.minDistance = min;
    this.maxDistance = max;
  }

  public clear(): void {
    this.nodes.forEach(node => {
      node.labelElement.classList.remove(
        'topo-label-hidden',
        'topo-label-visible',
        'topo-label-behind',
        'topo-label-offscreen',
        'topo-label-highlighted'
      );
      node.labelElement.style.opacity = '1';
    });
    this.nodes.clear();
    this.visibleLabels.clear();
  }

  public dispose(): void {
    this.clear();
  }
}
