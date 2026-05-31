import { v4 as uuidv4 } from 'uuid';
import { CanvasRenderer } from './canvas/CanvasRenderer';
import { DrawingTool, DrawingOptions } from './canvas/DrawingTool';
import { CollaborativeClient } from './websocket/CollaborativeClient';
import { SVGExporter } from './export/SVGExporter';
import { ReactExporter } from './export/ReactExporter';
import { ToolType, AnyShape, User, SyncMessage, OperationMessage, AckMessage } from './types';

class CanvasApp {
  private renderer: CanvasRenderer;
  private drawingTool: DrawingTool;
  private client: CollaborativeClient | null = null;
  private userId: string;
  private canvasId: string = 'default-canvas';
  private isJoined: boolean = false;

  private canvas: HTMLCanvasElement;
  private toolButtons: NodeListOf<HTMLButtonElement>;
  private strokeColorInput: HTMLInputElement;
  private fillColorInput: HTMLInputElement;
  private transparentFillCheckbox: HTMLInputElement;
  private lineWidthInput: HTMLInputElement;
  private lineWidthValue: HTMLSpanElement;
  private canvasIdInput: HTMLInputElement;
  private userNameInput: HTMLInputElement;
  private joinBtn: HTMLButtonElement;
  private userList: HTMLDivElement;
  private connectionStatus: HTMLSpanElement;
  private versionInfo: HTMLSpanElement;
  private bezierHint: HTMLDivElement;
  private bezierStepSpan: HTMLSpanElement;

  private exportTabs: NodeListOf<HTMLButtonElement>;
  private exportPanels: NodeListOf<HTMLDivElement>;
  private svgPreview: HTMLDivElement;
  private svgCode: HTMLPreElement;
  private reactCode: HTMLPreElement;
  private downloadSvgBtn: HTMLButtonElement;
  private copySvgBtn: HTMLButtonElement;
  private copySvgCodeBtn: HTMLButtonElement;
  private copyReactBtn: HTMLButtonElement;
  private downloadReactBtn: HTMLButtonElement;

  constructor() {
    this.userId = this.getOrCreateUserId();

    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.toolButtons = document.querySelectorAll('.tool-btn') as NodeListOf<HTMLButtonElement>;
    this.strokeColorInput = document.getElementById('strokeColor') as HTMLInputElement;
    this.fillColorInput = document.getElementById('fillColor') as HTMLInputElement;
    this.transparentFillCheckbox = document.getElementById('transparentFill') as HTMLInputElement;
    this.lineWidthInput = document.getElementById('lineWidth') as HTMLInputElement;
    this.lineWidthValue = document.getElementById('lineWidthValue') as HTMLSpanElement;
    this.canvasIdInput = document.getElementById('canvasId') as HTMLInputElement;
    this.userNameInput = document.getElementById('userName') as HTMLInputElement;
    this.joinBtn = document.getElementById('joinBtn') as HTMLButtonElement;
    this.userList = document.getElementById('userList') as HTMLDivElement;
    this.connectionStatus = document.getElementById('connectionStatus') as HTMLSpanElement;
    this.versionInfo = document.getElementById('versionInfo') as HTMLSpanElement;
    this.bezierHint = document.getElementById('bezierHint') as HTMLDivElement;
    this.bezierStepSpan = document.getElementById('bezierStep') as HTMLSpanElement;

    this.exportTabs = document.querySelectorAll('.export-tab') as NodeListOf<HTMLButtonElement>;
    this.exportPanels = document.querySelectorAll('.export-panel') as NodeListOf<HTMLDivElement>;
    this.svgPreview = document.getElementById('svgPreview') as HTMLDivElement;
    this.svgCode = document.getElementById('svgCode') as HTMLPreElement;
    this.reactCode = document.getElementById('reactCode') as HTMLPreElement;
    this.downloadSvgBtn = document.getElementById('downloadSvgBtn') as HTMLButtonElement;
    this.copySvgBtn = document.getElementById('copySvgBtn') as HTMLButtonElement;
    this.copySvgCodeBtn = document.getElementById('copySvgCodeBtn') as HTMLButtonElement;
    this.copyReactBtn = document.getElementById('copyReactBtn') as HTMLButtonElement;
    this.downloadReactBtn = document.getElementById('downloadReactBtn') as HTMLButtonElement;

    this.renderer = new CanvasRenderer(this.canvas);
    this.drawingTool = new DrawingTool();

    this.setupEventListeners();
    this.updateUI();
  }

