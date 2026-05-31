import { AnyShape, RectangleShape, CircleShape, BezierShape } from '../types';

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context');
    }
    this.ctx = ctx;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawShape(shape: AnyShape, isPreview: boolean = false): void {
    this.ctx.save();
    
    if (isPreview) {
      this.ctx.globalAlpha = 0.5;
      this.ctx.setLineDash([5, 5]);
    }

    this.ctx.strokeStyle = shape.strokeColor;
    this.ctx.fillStyle = shape.fillColor;
    this.ctx.lineWidth = shape.lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    switch (shape.type) {
      case 'rectangle':
        this.drawRectangle(shape);
        break;
      case 'circle':
        this.drawCircle(shape);
        break;
      case 'bezier':
        this.drawBezier(shape);
        break;
    }

    this.ctx.restore();
  }

  private drawRectangle(shape: RectangleShape): void {
    const x = shape.width < 0 ? shape.x + shape.width : shape.x;
    const y = shape.height < 0 ? shape.y + shape.height : shape.y;
    const width = Math.abs(shape.width);
    const height = Math.abs(shape.height);

    if (shape.fillColor !== 'transparent') {
      this.ctx.fillRect(x, y, width, height);
    }
    if (shape.lineWidth > 0) {
      this.ctx.strokeRect(x, y, width, height);
    }
  }

  private drawCircle(shape: CircleShape): void {
    this.ctx.beginPath();
    this.ctx.arc(shape.cx, shape.cy, Math.abs(shape.r), 0, Math.PI * 2);
    
    if (shape.fillColor !== 'transparent') {
      this.ctx.fill();
    }
    if (shape.lineWidth > 0) {
      this.ctx.stroke();
    }
  }

  private drawBezier(shape: BezierShape): void {
    this.ctx.beginPath();
    this.ctx.moveTo(shape.startPoint.x, shape.startPoint.y);
    this.ctx.bezierCurveTo(
      shape.controlPoint1.x, shape.controlPoint1.y,
      shape.controlPoint2.x, shape.controlPoint2.y,
      shape.endPoint.x, shape.endPoint.y
    );
    
    if (shape.fillColor !== 'transparent') {
      this.ctx.fill();
    }
    if (shape.lineWidth > 0) {
      this.ctx.stroke();
    }
  }

  drawShapes(shapes: AnyShape[], previewShape?: AnyShape | null): void {
    this.clear();
    
    for (const shape of shapes) {
      this.drawShape(shape);
    }

    if (previewShape) {
      this.drawShape(previewShape, true);
    }
  }

  getMousePosition(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  resize(width: number, height: number): void {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (tempCtx) {
      tempCtx.drawImage(this.canvas, 0, 0);
    }

    this.canvas.width = width;
    this.canvas.height = height;

    if (tempCtx) {
      this.ctx.drawImage(tempCanvas, 0, 0);
    }
  }

  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}
