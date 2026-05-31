import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NesScreen } from './components/NesScreen';
import { ControlPanel } from './components/ControlPanel';
import { KeyMapping } from './components/KeyMapping';
import { SavePanel } from './components/SavePanel';
import { AudioEngine } from './audio/AudioEngine';
import { saveStateManager } from './save/SaveStateManager';
import {
    BUTTON_A, BUTTON_B, BUTTON_SELECT, BUTTON_START,
    BUTTON_UP, BUTTON_DOWN, BUTTON_LEFT, BUTTON_RIGHT,
    AUDIO_SAMPLE_RATE, AUDIO_BUFFER_SIZE, AUDIO_TARGET_LATENCY,
    AUDIO_MIN_LATENCY, AUDIO_MAX_LATENCY,
    AUTO_SAVE_INTERVAL,
} from './types';
import './styles.css';

const KEY_MAP: { [key: string]: number } = {
    'KeyZ': BUTTON_A,
    'KeyX': BUTTON_B,
    'ShiftLeft': BUTTON_SELECT,
    'ShiftRight': BUTTON_SELECT,
    'Enter': BUTTON_START,
    'ArrowUp': BUTTON_UP,
    'ArrowDown': BUTTON_DOWN,
    'ArrowLeft': BUTTON_LEFT,
    'ArrowRight': BUTTON_RIGHT,
    'KeyA': BUTTON_A,
    'KeyS': BUTTON_B,
};

