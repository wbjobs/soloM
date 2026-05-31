import { v4 as uuidv4 } from 'uuid';
import { Operation, AnyShape, CanvasState } from '../types';
import { OperationalTransform } from './OperationalTransform';

export class CanvasStateManager {
  private states: Map<string, CanvasState> = new Map();
  private history: Map<string, Operation[]> = new Map();
  private pendingOps: Map<string, Operation[]> = new Map();
  private appliedOpIds: Map<string, Set<string>> = new Map();

  getOrCreateCanvas(canvasId: string): CanvasState {
    if (!this.states.has(canvasId)) {
      this.states.set(canvasId, {
        canvasId,
        version: 0,
        shapes: new Map(),
      });
      this.history.set(canvasId, []);
      this.pendingOps.set(canvasId, []);
      this.appliedOpIds.set(canvasId, new Set());
    }
    return this.states.get(canvasId)!;
  }

  getShapes(canvasId: string): AnyShape[] {
    const state = this.getOrCreateCanvas(canvasId);
    return Array.from(state.shapes.values());
  }

  getVersion(canvasId: string): number {
    const state = this.getOrCreateCanvas(canvasId);
    return state.version;
  }

  getHistory(canvasId: string, fromVersion: number = 0): Operation[] {
    const ops = this.history.get(canvasId) || [];
    return ops.filter(op => op.version > fromVersion);
  }

  hasOperationBeenApplied(canvasId: string, opId: string): boolean {
    const applied = this.appliedOpIds.get(canvasId);
    return applied ? applied.has(opId) : false;
  }

  applyOperation(canvasId: string, op: Operation): {
    applied: Operation;
    transformedOps: Operation[];
  } {
    const state = this.getOrCreateCanvas(canvasId);
    const history = this.history.get(canvasId)!;
    const pending = this.pendingOps.get(canvasId)!;
    const applied = this.appliedOpIds.get(canvasId)!;

    if (applied.has(op.id)) {
      const existingOp = history.find(h => h.id === op.id);
      return {
        applied: existingOp || { ...op, isNoop: true, version: state.version },
        transformedOps: [],
      };
    }

    let currentOp = { ...op, id: op.id || uuidv4() };

    if (currentOp.version < state.version) {
      const concurrentOps = history.filter(h => h.version >= currentOp.version);
      for (const serverOp of concurrentOps) {
        const transformed = OperationalTransform.transformClientOp(serverOp, currentOp);
        currentOp = { ...transformed, version: serverOp.version + 1 };
      }
    }

    currentOp.version = state.version + 1;
    currentOp.timestamp = currentOp.timestamp || Date.now();

    const transformedPending: Operation[] = [];
    for (const pendingOp of pending) {
      const transformed = OperationalTransform.transformServerOp(pendingOp, currentOp);
      transformedPending.push({ ...transformed, version: currentOp.version + 1 });
    }

    if (!OperationalTransform.isNoop(currentOp)) {
      state.shapes = OperationalTransform.applyOperation(state.shapes, currentOp);
    }

    state.version = currentOp.version;
    history.push(currentOp);
    pending.push(currentOp);
    applied.add(currentOp.id);

    if (pending.length > 100) {
      pending.shift();
    }

    if (history.length > 1000) {
      const removed = history.splice(0, history.length - 1000);
      removed.forEach(r => applied.delete(r.id));
    }

    return {
      applied: currentOp,
      transformedOps: transformedPending,
    };
  }

  resetCanvas(canvasId: string, shapes: AnyShape[]): void {
    const state = this.getOrCreateCanvas(canvasId);
    state.shapes = new Map(shapes.map(s => [s.id, s]));
    state.version = 0;
    this.history.set(canvasId, []);
    this.pendingOps.set(canvasId, []);
    this.appliedOpIds.set(canvasId, new Set());
  }
}
