import Canvas, { ICanvas } from '../models/Canvas';
import { AnyShape, Operation } from '../types';

export class StorageService {
  async loadCanvas(canvasId: string): Promise<{
    shapes: AnyShape[];
    version: number;
    operations: Operation[];
  } | null> {
    const canvas = await Canvas.findOne({ canvasId }).exec();
    
    if (!canvas) {
      return null;
    }

    return {
      shapes: canvas.shapes as AnyShape[],
      version: canvas.version,
      operations: canvas.operations.map(op => op.operation),
    };
  }

  async saveCanvas(
    canvasId: string,
    shapes: AnyShape[],
    version: number,
    newOperation?: Operation
  ): Promise<void> {
    const update: any = {
      shapes,
      version,
      updatedAt: new Date(),
    };

    if (newOperation) {
      update.$push = {
        operations: {
          operation: newOperation,
          version: newOperation.version,
          createdAt: new Date(),
        },
      };
    }

    await Canvas.findOneAndUpdate(
      { canvasId },
      update,
      { upsert: true, new: true }
    ).exec();
  }

  async createCanvas(canvasId: string): Promise<ICanvas> {
    const canvas = new Canvas({
      canvasId,
      version: 0,
      shapes: [],
      operations: [],
    });
    return await canvas.save();
  }

  async canvasExists(canvasId: string): Promise<boolean> {
    const count = await Canvas.countDocuments({ canvasId }).exec();
    return count > 0;
  }

  async deleteCanvas(canvasId: string): Promise<void> {
    await Canvas.deleteOne({ canvasId }).exec();
  }

  async getOperations(canvasId: string, fromVersion: number = 0): Promise<Operation[]> {
    const canvas = await Canvas.findOne(
      { canvasId },
      { operations: { $elemMatch: { version: { $gt: fromVersion } } } }
    ).exec();

    if (!canvas) {
      return [];
    }

    return canvas.operations
      .filter(op => op.version > fromVersion)
      .sort((a, b) => a.version - b.version)
      .map(op => op.operation);
  }
}

export const storageService = new StorageService();
