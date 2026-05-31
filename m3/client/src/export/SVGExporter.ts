import {
  AnyShape,
  RectangleShape,
  CircleShape,
  BezierShape,
} from '../types';

export interface SVGExportOptions {
  width?: number;
  height?: number;
  viewBox?: string;
  includeStyles?: boolean;
}

export class SVGExporter {
  static toSVG(shapes: AnyShape[], options: SVGExportOptions = {}): string {
    const {
      width = 800,
      height = 600,
      viewBox = `0 0 ${width} ${height}`,
      includeStyles = true,
    } = options;

    const shapesSVG = shapes.map(shape => this.shapeToSVG(shape)).join('\n    ');

    let styles = '';
    if (includeStyles) {
      styles = `
  <defs>
    <style>
      .shape { vector-effect: non-scaling-stroke; }
    </style>
  </defs>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     width="${width}" 
     height="${height}" 
     viewBox="${viewBox}"${includeStyles ? '' : ''}>${styles}
  <g class="canvas">
    ${shapesSVG}
  </g>
</svg>`;
  }

  static shapeToSVG(shape: AnyShape): string {
    switch (shape.type) {
      case 'rectangle':
        return this.rectangleToSVG(shape);
      case 'circle':
        return this.circleToSVG(shape);
      case 'bezier':
        return this.bezierToSVG(shape);
      default:
        return '';
    }
  }

  private static rectangleToSVG(shape: RectangleShape): string {
    const x = shape.width < 0 ? shape.x + shape.width : shape.x;
    const y = shape.height < 0 ? shape.y + shape.height : shape.y;
    const width = Math.abs(shape.width);
    const height = Math.abs(shape.height);

    return `<rect class="shape" 
          x="${this.round(x)}" 
          y="${this.round(y)}" 
          width="${this.round(width)}" 
          height="${this.round(height)}"
          fill="${shape.fillColor}" 
          stroke="${shape.strokeColor}" 
          stroke-width="${shape.lineWidth}" />`;
  }

  private static circleToSVG(shape: CircleShape): string {
    return `<circle class="shape" 
          cx="${this.round(shape.cx)}" 
          cy="${this.round(shape.cy)}" 
          r="${this.round(Math.abs(shape.r))}"
          fill="${shape.fillColor}" 
          stroke="${shape.strokeColor}" 
          stroke-width="${shape.lineWidth}" />`;
  }

  private static bezierToSVG(shape: BezierShape): string {
    const d = `M ${this.round(shape.startPoint.x)} ${this.round(shape.startPoint.y)} 
               C ${this.round(shape.controlPoint1.x)} ${this.round(shape.controlPoint1.y)}, 
                 ${this.round(shape.controlPoint2.x)} ${this.round(shape.controlPoint2.y)}, 
                 ${this.round(shape.endPoint.x)} ${this.round(shape.endPoint.y)}`;

    return `<path class="shape" 
          d="${d}"
          fill="${shape.fillColor}" 
          stroke="${shape.strokeColor}" 
          stroke-width="${shape.lineWidth}" 
          fill-rule="evenodd" />`;
  }

  private static round(value: number, decimals: number = 2): number {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  static downloadSVG(shapes: AnyShape[], filename: string = 'canvas.svg'): void {
    const svgContent = this.toSVG(shapes);
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  static copyToClipboard(shapes: AnyShape[]): Promise<void> {
    const svgContent = this.toSVG(shapes);
    return navigator.clipboard.writeText(svgContent);
  }

  static getBounds(shapes: AnyShape[]): { minX: number; minY: number; maxX: number; maxY: number } {
    if (shapes.length === 0) {
      return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const shape of shapes) {
      const bounds = this.getShapeBounds(shape);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }

    return { minX, minY, maxX, maxY };
  }

  private static getShapeBounds(shape: AnyShape): { minX: number; minY: number; maxX: number; maxY: number } {
    switch (shape.type) {
      case 'rectangle':
        const rx = shape.width < 0 ? shape.x + shape.width : shape.x;
        const ry = shape.height < 0 ? shape.y + shape.height : shape.y;
        return {
          minX: rx,
          minY: ry,
          maxX: rx + Math.abs(shape.width),
          maxY: ry + Math.abs(shape.height),
        };

      case 'circle':
        return {
          minX: shape.cx - Math.abs(shape.r),
          minY: shape.cy - Math.abs(shape.r),
          maxX: shape.cx + Math.abs(shape.r),
          maxY: shape.cy + Math.abs(shape.r),
        };

      case 'bezier':
        const points = [shape.startPoint, shape.controlPoint1, shape.controlPoint2, shape.endPoint];
        return {
          minX: Math.min(...points.map(p => p.x)),
          minY: Math.min(...points.map(p => p.y)),
          maxX: Math.max(...points.map(p => p.x)),
          maxY: Math.max(...points.map(p => p.y)),
        };

      default:
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
  }
}
