import { v4 as uuidv4 } from 'uuid';
import {
  AnyShape,
  RectangleShape,
  CircleShape,
  BezierShape,
  ToolType,
  Point,
  DrawState,
} from '../types';

export interface DrawingOptions {
  strokeColor: string;
  fillColor: string;
  lineWidth: number;
}

export class DrawingTool {
  private tool: ToolType = 'rectangle';
  private options: DrawingOptions = {
    strokeColor: '#000000',
    fillColor: 'transparent',
    lineWidth: 2,
  };
  private drawState: DrawState = {
    isDrawing: false,
    startPoint: null,
    currentPoint: null,
    controlPoint1: null,
    controlPoint2: null,
    previewShape: null,
  };
  private bezierStep: number = 0;

  setTool(tool: ToolType): void {
    this.tool = tool;
    this.resetState();
  }

  getTool(): ToolType {
    return this.tool;
  }

  setOptions(options: Partial<DrawingOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): DrawingOptions {
    return { ...this.options };
  }

  startDrawing(point: Point): void {
    if (this.tool === 'select' || this.tool === 'eraser') {
      return;
    }

    this.drawState.isDrawing = true;
    this.drawState.startPoint = point;

    if (this.tool === 'bezier') {
      this.bezierStep = 1;
      this.drawState.controlPoint1 = null;
      this.drawState.controlPoint2 = null;
    } else {
      this.bezierStep = 0;
    }
  }

  updateDrawing(point: Point): AnyShape | null {
    if (!this.drawState.isDrawing || !this.drawState.startPoint) {
      return null;
    }

    this.drawState.currentPoint = point;

    if (this.tool === 'bezier') {
      return this.updateBezier(point);
    }

    this.drawState.previewShape = this.createShape(
      this.drawState.startPoint,
      point
    );

    return this.drawState.previewShape;
  }

  private updateBezier(point: Point): AnyShape | null {
    if (!this.drawState.startPoint) return null;

    if (this.bezierStep === 1) {
      this.drawState.controlPoint1 = point;
      this.drawState.controlPoint2 = point;
      this.drawState.previewShape = this.createBezierShape();
      return this.drawState.previewShape;
    }

    if (this.bezierStep === 2) {
      this.drawState.controlPoint2 = point;
      this.drawState.previewShape = this.createBezierShape();
      return this.drawState.previewShape;
    }

    return null;
  }

  finishDrawing(point: Point): { shape: AnyShape; complete: boolean } | null {
    if (!this.drawState.isDrawing) {
      return null;
    }

    if (this.tool === 'bezier') {
      return this.finishBezier(point);
    }

    const shape = this.createShape(this.drawState.startPoint!, point);
    this.resetState();

    return { shape, complete: true };
  }

  private finishBezier(point: Point): { shape: AnyShape; complete: boolean } | null {
    if (!this.drawState.startPoint) return null;

    if (this.bezierStep === 1) {
      this.drawState.controlPoint1 = point;
      this.bezierStep = 2;
      return null;
    }

    if (this.bezierStep === 2) {
      this.drawState.controlPoint2 = point;
      this.bezierStep = 3;
      return null;
    }

    if (this.bezierStep === 3) {
      const shape = this.createBezierShape(point);
      this.resetState();
      return { shape, complete: true };
    }

    return null;
  }

  private createShape(start: Point, end: Point): AnyShape {
    const baseShape = {
      id: uuidv4(),
      strokeColor: this.options.strokeColor,
      fillColor: this.options.fillColor,
      lineWidth: this.options.lineWidth,
    };

    switch (this.tool) {
      case 'rectangle':
        return {
          ...baseShape,
          type: 'rectangle',
          x: start.x,
          y: start.y,
          width: end.x - start.x,
          height: end.y - start.y,
        } as RectangleShape;

      case 'circle':
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        return {
          ...baseShape,
          type: 'circle',
          cx: start.x,
          cy: start.y,
          r: Math.sqrt(dx * dx + dy * dy),
        } as CircleShape;

      default:
        throw new Error(`Unsupported shape type: ${this.tool}`);
    }
  }

  private createBezierShape(endPoint?: Point): BezierShape {
    const baseShape = {
      id: uuidv4(),
      type: 'bezier' as const,
      strokeColor: this.options.strokeColor,
      fillColor: this.options.fillColor,
      lineWidth: this.options.lineWidth,
    };

    return {
      ...baseShape,
      startPoint: this.drawState.startPoint!,
      controlPoint1: this.drawState.controlPoint1 || this.drawState.currentPoint!,
      controlPoint2: this.drawState.controlPoint2 || this.drawState.currentPoint!,
      endPoint: endPoint || this.drawState.currentPoint!,
    };
  }

  cancelDrawing(): void {
    this.resetState();
  }

  private resetState(): void {
    this.drawState = {
      isDrawing: false,
      startPoint: null,
      currentPoint: null,
      controlPoint1: null,
      controlPoint2: null,
      previewShape: null,
    };
    this.bezierStep = 0;
  }

  isDrawing(): boolean {
    return this.drawState.isDrawing;
  }

  getPreviewShape(): AnyShape | null {
    return this.drawState.previewShape;
  }

  getBezierStep(): number {
    return this.bezierStep;
  }
}
