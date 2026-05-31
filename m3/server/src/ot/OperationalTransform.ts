import { Operation, AnyShape, OpType } from '../types';

export class OperationalTransform {
  static transform(op1: Operation, op2: Operation): Operation | null {
    if (op1.shapeId !== op2.shapeId) {
      return op2;
    }

    const type1 = op1.type;
    const type2 = op2.type;

    if (type1 === 'add' && type2 === 'add') {
      return op1.timestamp < op2.timestamp ? op2 : this.createNoop(op2);
    }

    if (type1 === 'remove') {
      if (type2 === 'remove') {
        return this.createNoop(op2);
      }
      return this.createNoop(op2);
    }

    if (type2 === 'remove') {
      return op2;
    }

    if (type1 === 'update' && type2 === 'update') {
      return this.mergeUpdates(op1, op2);
    }

    if (type1 === 'add' && type2 === 'update') {
      return op2;
    }

    if (type1 === 'update' && type2 === 'add') {
      return this.createNoop(op2);
    }

    return op2;
  }

  private static createNoop(op: Operation): Operation {
    return {
      ...op,
      isNoop: true,
    };
  }

  static isNoop(op: Operation | null): boolean {
    return op === null || op.isNoop === true;
  }

  private static mergeUpdates(op1: Operation, op2: Operation): Operation {
    if (!op1.shape || !op2.shape) return op2;

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
    };
  }

  static applyOperation(shapes: Map<string, AnyShape>, op: Operation): Map<string, AnyShape> {
    if (this.isNoop(op)) {
      return shapes;
    }

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

  static transformServerOp(clientOp: Operation, serverOp: Operation): Operation {
    const transformed = this.transform(serverOp, clientOp);
    if (transformed) {
      return { ...transformed, version: clientOp.version };
    }
    return { ...clientOp, isNoop: true, version: clientOp.version };
  }

  static transformClientOp(serverOp: Operation, clientOp: Operation): Operation {
    const transformed = this.transform(serverOp, clientOp);
    return transformed || { ...clientOp, isNoop: true, version: serverOp.version + 1 };
  }
}
