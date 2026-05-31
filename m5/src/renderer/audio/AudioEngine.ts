import {
    AUDIO_SAMPLE_RATE,
    AUDIO_BUFFER_SIZE,
    AUDIO_TARGET_LATENCY,
    AUDIO_MIN_LATENCY,
    AUDIO_MAX_LATENCY,
} from '../types';

interface AudioEngineOptions {
    sampleRate?: number;
    bufferSize?: number;
    targetLatency?: number;
    minLatency?: number;
    maxLatency?: number;
    onNeedSamples: (samplesNeeded: number) => Promise<{ audio: Int16Array | null; frameReady: boolean; frame: any }>;
    onFrameReady?: (frame: any) => void;
    onUnderrun?: () => void;
    onOverrun?: () => void;
}

export class AudioEngine {
    private audioContext: AudioContext | null = null;
    private scriptNode: ScriptProcessorNode | null = null;
    private gainNode: GainNode | null = null;

    private ringBuffer: Float32Array;
    private ringBufferMask: number;
    private writeIndex = 0;
    private readIndex = 0;

    private sampleRate: number;
    private bufferSize: number;
    private targetLatency: number;
    private minLatency: number;
    private maxLatency: number;

    private targetBufferLevel: number;
    private minBufferLevel: number;
    private maxBufferLevel: number;

    private running = false;
    private primed = false;
    private primingSamples = 0;

    private underrunCount = 0;
    private overrunCount = 0;

    private onNeedSamples: (samplesNeeded: number) => Promise<{ audio: Int16Array | null; frameReady: boolean; frame: any }>;
    private onFrameReady?: (frame: any) => void;
    private onUnderrun?: () => void;
    private onOverrun?: () => void;

    private lastFillTime = 0;
    private fillInterval: number;

    private simulationDrift = 0;
    private driftCorrection = 0;
    private frameSkipCounter = 0;
    private lastBufferLevel = 0;

    constructor(options: AudioEngineOptions) {
        this.sampleRate = options.sampleRate || AUDIO_SAMPLE_RATE;
        this.bufferSize = options.bufferSize || AUDIO_BUFFER_SIZE;
        this.targetLatency = options.targetLatency || AUDIO_TARGET_LATENCY;
        this.minLatency = options.minLatency || AUDIO_MIN_LATENCY;
        this.maxLatency = options.maxLatency || AUDIO_MAX_LATENCY;

        this.targetBufferLevel = Math.floor(this.targetLatency * this.sampleRate);
        this.minBufferLevel = Math.floor(this.minLatency * this.sampleRate);
        this.maxBufferLevel = Math.floor(this.maxLatency * this.sampleRate);

        const ringSize = Math.pow(2, Math.ceil(Math.log2(this.maxBufferLevel * 4)));
        this.ringBuffer = new Float32Array(ringSize);
        this.ringBufferMask = ringSize - 1;
        this.primingSamples = Math.floor(this.targetBufferLevel * 1.5);
        this.fillInterval = Math.floor(this.targetBufferLevel * 0.6);

        this.onNeedSamples = options.onNeedSamples;
        this.onFrameReady = options.onFrameReady;
        this.onUnderrun = options.onUnderrun;
        this.onOverrun = options.onOverrun;
    }

    async start(): Promise<boolean> {
        try {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: this.sampleRate,
                latencyHint: 'interactive',
            });

            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            this.scriptNode = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 0.8;

