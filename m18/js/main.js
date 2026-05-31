import FluidSimulator from './fluid-simulator.js';

async function main() {
  const canvas = document.getElementById('canvas');
  const fpsElement = document.getElementById('fps');
  const resolutionElement = document.getElementById('resolution');
  const frameTimeElement = document.getElementById('frameTime');
  const speedSlider = document.getElementById('speed');
  const speedValue = document.getElementById('speed-value');
  const densitySlider = document.getElementById('density');
  const densityValue = document.getElementById('density-value');
  const iterationsSlider = document.getElementById('iterations');
  const iterationsValue = document.getElementById('iter-value');
  const baseResolutionSlider = document.getElementById('baseResolution');
  const baseResolutionValue = document.getElementById('base-res-value');
  const autoScaleCheckbox = document.getElementById('autoScale');
  const resetBtn = document.getElementById('resetBtn');
  const addCircleBtn = document.getElementById('addCircleBtn');
  const clearObstaclesBtn = document.getElementById('clearObstaclesBtn');
  const obstacleRadiusSlider = document.getElementById('obstacleRadius');
  const obstacleRadiusValue = document.getElementById('obstacle-radius-value');
  const hintText = document.getElementById('hintText');
  const modeButtons = document.querySelectorAll('.mode-btn');

  function resizeCanvas() {
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  try {
    let baseResolution = 512;
    let autoScaleEnabled = true;
    let currentMode = 'fluid';

    const simulator = new FluidSimulator(canvas, {
      resolution: baseResolution,
      timeStep: 0.016,
      velocityDissipation: 0.985,
      densityDissipation: 0.996,
      pressureIterations: 12,
      splatRadius: 0.015,
      splatStrength: 8000,
      obstacleRadius: 0.03,
    });

    await simulator.init();

    simulator.onFpsUpdate = (fps) => {
      fpsElement.textContent = fps;
      frameTimeElement.textContent = simulator.frameTime.toFixed(1) + ' ms';
    };

    simulator.onResolutionChange = (resolution) => {
      resolutionElement.textContent = resolution;
    };

    function setMode(mode) {
      currentMode = mode;
      simulator.setInteractionMode(mode);

      canvas.classList.remove('mode-obstacle', 'mode-eraser');
      if (mode === 'obstacle') canvas.classList.add('mode-obstacle');
      if (mode === 'eraser') canvas.classList.add('mode-eraser');

      modeButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.mode === mode) {
          btn.classList.add('active');
        }
      });

      if (mode === 'fluid') {
        hintText.innerHTML = '<strong>鼠标拖拽</strong> 产生流体效果';
      } else if (mode === 'obstacle') {
        hintText.innerHTML = '<span class="obstacle-hint"><strong>鼠标拖拽</strong> 绘制墙体障碍</span>';
      } else if (mode === 'eraser') {
        hintText.innerHTML = '<span class="eraser-hint"><strong>鼠标拖拽</strong> 擦除障碍物</span>';
      }
    }

    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        setMode(btn.dataset.mode);
      });
    });

    speedSlider.addEventListener('input', (e) => {
      const speed = parseFloat(e.target.value);
      speedValue.textContent = speed.toFixed(1) + 'x';
      simulator.options.timeStep = 0.016 * speed;
    });

    densitySlider.addEventListener('input', (e) => {
      const density = parseFloat(e.target.value);
      densityValue.textContent = density.toFixed(1) + 'x';
      simulator.options.splatStrength = 8000 * density;
    });

    iterationsSlider.addEventListener('input', (e) => {
      const iterations = parseInt(e.target.value);
      iterationsValue.textContent = iterations;
      simulator.options.pressureIterations = iterations;
    });

    baseResolutionSlider.addEventListener('input', (e) => {
      const resolution = parseInt(e.target.value);
      baseResolutionValue.textContent = resolution;
      baseResolution = resolution;
      simulator.initialResolution = baseResolution;
      simulator.changeResolution(baseResolution);
    });

    autoScaleCheckbox.addEventListener('change', (e) => {
      autoScaleEnabled = e.target.checked;
      if (!autoScaleEnabled && simulator.options.resolution !== baseResolution) {
        simulator.changeResolution(baseResolution);
      }
    });

    const originalAdaptiveResolution = simulator.adaptiveResolution.bind(simulator);
    simulator.adaptiveResolution = () => {
      if (!autoScaleEnabled) return;
      originalAdaptiveResolution();
    };

    obstacleRadiusSlider.addEventListener('input', (e) => {
      const radius = parseInt(e.target.value);
      obstacleRadiusValue.textContent = radius;
      simulator.options.obstacleRadius = radius * 0.01;
    });

    addCircleBtn.addEventListener('click', () => {
      const cx = 0.5;
      const cy = 0.5;
      const r = 0.08;
      simulator.addCircleObstacle(cx, cy, r);
    });

    clearObstaclesBtn.addEventListener('click', () => {
      simulator.clearObstacles();
    });

    resetBtn.addEventListener('click', () => {
      simulator.reset();
    });

    resolutionElement.textContent = simulator.options.resolution;

    simulator.start();

  } catch (error) {
    console.error('Failed to initialize fluid simulator:', error);
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
      <h2>⚠️ WebGPU 不可用</h2>
      <p>${error.message}</p>
      <p style="margin-top: 10px; font-size: 12px;">请使用支持 WebGPU 的浏览器（如 Chrome 113+、Edge 113+）</p>
    `;
    document.body.appendChild(errorDiv);
  }
}

main();
