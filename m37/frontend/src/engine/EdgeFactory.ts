import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import type { Connection } from '../types';
import type { NodeObject } from './NodeFactory';
import { CONNECTION_COLORS } from '../config/deviceConfig';

export interface EdgeObject {
  connection: Connection;
  line: THREE.Mesh;
  glow: THREE.Mesh;
  fromNode: string;
  toNode: string;
  originalColor: number;
  curve: THREE.CatmullRomCurve3;
}

export interface RoutePacket {
  mesh: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  duration: number;
  startTime: number;
  fromDevice: string;
  toDevice: string;
}

export class EdgeFactory {
  private edges: EdgeObject[] = [];
  private objects: THREE.Object3D[] = [];
  private animations: Array<() => void> = [];
  private highlightedEdges: Set<number> = new Set();

  private routeEdges: Set<number> = new Set();
  private routePackets: RoutePacket[] = [];
  private routeAnimationId: number | null = null;
  private routeCurvePoints: Map<number, THREE.Vector3[]> = new Map();

  public createEdges(
    connections: Connection[],
    nodeMap: Map<string, NodeObject>
  ): EdgeObject[] {
    this.edges = [];
    this.objects = [];
    this.highlightedEdges.clear();
    this.clearRoute();

    const totalConnections = connections.length;
    const isLargeNetwork = totalConnections > 100;

    connections.forEach((connection, index) => {
      const fromNode = nodeMap.get(connection.from);
      const toNode = nodeMap.get(connection.to);

      if (!fromNode || !toNode) return;

      const edgeObject = this.createEdge(connection, fromNode, toNode, index, isLargeNetwork);
      this.edges.push(edgeObject);
      this.objects.push(edgeObject.line, edgeObject.glow);
    });

    return this.edges;
  }