            this.scriptNode.onaudioprocess = this.onAudioProcess.bind(this);
            this.scriptNode.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);

            this.writeIndex = 0;
            this.readIndex = 0;
            this.primed = false;
            this.running = true;
            this.underrunCount = 0;
            this.overrunCount = 0;
            this.simulationDrift = 0;
            this.driftCorrection = 0;

            await this.primeBuffer();
            return true;
        } catch (err) {
            console.error('AudioEngine failed to start:', err);
            return false;
        }
    }

    async stop(): Promise<void> {
        this.running = false;
        this.primed = false;

        if (this.scriptNode) {
            try {
                this.scriptNode.disconnect();
            } catch (e) {}
            this.scriptNode.onaudioprocess = null;
            this.scriptNode = null;
        }
        if (this.gainNode) {
            try { this.gainNode.disconnect(); } catch (e) {}
            this.gainNode = null;
        }
        if (this.audioContext) {
            try { await this.audioContext.close(); } catch (e) {}
            this.audioContext = null;
        }
    }

    clear(): void {
        this.writeIndex = 0;
        this.readIndex = 0;
        this.ringBuffer.fill(0);
        this.primed = false;
        this.simulationDrift = 0;
        this.driftCorrection = 0;
        this.frameSkipCounter = 0;
        this.lastBufferLevel = 0;
    }

    getLatency(): number {
        return this.getBufferLevel() / this.sampleRate;
    }

    getUnderrunCount(): number { return this.underrunCount; }
    getOverrunCount(): number { return this.overrunCount; }
    getBufferLevel(): number { return (this.writeIndex - this.readIndex) & this.ringBufferMask; }
    getDriftCorrection(): number { return this.driftCorrection; }
    isRunning(): boolean { return this.running && this.primed; }

    private async primeBuffer(): Promise<void> {
        try {
            const needed = this.primingSamples;
            const result = await this.onNeedSamples(needed);
            if (result.audio && result.audio.length > 0) {
                this.writeSamples(result.audio);
            }
            if (result.frameReady && this.onFrameReady && result.frame) {
                this.onFrameReady(result.frame);
            }
        } catch (e) {
            console.error('Error priming audio buffer:', e);
        }
        this.primed = true;
    }

    private async onAudioProcess(event: AudioProcessingEvent): Promise<void> {
        if (!this.running || !this.primed) {
            const output = event.outputBuffer.getChannelData(0);
            output.fill(0);
            return;
        }

        const output = event.outputBuffer.getChannelData(0);
        const samplesNeeded = output.length;
        const available = this.getBufferLevel();

        if (available < samplesNeeded) {
            output.fill(0);
            this.underrunCount++;
            if (this.onUnderrun) this.onUnderrun();
            if (available < this.minBufferLevel) {
                this.primed = false;
                this.primeBuffer();
            }
            return;
        }

        for (let i = 0; i < samplesNeeded; i++) {
            output[i] = this.ringBuffer[(this.readIndex + i) & this.ringBufferMask];
        }
        this.readIndex = (this.readIndex + samplesNeeded) & this.ringBufferMask;

        const now = performance.now();
        const timeSinceLastFill = now - this.lastFillTime;
        const currentLevel = this.getBufferLevel();

        const delta = currentLevel - this.lastBufferLevel;
        const expectedDelta = -samplesNeeded;
        this.simulationDrift += (delta - expectedDelta);

        if (timeSinceLastFill > 8 || currentLevel < this.fillInterval) {
            this.lastFillTime = now;
            this.lastBufferLevel = currentLevel;

            let targetFill = this.targetBufferLevel - currentLevel;

            if (currentLevel < this.minBufferLevel) {
                targetFill = this.targetBufferLevel - currentLevel + this.fillInterval;
                this.driftCorrection = Math.max(-0.1, this.driftCorrection - 0.005);
            } else if (currentLevel > this.maxBufferLevel) {
                targetFill = 0;
                this.overrunCount++;
                if (this.onOverrun) this.onOverrun();

                const skipSamples = currentLevel - this.targetBufferLevel;
                this.readIndex = (this.readIndex + skipSamples) & this.ringBufferMask;
                this.driftCorrection = Math.min(0.1, this.driftCorrection + 0.005);
            } else if (Math.abs(currentLevel - this.targetBufferLevel) > this.targetBufferLevel * 0.2) {
                const error = currentLevel - this.targetBufferLevel;
                this.driftCorrection = Math.max(-0.05, Math.min(0.05, -error / this.sampleRate));
            } else {
                this.driftCorrection *= 0.99;
            }

            if (targetFill > 0) {
                const adjustedFill = Math.floor(targetFill * (1 + this.driftCorrection));
                const samplesToRequest = Math.max(this.bufferSize, Math.min(this.targetBufferLevel * 2, adjustedFill));

                try {
                    const result = await this.onNeedSamples(samplesToRequest);
                    if (result.audio && result.audio.length > 0) {
                        this.writeSamples(result.audio);
                    }
                    if (result.frameReady && this.onFrameReady && result.frame) {
                        this.onFrameReady(result.frame);
                    }
                } catch (e) {
                    console.error('Error refilling audio buffer:', e);
                }
            }
        }
    }

    private writeSamples(samples: Int16Array): void {
        const availableSpace = this.ringBuffer.length - this.getBufferLevel();

        if (samples.length > availableSpace) {
            this.overrunCount++;
            if (this.onOverrun) this.onOverrun();
            const skip = samples.length - availableSpace + 1;
            this.readIndex = (this.readIndex + skip) & this.ringBufferMask;
        }

        const gain = 1.0 / 32768.0;
        for (let i = 0; i < samples.length; i++) {
            const idx = (this.writeIndex + i) & this.ringBufferMask;
            this.ringBuffer[idx] = samples[i] * gain;
        }
        this.writeIndex = (this.writeIndex + samples.length) & this.ringBufferMask;
    }

    setVolume(volume: number): void {
        if (this.gainNode) {
            this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
        }
    }
}
