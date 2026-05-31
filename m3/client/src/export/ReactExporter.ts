import {
  AnyShape,
  RectangleShape,
  CircleShape,
  BezierShape,
} from '../types';

export interface ReactExportOptions {
  componentName?: string;
  useTypeScript?: boolean;
  includeProps?: boolean;
}

export class ReactExporter {
  static toReactComponent(shapes: AnyShape[], options: ReactExportOptions = {}): string {
    const {
      componentName = 'CanvasDrawing',
      useTypeScript = true,
      includeProps = true,
    } = options;

    const shapeElements = shapes.map((shape, index) => 
      this.shapeToReact(shape, `shape-${index}`)
    ).join('\n        ');

    const propsInterface = useTypeScript ? `
interface ${componentName}Props {
  width?: number;
  height?: number;
  className?: string;
}` : '';

    const propsType = useTypeScript ? `: ${componentName}Props` : '';

    return `${propsInterface}
${useTypeScript ? '' : '// @ts-nocheck'}
import React from 'react';

export function ${componentName}(${includeProps ? 'props' : ''}${propsType}) {
  const { width = 800, height = 600, className = '' } = ${includeProps ? 'props' : '{}'};

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 1200 800"
      className={className}
    >
        ${shapeElements}
    </svg>
  );
}

export default ${componentName};
`;
  }

  static shapeToReact(shape: AnyShape, key: string): string {
    switch (shape.type) {
      case 'rectangle':
        return this.rectangleToReact(shape, key);
      case 'circle':
        return this.circleToReact(shape, key);
      case 'bezier':
        return this.bezierToReact(shape, key);
      default:
        return '';
    }
  }

  private static rectangleToReact(shape: RectangleShape, key: string): string {
    const x = shape.width < 0 ? shape.x + shape.width : shape.x;
    const y = shape.height < 0 ? shape.y + shape.height : shape.y;
    const width = Math.abs(shape.width);
    const height = Math.abs(shape.height);

    return `<rect
          key="${key}"
          x={${this.round(x)}}
          y={${this.round(y)}}
          width={${this.round(width)}}
          height={${this.round(height)}}
          fill="${shape.fillColor}"
          stroke="${shape.strokeColor}"
          strokeWidth={${shape.lineWidth}}
        />`;
  }

  private static circleToReact(shape: CircleShape, key: string): string {
    return `<circle
          key="${key}"
          cx={${this.round(shape.cx)}}
          cy={${this.round(shape.cy)}}
          r={${this.round(Math.abs(shape.r))}}
          fill="${shape.fillColor}"
          stroke="${shape.strokeColor}"
          strokeWidth={${shape.lineWidth}}
        />`;
  }

  private static bezierToReact(shape: BezierShape, key: string): string {
    const d = `M ${this.round(shape.startPoint.x)} ${this.round(shape.startPoint.y)} C ${this.round(shape.controlPoint1.x)} ${this.round(shape.controlPoint1.y)}, ${this.round(shape.controlPoint2.x)} ${this.round(shape.controlPoint2.y)}, ${this.round(shape.endPoint.x)} ${this.round(shape.endPoint.y)}`;

    return `<path
          key="${key}"
          d="${d}"
          fill="${shape.fillColor}"
          stroke="${shape.strokeColor}"
          strokeWidth={${shape.lineWidth}}
          fillRule="evenodd"
        />`;
  }

  private static round(value: number, decimals: number = 2): number {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  static toJSX(shapes: AnyShape[]): string {
    const shapeElements = shapes.map((shape, index) => 
      this.shapeToReact(shape, `shape-${index}`)
    ).join('\n      ');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 1200 800">
      ${shapeElements}
    </svg>`;
  }

  static copyToClipboard(shapes: AnyShape[], options: ReactExportOptions = {}): Promise<void> {
    const code = this.toReactComponent(shapes, options);
    return navigator.clipboard.writeText(code);
  }

  static downloadComponent(shapes: AnyShape[], filename: string = 'CanvasDrawing.tsx', options: ReactExportOptions = {}): void {
    const code = this.toReactComponent(shapes, options);
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
