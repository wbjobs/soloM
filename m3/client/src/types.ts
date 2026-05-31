export type ShapeType = 'rectangle' | 'circle' | 'bezier';
export type ToolType = ShapeType | 'select' | 'eraser';

export interface Point {
  x: number;
  y: number;
}

export interface Shape {
  id: string;
  type: ShapeType;
  strokeColor: string;
  fillColor: string;
  lineWidth: number;
}

export interface RectangleShape extends Shape {
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CircleShape extends Shape {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
}

export interface BezierShape extends Shape {
  type: 'bezier';
  startPoint: Point;
  controlPoint1: Point;
  controlPoint2: Point;
  endPoint: Point;
}

export type AnyShape = RectangleShape | CircleShape | BezierShape;

export type OpType = 'add' | 'remove' | 'update';

export interface Operation {
  id: string;
  type: OpType;
  shapeId: string;
  shape?: AnyShape;
  userId: string;
  timestamp: number;
  version: number;
  isNoop?: boolean;
}

export interface User {
  id: string;
  name: string;
  socketId: string;
}

export interface SyncMessage {
  canvasId: string;
  shapes: AnyShape[];
  version: number;
  users?: User[];
}

export interface OperationMessage {
  operation: Operation;
  fromUser?: User;
}

export interface AckMessage {
  operationId: string;
  version: number;
  transformedOps: Operation[];
}

export interface DrawState {
  isDrawing: boolean;
  startPoint: Point | null;
  currentPoint: Point | null;
  controlPoint1: Point | null;
  controlPoint2: Point | null;
  previewShape: AnyShape | null;
}