export default function App() {
    const [romLoaded, setRomLoaded] = useState(false);
    const [romInfo, setRomInfo] = useState<string>('');
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [showKeyMapping, setShowKeyMapping] = useState(false);
    const [showSavePanel, setShowSavePanel] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [stats, setStats] = useState({ fps: 0, latency: 0, underruns: 0, overruns: 0, drift: 0 });

    const audioEngineRef = useRef<AudioEngine | null>(null);
    const frameBufferRef = useRef<Uint8Array | null>(null);
    const pendingFrameRef = useRef<boolean>(false);
    const statsIntervalRef = useRef<number | null>(null);
    const frameCountRef = useRef<number>(0);
    const lastStatsTimeRef = useRef<number>(performance.now());
    const audioInitializedRef = useRef<boolean>(false);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const showToast = useCallback((type: 'success' | 'error' | 'info', text: string) => {
        setSaveMessage({ type, text });
        setTimeout(() => setSaveMessage(null), 3000);
    }, []);

    const updateFrameBuffer = useCallback(async () => {
        try {
            const buf = await window.nesAPI?.getFrameBuffer();
            if (buf) {
                frameBufferRef.current = new Uint8Array(buf as any);
                pendingFrameRef.current = true;
            }
        } catch (e) {
            console.error('Frame buffer update failed:', e);
        }
    }, []);

    const quickSave = useCallback(async (slot: number = 0) => {
        if (!romLoaded) {
            showToast('error', '请先加载 ROM');
            return false;
        }

        try {
            const stateResult = await window.nesAPI.saveState();
            if (!stateResult.success) {
                showToast('error', stateResult.error || '存档失败');
                return false;
            }

            let thumbnail: string | undefined;
            if (canvasRef.current) {
                thumbnail = canvasRef.current.toDataURL('image/jpeg', 0.6);
            }

            const result = await saveStateManager.quickSave(slot, stateResult.state, thumbnail);
            if (result.success && result.save) {
                showToast('success', `已保存到槽位 ${slot} (F5)`);
                return true;
            } else {
                showToast('error', result.error || '存档失败');
                return false;
            }
        } catch (e: any) {
            showToast('error', e.message || '存档失败');
            return false;
        }
    }, [romLoaded, showToast]);

    const quickLoad = useCallback(async (slot: number = 0) => {
        if (!romLoaded) {
            showToast('error', '请先加载 ROM');
            return false;
        }

        try {
            const result = await saveStateManager.quickLoad(slot);
            if (result.success && result.state) {
                const loadResult = await window.nesAPI.loadState(result.state);
                if (loadResult.success) {
                    showToast('success', `已加载槽位 ${slot} (F7)`);
                    if (audioEngineRef.current) {
                        audioEngineRef.current.clear();
                    }
                    return true;
                } else {
                    showToast('error', loadResult.error || '读档失败');
                    return false;
                }
            } else {
                showToast('error', result.error || `槽位 ${slot} 没有存档`);
                return false;
            }
        } catch (e: any) {
            showToast('error', e.message || '读档失败');
            return false;
        }
    }, [romLoaded, showToast]);

    const initAudio = useCallback(async () => {
        if (audioInitializedRef.current) return;
        if (!audioEnabled) return;

        try {
            const engine = new AudioEngine({
                sampleRate: AUDIO_SAMPLE_RATE,
                bufferSize: AUDIO_BUFFER_SIZE,
                targetLatency: AUDIO_TARGET_LATENCY,
                minLatency: AUDIO_MIN_LATENCY,
                maxLatency: AUDIO_MAX_LATENCY,
                onNeedSamples: async (samplesNeeded) => {
                    try {
                        const result = await window.nesAPI.stepBySamples(samplesNeeded);
                        if (result.frame) {
                            frameBufferRef.current = new Uint8Array(result.frame as any);
                            pendingFrameRef.current = true;
                            frameCountRef.current++;
                        }
                        let audio = result.audio;
                        if (!audio || audio.length === 0) {
                            audio = new Int16Array(samplesNeeded);
                        } else if (audio.length < samplesNeeded) {
                            const padded = new Int16Array(samplesNeeded);
                            padded.set(audio, 0);
                            audio = padded;
                        } else if (audio.length > samplesNeeded) {
                            audio = audio.slice(0, samplesNeeded);
                        }
                        return {
                            audio,
                            frameReady: false,
                            frame: result.frame
                        };
                    } catch (e) {
                        console.error('stepBySamples error:', e);
                        return { audio: new Int16Array(samplesNeeded), frameReady: false, frame: null };
                    }
                },
                onFrameReady: (frame) => {
                    if (frame) {
                        frameBufferRef.current = new Uint8Array(frame as any);
                        pendingFrameRef.current = true;
                        frameCountRef.current++;
                    }
                },
                onUnderrun: () => {
                    console.warn('Audio underrun detected');
                },
                onOverrun: () => {
                    console.warn('Audio overrun detected');
                },
            });

            const started = await engine.start();
            if (started) {
                audioEngineRef.current = engine;
                audioInitializedRef.current = true;
                console.log('Audio engine started successfully');
            }
        } catch (e) {
            console.error('Failed to initialize audio engine:', e);
        }
    }, [audioEnabled]);

    const stopAudio = useCallback(async () => {
        if (audioEngineRef.current) {
            await audioEngineRef.current.stop();
            audioEngineRef.current = null;
        }
        audioInitializedRef.current = false;
    }, []);

    const toggleAudio = useCallback(async () => {
        if (audioEnabled) {
            await stopAudio();
            setAudioEnabled(false);
        } else {
            setAudioEnabled(true);
            if (romLoaded) {
                await initAudio();
            }
        }
    }, [audioEnabled, romLoaded, initAudio, stopAudio]);

    const startAutoSave = useCallback(() => {
        if (autoSaveTimerRef.current) {
            clearInterval(autoSaveTimerRef.current);
        }
        autoSaveTimerRef.current = setInterval(() => {
            if (romLoaded && !showSavePanel) {
                quickSave(9).catch(console.error);
            }
        }, AUTO_SAVE_INTERVAL);
    }, [romLoaded, showSavePanel, quickSave]);

    const stopAutoSave = useCallback(() => {
        if (autoSaveTimerRef.current) {
            clearInterval(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
        }
    }, []);

    const loadROM = useCallback(async () => {
        try {
            const result = await window.nesAPI?.openROM();
            if (result?.success) {
                setRomLoaded(true);
                setRomInfo('ROM Loaded');
                frameBufferRef.current = null;
                pendingFrameRef.current = false;
                frameCountRef.current = 0;
                lastStatsTimeRef.current = performance.now();

                const gameHash = result.gameHash || await window.nesAPI.getGameHash();
                const gameTitle = result.gameTitle || await window.nesAPI.getGameTitle();
                saveStateManager.setCurrentGame(gameHash, gameTitle);

                try { await window.nesAPI?.clearAudioSamples(); } catch (e) {}

                if (audioEngineRef.current) {
                    audioEngineRef.current.clear();
                }

                if (audioEnabled && !audioInitializedRef.current) {
                    await initAudio();
                }

                startAutoSave();
            } else if (result?.error) {
                setRomInfo(`Error: ${result.error}`);
            }
        } catch (e) {
            console.error('ROM load failed:', e);
            setRomInfo('Failed to load ROM');
        }
    }, [audioEnabled, initAudio, startAutoSave]);

    const resetROM = useCallback(async () => {
        try {
            await window.nesAPI?.reset();
            if (audioEngineRef.current) {
                audioEngineRef.current.clear();
            }
            frameBufferRef.current = null;
            pendingFrameRef.current = false;
            try { await window.nesAPI?.clearAudioSamples(); } catch (e) {}
        } catch (e) {
            console.error('Reset failed:', e);
        }
    }, []);

    const handleButton = useCallback((button: number, pressed: boolean) => {
        window.nesAPI?.setButton(button, pressed).catch(console.error);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.repeat) return;
            const code = e.code;

            if (code === 'F5') {
                e.preventDefault();
                quickSave(0);
                return;
            }
            if (code === 'F7') {
                e.preventDefault();
                quickLoad(0);
                return;
            }
            if (code === 'F2') {
                e.preventDefault();
                setShowSavePanel(prev => !prev);
                return;
            }
            if (code === 'Escape') {
                if (showSavePanel) {
                    setShowSavePanel(false);
                } else if (showKeyMapping) {
                    setShowKeyMapping(false);
                }
                return;
            }

            if (KEY_MAP[code] !== undefined) {
                e.preventDefault();
                handleButton(KEY_MAP[code], true);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const code = e.code;
            if (KEY_MAP[code] !== undefined) {
                e.preventDefault();
                handleButton(KEY_MAP[code], false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleButton, quickSave, quickLoad, showSavePanel, showKeyMapping]);

    useEffect(() => {
        let animationId: number;
        let lastTime = 0;
        const videoFrameInterval = 1000 / 60;

        const videoLoop = (time: number) => {
            animationId = requestAnimationFrame(videoLoop);

            const delta = time - lastTime;
            if (delta >= videoFrameInterval) {
                lastTime = time - (delta % videoFrameInterval);

                if (romLoaded && pendingFrameRef.current && frameBufferRef.current) {
                    pendingFrameRef.current = false;
                } else if (romLoaded && !audioInitializedRef.current) {
                    (async () => {
                        await window.nesAPI?.stepFrame();
                        await updateFrameBuffer();
                        frameCountRef.current++;
                    })();
                }
            }

            const now = performance.now();
            if (now - lastStatsTimeRef.current >= 1000) {
                const fps = Math.round(frameCountRef.current * 1000 / (now - lastStatsTimeRef.current));
                frameCountRef.current = 0;
                lastStatsTimeRef.current = now;

                const engine = audioEngineRef.current;
                setStats({
                    fps,
                    latency: engine ? engine.getLatency() : 0,
                    underruns: engine ? engine.getUnderrunCount() : 0,
                    overruns: engine ? engine.getOverrunCount() : 0,
                    drift: engine ? engine.getDriftCorrection() : 0,
                });
            }
        };

        animationId = requestAnimationFrame(videoLoop);

        return () => {
            cancelAnimationFrame(animationId);
            stopAutoSave();
            saveStateManager.destroy();
        };
    }, [romLoaded, updateFrameBuffer, stopAutoSave]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            if (!audioEngineRef.current || !romLoaded) return;
            const engine = audioEngineRef.current;
            setStats(prev => ({
                ...prev,
                latency: engine.getLatency(),
                underruns: engine.getUnderrunCount(),
                overruns: engine.getOverrunCount(),
                drift: engine.getDriftCorrection(),
            }));
        }, 250);
        statsIntervalRef.current = interval as unknown as number;
        return () => clearInterval(interval);
    }, [romLoaded]);

    useEffect(() => {
        return () => {
            stopAudio();
            stopAutoSave();
        };
    }, [stopAudio, stopAutoSave]);

    useEffect(() => {
        if (!romLoaded) {
            stopAutoSave();
        }
    }, [romLoaded, stopAutoSave]);

    return (
        <div className="app-container">
            <header className="app-header">
                <h1 className="app-title">🕹️ NES Emulator</h1>
                <div className="header-actions">
                    {romLoaded && (
                        <>
                            <button className="btn btn-secondary" onClick={() => quickSave(0)} title="F5 快速存档">
                                💾 Save
                            </button>
                            <button className="btn btn-secondary" onClick={() => quickLoad(0)} title="F7 快速读档">
                                📂 Load
                            </button>
                            <button
                                className={`btn ${showSavePanel ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setShowSavePanel(!showSavePanel)}
                                title="F2 存档管理"
                            >
                                📁 Slots
                            </button>
                            <button className="btn btn-secondary" onClick={resetROM}>Reset</button>
                        </>
                    )}
                    <button className="btn btn-secondary" onClick={() => setShowKeyMapping(!showKeyMapping)}>Controls</button>
                    <button
                        className={`btn ${audioEnabled ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={toggleAudio}
                        title={audioEnabled ? 'Disable Audio' : 'Enable Audio'}
                    >
                        {audioEnabled ? '🔊' : '🔇'}
                    </button>
                    <button className="btn btn-primary" onClick={loadROM}>
                        {romLoaded ? 'Load Another ROM' : 'Load ROM'}
                    </button>
                </div>
            </header>

            <div className="status-bar">
                <div className="status-item">
                    <span className="status-label">Status:</span>
                    <span className={`status-value ${romLoaded ? 'status-ok' : 'status-idle'}`}>
                        {romLoaded ? 'Running' : 'Idle'}
                    </span>
                </div>
                <div className="status-item">
                    <span className="status-label">FPS:</span>
                    <span className="status-value">{stats.fps}</span>
                </div>
                {audioEnabled && (
                    <>
                        <div className="status-item">
                            <span className="status-label">Latency:</span>
                            <span className="status-value">{(stats.latency * 1000).toFixed(1)}ms</span>
                        </div>
                        <div className="status-item">
                            <span className="status-label">Underruns:</span>
                            <span className={`status-value ${stats.underruns > 0 ? 'status-warn' : ''}`}>
                                {stats.underruns}
                            </span>
                        </div>
                        <div className="status-item">
                            <span className="status-label">Overruns:</span>
                            <span className={`status-value ${stats.overruns > 0 ? 'status-warn' : ''}`}>
                                {stats.overruns}
                            </span>
                        </div>
                        <div className="status-item">
                            <span className="status-label">Drift:</span>
                            <span className="status-value">{(stats.drift * 100).toFixed(2)}%</span>
                        </div>
                    </>
                )}
                {romInfo && (
                    <div className="status-item">
                        <span className="status-value">{romInfo}</span>
                    </div>
                )}
            </div>

            {saveMessage && (
                <div className={`message-bar message-${saveMessage.type}`} style={{ position: 'fixed', top: 110, left: 0, right: 0, zIndex: 999 }}>
                    {saveMessage.text}
                </div>
            )}

            <main className="main-content">
                <div className="screen-wrapper">
                    <NesScreen
                        romLoaded={romLoaded}
                        frameBuffer={frameBufferRef.current}
                        pendingFrame={pendingFrameRef.current}
                        onFrameRendered={() => { pendingFrameRef.current = false; }}
                        canvasRef={canvasRef}
                    />
                </div>

                <ControlPanel
                    onButtonDown={(btn) => handleButton(btn, true)}
                    onButtonUp={(btn) => handleButton(btn, false)}
                />
            </main>

            {showKeyMapping && <KeyMapping onClose={() => setShowKeyMapping(false)} />}

            <SavePanel
                isOpen={showSavePanel}
                onClose={() => setShowSavePanel(false)}
                canvasRef={canvasRef}
                onQuickSave={quickSave}
                onQuickLoad={quickLoad}
            />

            <footer className="app-footer">
                <p>
                    NES Emulator · Core: {audioInitializedRef.current ? 'Audio-Driven (APU Clock)' : 'Video-Driven (RAF)'} ·
                    Sample Rate: {AUDIO_SAMPLE_RATE}Hz · Buffer: {AUDIO_BUFFER_SIZE} ·
                    快捷键: F2 存档 | F5 快速存档 | F7 快速读档 | Esc 关闭
                </p>
            </footer>
        </div>
    );
}
