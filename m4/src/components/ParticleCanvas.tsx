import { useEffect, useRef, useMemo, useCallback } from "react";
import * as d3 from "d3";
import { useSimulationStore } from "../store/simulationStore";

interface ParticleCanvasProps {
  width?: number;
  height?: number;
}

interface FrameSnapshot {
  positions: Float32Array;
  speeds: Float32Array;
  maxSpeed: number;
  boxLength: number;
  timestamp: number;
}

const TRAIL_LENGTH = 20;

export function ParticleCanvas({ width = 600, height = 600 }: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailsRef = useRef<Float32Array[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<FrameSnapshot | null>(null);
  const targetFrameRef = useRef<FrameSnapshot | null>(null);

  const { currentFrame, params, showTrails } = useSimulationStore();

  const margin = 20;
  const plotWidth = width - margin * 2;
  const plotHeight = height - margin * 2;

  const colorLUT = useMemo(() => {
    const lutSize = 256;
    const lut = new Uint32Array(lutSize);
    const colorScale = d3.scaleSequential(d3.interpolateTurbo).domain([0, 1]);

    for (let i = 0; i < lutSize; i++) {
      const color = d3.color(colorScale(i / (lutSize - 1)))!.rgb();
      lut[i] =
        (255 << 24) |
        ((color.b * 255) << 16) |
        ((color.g * 255) << 8) |
        (color.r * 255);
    }
    return lut;
  }, []);

  useEffect(() => {
    if (!currentFrame) return;

    const numParticles = currentFrame.positions.length;
    const positions = new Float32Array(numParticles * 2);
    const speeds = new Float32Array(numParticles);
    let maxSpeed = 0;

    for (let i = 0; i < numParticles; i++) {
      const pos = currentFrame.positions[i];
      const vel = currentFrame.velocities[i];
      positions[i * 2] = pos[0];
      positions[i * 2 + 1] = pos[1];
      const speed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1]);
      speeds[i] = speed;
      if (speed > maxSpeed) maxSpeed = speed;
    }

    const boxLength =
      params.num_particles > 0
        ? Math.sqrt(params.num_particles / params.density)
        : 10;

    targetFrameRef.current = {
      positions,
      speeds,
      maxSpeed,
      boxLength,
      timestamp: performance.now(),
    };

    if (showTrails) {
      if (trailsRef.current.length !== numParticles) {
        trailsRef.current = Array.from(
          { length: numParticles },
          () => new Float32Array(TRAIL_LENGTH * 2)
        );
      }
      for (let i = 0; i < numParticles; i++) {
        const trail = trailsRef.current[i];
        for (let j = TRAIL_LENGTH - 1; j > 0; j--) {
          trail[j * 2] = trail[(j - 1) * 2];
          trail[j * 2 + 1] = trail[(j - 1) * 2 + 1];
        }
        trail[0] = positions[i * 2];
        trail[1] = positions[i * 2 + 1];
      }
    } else {
      trailsRef.current = [];
    }
  }, [currentFrame, params.num_particles, params.density, showTrails]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const scaleX = (x: number, boxLength: number) =>
      margin + (x / boxLength) * plotWidth;
    const scaleY = (y: number, boxLength: number) =>
      margin + plotHeight - (y / boxLength) * plotHeight;

    const particleOffscreenCanvas = document.createElement("canvas");
    const particleSize = 16;
    particleOffscreenCanvas.width = particleSize * 256;
    particleOffscreenCanvas.height = particleSize;
    const pCtx = particleOffscreenCanvas.getContext("2d")!;

    for (let i = 0; i < 256; i++) {
      const rgba = colorLUT[i];
      const r = rgba & 0xff;
      const g = (rgba >> 8) & 0xff;
      const b = (rgba >> 16) & 0xff;
      pCtx.fillStyle = `rgb(${r},${g},${b})`;
      pCtx.beginPath();
      pCtx.arc(i * particleSize + particleSize / 2, particleSize / 2, particleSize / 2 - 1, 0, Math.PI * 2);
      pCtx.fill();
    }

    const render = () => {
      const target = targetFrameRef.current;

      ctx.fillStyle = "#1a1f2e";
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "#2a3040";
      ctx.lineWidth = 1;
      ctx.strokeRect(margin - 0.5, margin - 0.5, plotWidth + 1, plotHeight + 1);

      if (!target) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const { positions, speeds, maxSpeed, boxLength } = target;
      const numParticles = positions.length / 2;
      const particleRadius = Math.max(
        2,
        Math.min(6, plotWidth / (boxLength * 4))
      );
      const scale = (particleRadius * 2) / particleSize;

      if (showTrails && trailsRef.current.length === numParticles) {
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";

        for (let i = 0; i < numParticles; i++) {
          const trail = trailsRef.current[i];
          const colorIndex = maxSpeed > 0 ? Math.min(Math.floor((speeds[i] / maxSpeed) * 255), 255) : 0;
          const rgba = colorLUT[colorIndex];
          const r = rgba & 0xff;
          const g = (rgba >> 8) & 0xff;
          const b = (rgba >> 16) & 0xff;
          ctx.strokeStyle = `rgb(${r},${g},${b})`;
          ctx.globalAlpha = 0.4;

          ctx.beginPath();
          let started = false;
          for (let j = 0; j < TRAIL_LENGTH; j++) {
            const tx = trail[j * 2];
            const ty = trail[j * 2 + 1];
            if (tx === 0 && ty === 0 && j > 0) continue;
            const sx = scaleX(tx, boxLength);
            const sy = scaleY(ty, boxLength);
            if (!started) {
              ctx.moveTo(sx, sy);
              started = true;
            } else {
              ctx.lineTo(sx, sy);
            }
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      for (let i = 0; i < numParticles; i++) {
        const x = scaleX(positions[i * 2], boxLength);
        const y = scaleY(positions[i * 2 + 1], boxLength);
        const colorIndex = maxSpeed > 0 ? Math.min(Math.floor((speeds[i] / maxSpeed) * 255), 255) : 0;

        ctx.drawImage(
          particleOffscreenCanvas,
          colorIndex * particleSize,
          0,
          particleSize,
          particleSize,
          x - particleRadius,
          y - particleRadius,
          particleSize * scale,
          particleSize * scale
        );
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [width, height, plotWidth, plotHeight, showTrails, colorLUT]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded-lg"
      style={{
        backgroundColor: "rgba(26, 31, 46, 0.5)",
        imageRendering: "pixelated",
      }}
    />
  );
}