  private createEdge(
    connection: Connection,
    fromNode: NodeObject,
    toNode: NodeObject,
    index: number,
    isLargeNetwork: boolean
  ): EdgeObject {
    const fromPos = fromNode.mesh.position.clone();
    const toPos = toNode.mesh.position.clone();

    const bandwidth = connection.bandwidth || 1;
    const lineWidth = Math.min(0.1 + bandwidth * 0.05, 0.5);

    const connType = connection.type || 'default';
    const color = CONNECTION_COLORS[connType] ?? CONNECTION_COLORS.default;

    const curve = this.createCurve(fromPos, toPos, index);

    const tubularSegments = isLargeNetwork ? 20 : 64;
    const radialSegments = isLargeNetwork ? 4 : 8;

    const lineGeometry = new THREE.TubeGeometry(curve, tubularSegments, lineWidth * 0.1, radialSegments, false);
    const lineMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: isLargeNetwork ? 0.4 : 0.6,
    });
    const line = new THREE.Mesh(lineGeometry, lineMaterial);

    if (!isLargeNetwork) {
      const glowGeometry = new THREE.TubeGeometry(curve, tubularSegments, lineWidth * 0.3, radialSegments, false);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.1,
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);

      this.addDataFlowAnimation(curve, index);

      return {
        connection,
        line,
        glow,
        fromNode: connection.from,
        toNode: connection.to,
        originalColor: color,
        curve,
      };
    }

    const glowGeometry = new THREE.TubeGeometry(curve, 12, lineWidth * 0.2, 4, false);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.05,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);

    if (index % 3 === 0) {
      this.addDataFlowAnimation(curve, index);
    }

    return {
      connection,
      line,
      glow,
      fromNode: connection.from,
      toNode: connection.to,
      originalColor: color,
      curve,
    };
  }

  private createCurve(
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3,
    index: number
  ): THREE.CatmullRomCurve3 {
    const midPoint = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5);
    const distance = fromPos.distanceTo(toPos);

    const offset = (index % 2 === 0 ? 1 : -1) * distance * 0.15;
    const controlPoint = midPoint.clone();
    controlPoint.y += Math.abs(offset) + distance * 0.1;
    controlPoint.x += offset * 0.5;
    controlPoint.z += offset * 0.3;

    const points = [
      fromPos.clone(),
      controlPoint,
      toPos.clone(),
    ];

    return new THREE.CatmullRomCurve3(points);
  }

  private addDataFlowAnimation(
    curve: THREE.CatmullRomCurve3,
    index: number
  ): void {
    const dotGeometry = new THREE.SphereGeometry(0.1, 6, 6);
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);

    const duration = 3000 + Math.random() * 2000;
    const startTime = Date.now() + index * 300;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = (elapsed % duration) / duration;

      const position = curve.getPoint(t);
      dot.position.copy(position);

      const scale = 0.5 + Math.sin(t * Math.PI) * 0.5;
      dot.scale.setScalar(scale);
      dotMaterial.opacity = 0.9 * Math.sin(t * Math.PI);
    };

    this.animations.push(animate);
    this.objects.push(dot);
  }

  public showRoute(edgeIndices: number[], pathDeviceIds: string[]): void {
    this.clearRoute();

    edgeIndices.forEach(idx => {
      if (idx >= 0 && idx < this.edges.length) {
        this.routeEdges.add(idx);
        const edge = this.edges[idx];

        const lineMat = edge.line.material as THREE.MeshBasicMaterial;
        const glowMat = edge.glow.material as THREE.MeshBasicMaterial;

        new TWEEN.Tween(lineMat)
          .to({ opacity: 1.0 }, 300)
          .easing(TWEEN.Easing.Quadratic.Out)
          .start();

        new TWEEN.Tween(glowMat)
          .to({ opacity: 0.5 }, 300)
          .easing(TWEEN.Easing.Quadratic.Out)
          .start();

        lineMat.color.setHex(0x00ff88);
        glowMat.color.setHex(0x00ff88);

        const points = edge.curve.getPoints(100);
        this.routeCurvePoints.set(idx, points);
      }
    });

    for (let i = 0; i < this.edges.length; i++) {
      if (!this.routeEdges.has(i)) {
        const edge = this.edges[i];
        const lineMat = edge.line.material as THREE.MeshBasicMaterial;
        const glowMat = edge.glow.material as THREE.MeshBasicMaterial;

        new TWEEN.Tween(lineMat)
          .to({ opacity: 0.1 }, 300)
          .easing(TWEEN.Easing.Quadratic.Out)
          .start();

        new TWEEN.Tween(glowMat)
          .to({ opacity: 0.02 }, 300)
          .easing(TWEEN.Easing.Quadratic.Out)
          .start();
      }
    }

    this.startPacketAnimation(edgeIndices, pathDeviceIds);
  }

  private startPacketAnimation(edgeIndices: number[], pathDeviceIds: string[]): void {
    const packetCount = Math.min(5, edgeIndices.length + 1);

    for (let p = 0; p < packetCount; p++) {
      for (let i = 0; i < edgeIndices.length; i++) {
        const edgeIdx = edgeIndices[i];
        if (edgeIdx < 0 || edgeIdx >= this.edges.length) continue;

        const edge = this.edges[edgeIdx];
        const delay = p * 1500 + i * 300;

        setTimeout(() => {
          this.createRoutePacket(edge, pathDeviceIds[i], pathDeviceIds[i + 1]);
        }, delay);
      }
    }
  }

  private createRoutePacket(edge: EdgeObject, fromDevice: string, toDevice: string): void {
    const packetGeometry = new THREE.SphereGeometry(0.22, 12, 12);
    const packetMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 1.0,
    });
    const packet = new THREE.Mesh(packetGeometry, packetMaterial);

    const glowGeometry = new THREE.SphereGeometry(0.35, 12, 12);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    packet.add(glow);

    const duration = 1200;
    const startTime = Date.now();

    const packetObj: RoutePacket = {
      mesh: packet,
      curve: edge.curve,
      duration,
      startTime,
      fromDevice,
      toDevice,
    };

    this.routePackets.push(packetObj);
    this.objects.push(packet);

    if (edge.glow.parent) {
      edge.glow.parent.add(packet);
    } else {
      this.edges[0].line.parent?.add(packet);
    }

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1.0);

      if (t >= 1.0) {
        this.removeRoutePacket(packetObj);
        return;
      }

      const position = edge.curve.getPoint(t);
      packet.position.copy(position);

      const pulseScale = 0.8 + Math.sin(t * Math.PI * 4) * 0.3;
      packet.scale.setScalar(pulseScale);
      glow.scale.setScalar(1.0 + Math.sin(t * Math.PI * 2) * 0.3);

      packetMaterial.opacity = 0.8 + Math.sin(t * Math.PI * 4) * 0.2;
      glowMaterial.opacity = 0.3 + Math.sin(t * Math.PI) * 0.2;
    };

    this.animations.push(animate);
  }

  private removeRoutePacket(packet: RoutePacket): void {
    const idx = this.routePackets.indexOf(packet);
    if (idx !== -1) {
      this.routePackets.splice(idx, 1);
    }

    const animIdx = this.animations.findIndex(a => {
      const animStr = a.toString();
      return animStr.includes('RoutePacket') || animStr.includes('packetObj');
    });
    if (animIdx !== -1) {
      this.animations.splice(animIdx, 1);
    }

    if (packet.mesh.parent) {
      packet.mesh.parent.remove(packet.mesh);
    }
    packet.mesh.geometry.dispose();
    if (packet.mesh.material instanceof THREE.Material) {
      packet.mesh.material.dispose();
    }

    const objIdx = this.objects.indexOf(packet.mesh);
    if (objIdx !== -1) {
      this.objects.splice(objIdx, 1);
    }
  }

  public clearRoute(): void {
    this.routePackets.forEach(packet => {
      if (packet.mesh.parent) {
        packet.mesh.parent.remove(packet.mesh);
      }
      packet.mesh.geometry.dispose();
      if (packet.mesh.material instanceof THREE.Material) {
        packet.mesh.material.dispose();
      }
    });

    this.routePackets = [];
    this.routeCurvePoints.clear();

    if (this.routeAnimationId !== null) {
      cancelAnimationFrame(this.routeAnimationId);
      this.routeAnimationId = null;
    }

    this.edges.forEach((edge) => {
      const lineMat = edge.line.material as THREE.MeshBasicMaterial;
      const glowMat = edge.glow.material as THREE.MeshBasicMaterial;

      lineMat.color.setHex(edge.originalColor);
      glowMat.color.setHex(edge.originalColor);

      new TWEEN.Tween(lineMat)
        .to({ opacity: 0.6 }, 300)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

      new TWEEN.Tween(glowMat)
        .to({ opacity: 0.1 }, 300)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
    });

    this.routeEdges.clear();
    this.highlightedEdges.clear();
  }

  public updateAnimations(): void {
    TWEEN.update();
    this.animations.forEach(animate => animate());
  }

  public highlightEdges(deviceId: string): void {
    if (this.routeEdges.size > 0) return;

    this.clearHighlight();

    this.edges.forEach((edge, index) => {
      if (edge.fromNode === deviceId || edge.toNode === deviceId) {
        this.highlightedEdges.add(index);

        const material = edge.line.material as THREE.MeshBasicMaterial;
        const glowMaterial = edge.glow.material as THREE.MeshBasicMaterial;

        new TWEEN.Tween(material)
          .to({ opacity: 1.0 }, 200)
          .easing(TWEEN.Easing.Quadratic.Out)
          .start();

        new TWEEN.Tween(glowMaterial)
          .to({ opacity: 0.3 }, 200)
          .easing(TWEEN.Easing.Quadratic.Out)
          .start();
      }
    });
  }

  public clearHighlight(): void {
    if (this.routeEdges.size > 0) return;

    this.edges.forEach((edge) => {
      const material = edge.line.material as THREE.MeshBasicMaterial;
      const glowMaterial = edge.glow.material as THREE.MeshBasicMaterial;

      new TWEEN.Tween(material)
        .to({ opacity: 0.6 }, 300)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

      new TWEEN.Tween(glowMaterial)
        .to({ opacity: 0.1 }, 300)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
    });

    this.highlightedEdges.clear();
  }

  public getObjects(): THREE.Object3D[] {
    return this.objects;
  }

  public getEdges(): EdgeObject[] {
    return this.edges;
  }

  public clear(): void {
    this.clearRoute();
    this.edges = [];
    this.animations = [];
    this.objects = [];
    this.highlightedEdges.clear();
  }
}
