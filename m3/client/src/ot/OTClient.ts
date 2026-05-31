import { v4 as uuidv4 } from 'uuid';
import { Operation, AnyShape, OpType } from '../types';

export class OTClient {
  private userId: string;
  private version: number = 0;
  private pendingOps: Map<string, Operation> = new Map();
  private acknowledgedOps: Set<string> = new Set();
  private appliedOpIds: Set<string> = new Set();
  private onSendOperation: ((op: Operation) => void) | null = null;
  private onOperationApplied: ((op: Operation) => void) | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  setOnSendOperation(callback: (op: Operation) => void): void {
    this.onSendOperation = callback;
  }

  setOnOperationApplied(callback: (op: Operation) => void): void {
    this.onOperationApplied = callback;
  }

  getVersion(): number {
    return this.version;
  }

  setVersion(version: number): void {
    this.version = version;
  }

  hasOperationBeenApplied(opId: string): boolean {
    return this.appliedOpIds.has(opId);
  }

  generateOperation(
    type: OpType,
    shapeId: string,
    shape?: AnyShape
  ): Operation {
    const op: Operation = {
      id: uuidv4(),
      type,
      shapeId,
      shape,
      userId: this.userId,
      timestamp: Date.now(),
      version: this.version,
    };

    this.pendingOps.set(op.id, op);

    if (this.onSendOperation) {
      this.onSendOperation(op);
    }

    return op;
  }

  handleAck(operationId: string, version: number): void {
    const op = this.pendingOps.get(operationId);
    if (op) {
      op.version = version;
      this.version = Math.max(this.version, version);
      this.pendingOps.delete(operationId);
      this.acknowledgedOps.add(operationId);
      this.appliedOpIds.add(operationId);
    }
  }

  handleServerOperation(serverOp: Operation): Operation | null {
    if (this.appliedOpIds.has(serverOp.id)) {
      return null;
    }

    let currentOp = { ...serverOp };

    for (const pendingOp of this.pendingOps.values()) {
      currentOp = this.transform(pendingOp, currentOp);
    }

    this.version = Math.max(this.version, currentOp.version);
    this.appliedOpIds.add(currentOp.id);

    if (this.onOperationApplied && serverOp.userId !== this.userId) {
      this.onOperationApplied(currentOp);
    }

    return currentOp;
  }

  applyOperationLocal(op: Operation, shapes: Map<string, AnyShape>): Map<string, AnyShape> {
    if (this.isNoop(op)) {
      return shapes;
    }
    return this.apply(shapes, op);
  }

  private isNoop(op: Operation | null): boolean {
    return op === null || op.isNoop === true;
  }

  private createNoop(op: Operation): Operation {
    return {
      ...op,
      isNoop: true,
    };
  }

  private transform(op1: Operation, op2: Operation): Operation {
    if (op1.shapeId !== op2.shapeId) {
      return { ...op2, version: op1.version + 1 };
    }

    const type1 = op1.type;
    const type2 = op2.type;

    if (type1 === 'add' && type2 === 'add') {
      return op1.timestamp < op2.timestamp
        ? { ...op2, version: op1.version + 1 }
        : this.createNoop({ ...op2, version: op1.version + 1 });
    }

    if (type1 === 'remove') {
      if (type2 === 'remove') {
        return this.createNoop({ ...op2, version: op1.version + 1 });
      }
      return this.createNoop({ ...op2, version: op1.version + 1 });
    }

    if (type2 === 'remove') {
      return { ...op2, version: op1.version + 1 };
    }

    if (type1 === 'update' && type2 === 'update') {
      return this.mergeUpdates(op1, op2);
    }

    if (type1 === 'add' && type2 === 'update') {
      return { ...op2, version: op1.version + 1 };
    }

    if (type1 === 'update' && type2 === 'add') {
      return this.createNoop({ ...op2, version: op1.version + 1 });
    }

    return { ...op2, version: op1.version + 1 };
  }

  private mergeUpdates(op1: Operation, op2: Operation): Operation {
    if (!op1.shape || !op2.shape) {
      return { ...op2, version: op1.version + 1 };
    }

    const mergedShape = { ...op1.shape };
    
    for (const key of Object.keys(op2.shape)) {
      const value = (op2.shape as any)[key];
      if (value !== undefined) {
        (mergedShape as any)[key] = value;
      }
    }

    return {
      ...op2,
      shape: mergedShape as AnyShape,
      version: op1.version + 1,
    };
  }

  private apply(shapes: Map<string, AnyShape>, op: Operation): Map<string, AnyShape> {
    const newShapes = new Map(shapes);

    switch (op.type as OpType) {
      case 'add':
        if (op.shape) {
          if (!newShapes.has(op.shapeId)) {
            newShapes.set(op.shapeId, op.shape);
          }
        }
        break;
      case 'remove':
        newShapes.delete(op.shapeId);
        break;
      case 'update':
        if (op.shape && newShapes.has(op.shapeId)) {
          const existing = newShapes.get(op.shapeId)!;
          newShapes.set(op.shapeId, { ...existing, ...op.shape } as AnyShape);
        }
        break;
    }

    return newShapes;
  }

  clearPending(): void {
    this.pendingOps.clear();
  }

  clearHistory(): void {
    this.appliedOpIds.clear();
    this.acknowledgedOps.clear();
  }
}