  private getOrCreateUserId(): string {
    let userId = localStorage.getItem('canvasUserId');
    if (!userId) {
      userId = uuidv4();
      localStorage.setItem('canvasUserId', userId);
    }
    return userId;
  }

  private setupEventListeners(): void {
    this.toolButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool as ToolType;
        this.drawingTool.setTool(tool);
        this.updateToolButtons();
        this.updateBezierHint();
      });
    });

    this.strokeColorInput.addEventListener('change', () => {
      this.updateDrawingOptions();
    });

    this.fillColorInput.addEventListener('change', () => {
      this.updateDrawingOptions();
    });

    this.transparentFillCheckbox.addEventListener('change', () => {
      this.fillColorInput.disabled = this.transparentFillCheckbox.checked;
      this.updateDrawingOptions();
    });

    this.lineWidthInput.addEventListener('input', () => {
      this.lineWidthValue.textContent = `${this.lineWidthInput.value}px`;
      this.updateDrawingOptions();
    });

    this.joinBtn.addEventListener('click', () => {
      this.toggleJoinCanvas();
    });

    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('resize', () => {
      this.renderer.drawShapes(this.client?.getShapes() || [], this.drawingTool.getPreviewShape());
    });

    this.exportTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        this.switchExportTab(tabId || 'svg-preview');
      });
    });

    this.downloadSvgBtn.addEventListener('click', () => {
      const shapes = this.client?.getShapes() || [];
      SVGExporter.downloadSVG(shapes, `${this.canvasId}.svg`);
    });

    this.copySvgBtn.addEventListener('click', async () => {
      const shapes = this.client?.getShapes() || [];
      try {
        await SVGExporter.copyToClipboard(shapes);
        this.showCopySuccess(this.copySvgBtn);
      } catch (e) {
        console.error('Copy failed:', e);
      }
    });

    this.copySvgCodeBtn.addEventListener('click', async () => {
      const shapes = this.client?.getShapes() || [];
      try {
        await SVGExporter.copyToClipboard(shapes);
        this.showCopySuccess(this.copySvgCodeBtn);
      } catch (e) {
        console.error('Copy failed:', e);
      }
    });

    this.copyReactBtn.addEventListener('click', async () => {
      const shapes = this.client?.getShapes() || [];
      try {
        await ReactExporter.copyToClipboard(shapes, { componentName: 'CanvasDrawing' });
        this.showCopySuccess(this.copyReactBtn);
      } catch (e) {
        console.error('Copy failed:', e);
      }
    });

    this.downloadReactBtn.addEventListener('click', () => {
      const shapes = this.client?.getShapes() || [];
      ReactExporter.downloadComponent(shapes, 'CanvasDrawing.tsx', { componentName: 'CanvasDrawing' });
    });
  }

  private switchExportTab(tabId: string): void {
    this.exportTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    this.exportPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `${tabId}-panel`);
    });
  }

  private showCopySuccess(button: HTMLButtonElement): void {
    const originalText = button.textContent;
    button.textContent = '已复制!';
    button.style.backgroundColor = '#48bb78';
    button.style.color = 'white';
    button.style.borderColor = '#48bb78';

    setTimeout(() => {
      button.textContent = originalText;
      button.style.backgroundColor = '';
      button.style.color = '';
      button.style.borderColor = '';
    }, 1500);
  }

  private updateExportContent(shapes: AnyShape[]): void {
    this.updateSVGPreview(shapes);
    this.updateSVGCode(shapes);
    this.updateReactCode(shapes);
  }

  private updateSVGPreview(shapes: AnyShape[]): void {
    if (shapes.length === 0) {
      this.svgPreview.innerHTML = '<div class="svg-preview-empty">暂无图形</div>';
      return;
    }

    const svgContent = SVGExporter.toSVG(shapes, {
      width: 200,
      height: 150,
      viewBox: '0 0 1200 800',
      includeStyles: false,
    });

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgElement = doc.querySelector('svg');

    if (svgElement) {
      svgElement.setAttribute('width', '100%');
      svgElement.setAttribute('height', '100%');
      svgElement.style.maxWidth = '100%';
      svgElement.style.maxHeight = '180px';
      
      this.svgPreview.innerHTML = '';
      this.svgPreview.appendChild(svgElement);
    }
  }

  private updateSVGCode(shapes: AnyShape[]): void {
    const svgContent = SVGExporter.toSVG(shapes);
    this.svgCode.textContent = svgContent;
  }

  private updateReactCode(shapes: AnyShape[]): void {
    const reactCode = ReactExporter.toReactComponent(shapes, {
      componentName: 'CanvasDrawing',
      useTypeScript: true,
      includeProps: true,
    });
    this.reactCode.textContent = reactCode;
  }

  private updateDrawingOptions(): void {
    const options: Partial<DrawingOptions> = {
      strokeColor: this.strokeColorInput.value,
      fillColor: this.transparentFillCheckbox.checked ? 'transparent' : this.fillColorInput.value,
      lineWidth: parseInt(this.lineWidthInput.value, 10),
    };
    this.drawingTool.setOptions(options);
  }

  private updateToolButtons(): void {
    const currentTool = this.drawingTool.getTool();
    this.toolButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === currentTool);
    });
  }

  private updateBezierHint(): void {
    const tool = this.drawingTool.getTool();
    if (tool === 'bezier' && this.drawingTool.isDrawing()) {
      const step = this.drawingTool.getBezierStep();
      this.bezierStepSpan.textContent = step.toString();
      this.bezierHint.classList.remove('hidden');
    } else {
      this.bezierHint.classList.add('hidden');
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.isJoined) return;

    const point = this.renderer.getMousePosition(e);
    const tool = this.drawingTool.getTool();

    if (tool === 'eraser') {
      this.eraseShapeAtPoint(point);
      return;
    }

    if (tool === 'select') {
      return;
    }

    this.drawingTool.startDrawing(point);
    this.updateBezierHint();
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isJoined || !this.drawingTool.isDrawing()) return;

    const point = this.renderer.getMousePosition(e);
    const previewShape = this.drawingTool.updateDrawing(point);

    if (previewShape && this.client) {
      this.renderer.drawShapes(this.client.getShapes(), previewShape);
    }

    this.updateBezierHint();
  }

  private handleMouseUp(e: MouseEvent): void {
    if (!this.isJoined) return;

    const point = this.renderer.getMousePosition(e);
    const result = this.drawingTool.finishDrawing(point);

    if (result && result.complete && this.client) {
      this.client.addShape(result.shape);
      this.renderer.drawShapes(this.client.getShapes());
      this.updateExportContent(this.client.getShapes());
    } else if (this.client) {
      this.renderer.drawShapes(this.client.getShapes(), this.drawingTool.getPreviewShape());
    }

    this.updateBezierHint();
  }

  private handleMouseLeave(): void {
    if (this.drawingTool.isDrawing() && this.drawingTool.getTool() !== 'bezier') {
      this.drawingTool.cancelDrawing();
      if (this.client) {
        this.renderer.drawShapes(this.client.getShapes());
      }
      this.updateBezierHint();
    }
  }

  private eraseShapeAtPoint(point: { x: number; y: number }): void {
    if (!this.client) return;

    const shapes = this.client.getShapes();
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (this.isPointInShape(point, shapes[i])) {
        this.client.removeShape(shapes[i].id);
        this.renderer.drawShapes(this.client.getShapes());
        this.updateExportContent(this.client.getShapes());
        return;
      }
    }
  }

  private isPointInShape(point: { x: number; y: number }, shape: AnyShape): boolean {
    switch (shape.type) {
      case 'rectangle':
        const rx = shape.width < 0 ? shape.x + shape.width : shape.x;
        const ry = shape.height < 0 ? shape.y + shape.height : shape.y;
        const rw = Math.abs(shape.width);
        const rh = Math.abs(shape.height);
        return point.x >= rx && point.x <= rx + rw && point.y >= ry && point.y <= ry + rh;

      case 'circle':
        const dx = point.x - shape.cx;
        const dy = point.y - shape.cy;
        return dx * dx + dy * dy <= shape.r * shape.r;

      case 'bezier':
        return this.isPointNearBezier(point, shape, 10);

      default:
        return false;
    }
  }

  private isPointNearBezier(
    point: { x: number; y: number },
    shape: AnyShape,
    threshold: number
  ): boolean {
    if (shape.type !== 'bezier') return false;

    for (let t = 0; t <= 1; t += 0.01) {
      const curvePoint = this.getBezierPoint(shape, t);
      const dx = point.x - curvePoint.x;
      const dy = point.y - curvePoint.y;
      if (dx * dx + dy * dy <= threshold * threshold) {
        return true;
      }
    }
    return false;
  }

  private getBezierPoint(shape: AnyShape, t: number): { x: number; y: number } {
    if (shape.type !== 'bezier') return { x: 0, y: 0 };

    const mt = 1 - t;
    return {
      x: mt * mt * mt * shape.startPoint.x +
         3 * mt * mt * t * shape.controlPoint1.x +
         3 * mt * t * t * shape.controlPoint2.x +
         t * t * t * shape.endPoint.x,
      y: mt * mt * mt * shape.startPoint.y +
         3 * mt * mt * t * shape.controlPoint1.y +
         3 * mt * t * t * shape.controlPoint2.y +
         t * t * t * shape.endPoint.y,
    };
  }

  private toggleJoinCanvas(): void {
    if (this.isJoined) {
      this.leaveCanvas();
    } else {
      this.joinCanvas();
    }
  }

  private joinCanvas(): void {
    const canvasId = this.canvasIdInput.value.trim() || 'default-canvas';
    const userName = this.userNameInput.value.trim() || '用户';

    this.canvasId = canvasId;
    this.client = new CollaborativeClient(this.userId, userName);

    this.client.setHandlers({
      onSync: (msg) => this.handleSync(msg),
      onOperation: (msg) => this.handleOperation(msg),
      onAck: (msg) => this.handleAck(msg),
      onUserJoined: (data) => this.handleUserJoined(data),
      onUserLeft: (data) => this.handleUserLeft(data),
      onConnect: () => this.handleConnect(),
      onDisconnect: () => this.handleDisconnect(),
      onError: (error) => this.handleError(error),
    });

    this.client.joinCanvas(canvasId);
    this.isJoined = true;
    this.updateUI();
  }

  private leaveCanvas(): void {
    if (this.client) {
      this.client.leaveCanvas(this.canvasId);
      this.client.disconnect();
      this.client = null;
    }
    this.isJoined = false;
    this.renderer.clear();
    this.updateExportContent([]);
    this.updateUI();
  }

  private handleSync(message: SyncMessage): void {
    console.log('Synced with canvas, version:', message.version);
    this.renderer.drawShapes(message.shapes);
    this.versionInfo.textContent = `版本: ${message.version}`;
    this.updateExportContent(message.shapes);
    if (message.users) {
      this.updateUserList(message.users);
    }
  }

  private handleOperation(message: OperationMessage): void {
    console.log('Received operation from', message.fromUser?.name);
    if (this.client) {
      this.renderer.drawShapes(this.client.getShapes());
      this.versionInfo.textContent = `版本: ${this.client.getVersion()}`;
      this.updateExportContent(this.client.getShapes());
    }
  }

  private handleAck(message: AckMessage): void {
    console.log('Operation acknowledged, new version:', message.version);
    if (this.client) {
      this.versionInfo.textContent = `版本: ${this.client.getVersion()}`;
    }
  }

  private handleUserJoined(data: { user: User; users: User[] }): void {
    console.log('User joined:', data.user.name);
    this.updateUserList(data.users);
  }

  private handleUserLeft(data: { user: User; users: User[] }): void {
    console.log('User left:', data.user.name);
    this.updateUserList(data.users);
  }

  private handleConnect(): void {
    console.log('Connected to server');
    this.connectionStatus.textContent = '已连接';
    this.connectionStatus.classList.remove('disconnected');
    this.connectionStatus.classList.add('connected');
  }

  private handleDisconnect(): void {
    console.log('Disconnected from server');
    this.connectionStatus.textContent = '未连接';
    this.connectionStatus.classList.remove('connected');
    this.connectionStatus.classList.add('disconnected');
  }

  private handleError(error: Error): void {
    console.error('Error:', error);
  }

  private updateUserList(users: User[]): void {
    if (users.length === 0) {
      this.userList.innerHTML = '<p class="empty">暂无用户</p>';
      return;
    }

    this.userList.innerHTML = users.map(user => `
      <div class="user-item">
        <div class="user-avatar">${user.name.charAt(0).toUpperCase()}</div>
        <span class="user-name">${user.name}</span>
      </div>
    `).join('');
  }

  private updateUI(): void {
    this.joinBtn.textContent = this.isJoined ? '离开画布' : '加入画布';
    this.canvasIdInput.disabled = this.isJoined;
    this.userNameInput.disabled = this.isJoined;
    this.updateToolButtons();
    this.updateDrawingOptions();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new CanvasApp();
});
