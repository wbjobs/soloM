class Whiteboard {
  constructor(canvasId, onDraw, getThrottleInterval = null) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.onDraw = onDraw;
    this.getThrottleInterval = getThrottleInterval;
    this.isDrawing = false;
    this.currentTool = 'pen';
    this.strokeColor = '#000000';
    this.strokeWidth = 3;
    this.startX = 0;
    this.startY = 0;
    this.snapshot = null;
    this.drawingHistory = [];
    this.currentPath = [];
    this.MAX_HISTORY = 2000;
    this.throttleBuffer = [];
    this.throttleTimer = null;
    this.lastSendTime = 0;
    this.minThrottleInterval = 16;
    this.maxThrottleInterval = 200;
    this.defaultThrottleInterval = 50;
    this.sampleRate = 1;
    this.drawCounter = 0;

    this.initCanvas();
    this.bindEvents();
  }

  initCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = 600;

    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  bindEvents() {
    this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
    this.canvas.addEventListener('mousemove', this.draw.bind(this));
    this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
    this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));

    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
  }

  handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.canvas.dispatchEvent(mouseEvent);
  }

  handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.canvas.dispatchEvent(mouseEvent);
  }

  startDrawing(e) {
    this.isDrawing = true;
    this.drawCounter = 0;
    this.lastSendTime = 0;
    const rect = this.canvas.getBoundingClientRect();
    this.startX = e.clientX - rect.left;
    this.startY = e.clientY - rect.top;

    if (this.currentTool !== 'pen' && this.currentTool !== 'eraser') {
      this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
      this.currentPath = [{ x: this.startX, y: this.startY }];
      this.ctx.beginPath();
      this.ctx.moveTo(this.startX, this.startY);
    }
  }

  draw(e) {
    if (!this.isDrawing) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.ctx.strokeStyle = this.currentTool === 'eraser' ? '#ffffff' : this.strokeColor;
    this.ctx.lineWidth = this.currentTool === 'eraser' ? this.strokeWidth * 3 : this.strokeWidth;

    switch (this.currentTool) {
      case 'pen':
      case 'eraser':
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        this.currentPath.push({ x, y });

        this.drawCounter++;
        if (this.drawCounter >= this.sampleRate) {
          this.drawCounter = 0;
          this.throttleSend();
        }
        break;
      case 'line':
        this.restoreSnapshot();
        this.drawLine(this.startX, this.startY, x, y);
        break;
      case 'rect':
        this.restoreSnapshot();
        this.drawRect(this.startX, this.startY, x, y);
        break;
      case 'circle':
        this.restoreSnapshot();
        this.drawCircle(this.startX, this.startY, x, y);
        break;
    }
  }

  stopDrawing(e) {
    if (!this.isDrawing) return;

    this.flushThrottleBuffer();

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let drawData;

    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
      if (this.currentPath.length === 0 ||
          this.currentPath[this.currentPath.length - 1].x !== x ||
          this.currentPath[this.currentPath.length - 1].y !== y) {
        this.currentPath.push({ x, y });
      }
      drawData = {
        type: 'draw',
        tool: this.currentTool,
        color: this.strokeColor,
        width: this.strokeWidth,
        path: [...this.currentPath],
        final: true
      };
    } else {
      drawData = {
        type: 'draw',
        tool: this.currentTool,
        color: this.strokeColor,
        width: this.strokeWidth,
        startX: this.startX,
        startY: this.startY,
        endX: x,
        endY: y
      };
    }

    this.addToHistory(drawData);

    if (this.onDraw) {
      this.onDraw(drawData);
    }

    this.isDrawing = false;
    this.snapshot = null;
    this.currentPath = [];
  }

  throttleSend() {
    const now = Date.now();
    const interval = this.getCurrentThrottleInterval();

    if (now - this.lastSendTime < interval) {
      return;
    }

    if (this.currentPath.length > 0) {
      const incrementalData = {
        type: 'draw',
        tool: this.currentTool,
        color: this.strokeColor,
        width: this.strokeWidth,
        path: [...this.currentPath],
        incremental: true
      };

      if (this.onDraw) {
        this.onDraw(incrementalData);
      }

      this.lastSendTime = now;
    }
  }

  flushThrottleBuffer() {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
  }

  getCurrentThrottleInterval() {
    if (this.getThrottleInterval) {
      const custom = this.getThrottleInterval();
      if (custom > 0) {
        return Math.max(this.minThrottleInterval, Math.min(custom, this.maxThrottleInterval));
      }
    }
    return this.defaultThrottleInterval;
  }

  setThrottleParameters({ interval, sampleRate } = {}) {
    if (interval !== undefined) {
      this.defaultThrottleInterval = Math.max(this.minThrottleInterval, Math.min(interval, this.maxThrottleInterval));
    }
    if (sampleRate !== undefined) {
      this.sampleRate = Math.max(1, Math.min(sampleRate, 10));
    }
  }

  getThrottleStats() {
    return {
      currentInterval: this.getCurrentThrottleInterval(),
      sampleRate: this.sampleRate,
      pathLength: this.currentPath.length
    };
  }

  addToHistory(drawData) {
    this.drawingHistory.push(drawData);
    if (this.drawingHistory.length > this.MAX_HISTORY) {
      this.compactHistory();
    }
  }

  compactHistory() {
    const snapshot = this.getCanvasDataURL();
    this.drawingHistory = [
      { type: 'canvas-sync', dataURL: snapshot }
    ];
  }

  restoreSnapshot() {
    if (this.snapshot) {
      this.ctx.putImageData(this.snapshot, 0, 0);
    }
  }

  drawLine(x1, y1, x2, y2) {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  drawRect(x1, y1, x2, y2) {
    const width = x2 - x1;
    const height = y2 - y1;
    this.ctx.strokeRect(x1, y1, width, height);
  }

  drawCircle(x1, y1, x2, y2) {
    const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    this.ctx.beginPath();
    this.ctx.arc(x1, y1, radius, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  drawRemote(data) {
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (data.path) {
      this.ctx.strokeStyle = data.tool === 'eraser' ? '#ffffff' : data.color;
      this.ctx.lineWidth = data.tool === 'eraser' ? data.width * 3 : data.width;

      if (data.path.length === 1) {
        this.ctx.beginPath();
        this.ctx.arc(data.path[0].x, data.path[0].y, data.width / 2, 0, Math.PI * 2);
        this.ctx.fillStyle = data.tool === 'eraser' ? '#ffffff' : data.color;
        this.ctx.fill();
      } else {
        this.ctx.beginPath();
        this.ctx.moveTo(data.path[0].x, data.path[0].y);
        for (let i = 1; i < data.path.length; i++) {
          this.ctx.lineTo(data.path[i].x, data.path[i].y);
        }
        this.ctx.stroke();
      }

      if (!data.incremental) {
        this.addToHistory(data);
      }
      return;
    }

    const { tool, color, width, startX, startY, endX, endY } = data;

    this.ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    this.ctx.lineWidth = tool === 'eraser' ? width * 3 : width;

    switch (tool) {
      case 'line':
        this.drawLine(startX, startY, endX, endY);
        break;
      case 'rect':
        this.drawRect(startX, startY, endX, endY);
        break;
      case 'circle':
        this.drawCircle(startX, startY, endX, endY);
        break;
    }

    this.addToHistory(data);
  }

  getCanvasDataURL() {
    return this.canvas.toDataURL('image/png');
  }

  syncFromDataURL(dataURL) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(img, 0, 0);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = dataURL;
    });
  }

  async applyCanvasSync(data) {
    if (data.dataURL) {
      await this.syncFromDataURL(data.dataURL);
      this.drawingHistory = [data];
    } else if (data.history && Array.isArray(data.history)) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawingHistory = [];
      for (const item of data.history) {
        if (item.type === 'canvas-sync' && item.dataURL) {
          await this.syncFromDataURL(item.dataURL);
          this.drawingHistory.push(item);
        } else if (item.type === 'draw') {
          this.drawRemote(item);
        } else if (item.type === 'clear') {
          this.remoteClear();
          this.drawingHistory.push(item);
        }
      }
    }
  }

  getSyncData() {
    const snapshot = this.getCanvasDataURL();
    return {
      type: 'canvas-sync',
      dataURL: snapshot
    };
  }

  clear() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const clearData = { type: 'clear' };
    this.addToHistory(clearData);

    if (this.onDraw) {
      this.onDraw(clearData);
    }
  }

  remoteClear() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setTool(tool) {
    this.currentTool = tool;
  }

  setColor(color) {
    this.strokeColor = color;
  }

  setWidth(width) {
    this.strokeWidth = width;
  }

  resize() {
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = 600;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.putImageData(imageData, 0, 0);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }
}
