import mongoose, { Schema, Document } from 'mongoose';
import { AnyShape, Operation } from '../types';

export interface ICanvas extends Document {
  canvasId: string;
  version: number;
  shapes: AnyShape[];
  operations: Array<{
    operation: Operation;
    version: number;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const PointSchema = new Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
}, { _id: false });

const ShapeSchema = new Schema({
  id: { type: String, required: true },
  type: { type: String, enum: ['rectangle', 'circle', 'bezier'], required: true },
  strokeColor: { type: String, required: true },
  fillColor: { type: String, required: true },
  lineWidth: { type: Number, required: true },
  x: { type: Number },
  y: { type: Number },
  width: { type: Number },
  height: { type: Number },
  cx: { type: Number },
  cy: { type: Number },
  r: { type: Number },
  startPoint: PointSchema,
  controlPoint1: PointSchema,
  controlPoint2: PointSchema,
  endPoint: PointSchema,
}, { _id: false, discriminatorKey: 'type' });

const OperationSchema = new Schema({
  id: { type: String, required: true },
  type: { type: String, enum: ['add', 'remove', 'update'], required: true },
  shapeId: { type: String, required: true },
  shape: ShapeSchema,
  userId: { type: String, required: true },
  timestamp: { type: Number, required: true },
  version: { type: Number, required: true },
}, { _id: false });

const StoredOperationSchema = new Schema({
  operation: { type: OperationSchema, required: true },
  version: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const CanvasSchema = new Schema({
  canvasId: { type: String, required: true, unique: true, index: true },
  version: { type: Number, default: 0 },
  shapes: [ShapeSchema],
  operations: [StoredOperationSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

CanvasSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model<ICanvas>('Canvas', CanvasSchema);
