import React, { useRef, useEffect, useCallback, ForwardedRef, forwardRef } from 'react';

const SCREEN_WIDTH = 256;
const SCREEN_HEIGHT = 240;

interface NesScreenProps {
    romLoaded: boolean;
    frameBuffer: Uint8Array | null;
    pendingFrame: boolean;
    onFrameRendered?: () => void;
    canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export const NesScreen = forwardRef<HTMLCanvasElement, NesScreenProps>(function NesScreen(
    { romLoaded, frameBuffer, pendingFrame, onFrameRendered, canvasRef: externalCanvasRef },
    ref: ForwardedRef<HTMLCanvasElement>
) {
    const internalCanvasRef = useRef<HTMLCanvasElement>(null);
    const canvasRef = externalCanvasRef || internalCanvasRef;
    const imageDataRef = useRef<ImageData | null>(null);
    const lastFrameRef = useRef<Uint8Array | null>(null);

    const renderFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx || !imageDataRef.current || !frameBuffer) return;

        if (lastFrameRef.current === frameBuffer) return;
        lastFrameRef.current = frameBuffer;

        const data = imageDataRef.current.data;
        const src = frameBuffer;
        const size = SCREEN_WIDTH * SCREEN_HEIGHT;

        for (let i = 0; i < size; i++) {
            const srcOff = i * 4;
            const dstOff = i * 4;
            data[dstOff] = src[srcOff];
            data[dstOff + 1] = src[srcOff + 1];
            data[dstOff + 2] = src[srcOff + 2];
            data[dstOff + 3] = 255;
        }
        ctx.putImageData(imageDataRef.current, 0, 0);

        if (onFrameRendered) onFrameRendered();
    }, [frameBuffer, onFrameRendered, canvasRef]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;
        imageDataRef.current = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    }, [canvasRef]);

    useEffect(() => {
        if (romLoaded && pendingFrame && frameBuffer) {
            renderFrame();
        }
    }, [romLoaded, pendingFrame, frameBuffer, renderFrame]);

    useEffect(() => {
        if (!romLoaded) {
            lastFrameRef.current = null;
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx || !imageDataRef.current) return;
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        }
    }, [romLoaded, canvasRef]);

    return (
        <div className="nes-screen-container">
            <canvas
                ref={(el) => {
                    (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
                    if (typeof ref === 'function') {
                        ref(el);
                    } else if (ref) {
                        (ref as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
                    }
                }}
                width={SCREEN_WIDTH}
                height={SCREEN_HEIGHT}
                className={`nes-screen ${romLoaded ? 'active' : ''}`}
            />
            {!romLoaded && (
                <div className="nes-screen-overlay">
                    <div className="overlay-content">
                        <span className="overlay-icon">🎮</span>
                        <p>Load a ROM file to start playing</p>
                    </div>
                </div>
            )}
        </div>
    );
});
