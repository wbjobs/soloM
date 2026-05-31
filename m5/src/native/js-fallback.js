const BUTTON_A = 0;
const BUTTON_B = 1;
const BUTTON_SELECT = 2;
const BUTTON_START = 3;
const BUTTON_UP = 4;
const BUTTON_DOWN = 5;
const BUTTON_LEFT = 6;
const BUTTON_RIGHT = 7;

const SAMPLE_RATE = 44100;
const CPU_CLOCK = 1789773;
const CYCLES_PER_SAMPLE = Math.floor(CPU_CLOCK / SAMPLE_RATE);

const NOISE_PERIODS = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
const DMC_PERIODS = [428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54];
const DUTY_TABLES = [
    [0, 1, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 0, 0, 0, 0, 0],
    [0, 1, 1, 1, 1, 0, 0, 0],
    [1, 0, 0, 1, 1, 1, 1, 1],
];
const TRIANGLE_TABLE = [
    15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];
const LENGTH_TABLE = [
    10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
    12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30
];

class APU {
    constructor() {
        this.pulse1 = this.createPulseChannel();
        this.pulse2 = this.createPulseChannel();
        this.triangle = {
            timer: 0, timerLoad: 0, lengthCounter: 0, lengthHalt: false,
            linearCounter: 0, linearLoad: 0, linearReload: false,
            sequenceCounter: 0, output: 0
        };
        this.noise = {
            volume: 0, envelopeLoop: false, envelopeConstant: false,
            timerPeriod: 0, lengthCounter: 0, lengthHalt: false, modeFlag: false,
            envelopeCounter: 15, envelopeDivider: 1, timerCounter: 0,
            shiftRegister: 1, sample: 0
        };
        this.dmc = {
            volume: 0, sampleAddress: 0xC000, sampleLength: 1,
            irqEnable: false, loop: false, rateIndex: 0,
            output: 0, bitsRemaining: 0, currentByte: 0,
            silence: true, sampleCounter: 0, timerCounter: 0, timerPeriod: 428
        };
        this.frameCounterMode = 0;
        this.frameIrqInhibit = false;
        this.frameCounter = 0;
        this.frameSequence = 0;
        this.frameIrqFlag = false;
        this.cycleCounter = 0;
        this.sampleCounter = 0;
        this.sampleCount = 0;
        this.irqCallback = null;
    }

    createPulseChannel() {
        return {
            duty: 0, volume: 0, envelopeLoop: false, envelopeConstant: false,
            timer: 0, timerLoad: 0, lengthCounter: 0, lengthHalt: false,
            sweepShift: 0, sweepEnable: false, sweepNegate: false, sweepPeriod: 0,
            envelopeCounter: 15, envelopeDivider: 1, sweepCounter: 0,
            sequenceCounter: 0, dutyCounter: 0, sweepMuted: false, sample: 0
        };
    }

    reset() {
        this.pulse1 = this.createPulseChannel();
        this.pulse2 = this.createPulseChannel();
        this.triangle = {
            timer: 0, timerLoad: 0, lengthCounter: 0, lengthHalt: false,
            linearCounter: 0, linearLoad: 0, linearReload: false,
            sequenceCounter: 0, output: 0
        };
        this.noise = {
            volume: 0, envelopeLoop: false, envelopeConstant: false,
            timerPeriod: 0, lengthCounter: 0, lengthHalt: false, modeFlag: false,
            envelopeCounter: 15, envelopeDivider: 1, timerCounter: 0,
            shiftRegister: 1, sample: 0
        };
        this.dmc = {
            volume: 0, sampleAddress: 0xC000, sampleLength: 1,
            irqEnable: false, loop: false, rateIndex: 0,
            output: 0, bitsRemaining: 0, currentByte: 0,
            silence: true, sampleCounter: 0, timerCounter: 0, timerPeriod: 428
        };
        this.frameCounterMode = 0;
        this.frameIrqInhibit = false;
        this.frameCounter = 0;
        this.frameSequence = 0;
        this.frameIrqFlag = false;
        this.cycleCounter = 0;
        this.sampleCounter = 0;
        this.sampleCount = 0;
    }

    readRegister(addr) {
        if (addr === 0x4015) {
            let status = 0;
            if (this.pulse1.lengthCounter > 0) status |= 0x01;
            if (this.pulse2.lengthCounter > 0) status |= 0x02;
            if (this.triangle.lengthCounter > 0) status |= 0x04;
            if (this.noise.lengthCounter > 0) status |= 0x08;
            if (this.dmc.sampleCounter > 0) status |= 0x10;
            if (this.frameIrqFlag) status |= 0x40;
            if (this.dmc.irqEnable && this.dmc.sampleCounter === 0) status |= 0x80;
            this.frameIrqFlag = false;
            return status;
        }
        return 0;
    }

    writeRegister(addr, data) {
        switch (addr) {
            case 0x4000:
                this.pulse1.volume = data & 0x0F;
                this.pulse1.envelopeConstant = (data & 0x10) !== 0;
                this.pulse1.envelopeLoop = (data & 0x20) !== 0;
                this.pulse1.lengthHalt = (data & 0x20) !== 0;
                this.pulse1.duty = (data >> 6) & 0x03;
                break;
            case 0x4001:
                this.pulse1.sweepShift = data & 0x07;
                this.pulse1.sweepNegate = (data & 0x08) !== 0;
                this.pulse1.sweepPeriod = (data >> 4) & 0x07;
                this.pulse1.sweepEnable = (data & 0x80) !== 0;
                this.pulse1.sweepCounter = this.pulse1.sweepPeriod;
                break;
            case 0x4002:
                this.pulse1.timerLoad = (this.pulse1.timerLoad & 0xFF00) | data;
                this.pulse1.timer = this.pulse1.timerLoad;
                break;
            case 0x4003:
                this.pulse1.timerLoad = (this.pulse1.timerLoad & 0x00FF) | ((data & 0x07) << 8);
                this.pulse1.timer = this.pulse1.timerLoad;
                this.pulse1.lengthCounter = LENGTH_TABLE[(data >> 3) & 0x1F];
                this.pulse1.envelopeDivider = 1;
                this.pulse1.envelopeCounter = 15;
                this.pulse1.sweepMuted = false;
                break;
            case 0x4004:
                this.pulse2.volume = data & 0x0F;
                this.pulse2.envelopeConstant = (data & 0x10) !== 0;
                this.pulse2.envelopeLoop = (data & 0x20) !== 0;
                this.pulse2.lengthHalt = (data & 0x20) !== 0;
                this.pulse2.duty = (data >> 6) & 0x03;
                break;
            case 0x4005:
                this.pulse2.sweepShift = data & 0x07;
                this.pulse2.sweepNegate = (data & 0x08) !== 0;
                this.pulse2.sweepPeriod = (data >> 4) & 0x07;
                this.pulse2.sweepEnable = (data & 0x80) !== 0;
                this.pulse2.sweepCounter = this.pulse2.sweepPeriod;
                break;
            case 0x4006:
                this.pulse2.timerLoad = (this.pulse2.timerLoad & 0xFF00) | data;
                this.pulse2.timer = this.pulse2.timerLoad;
                break;
            case 0x4007:
                this.pulse2.timerLoad = (this.pulse2.timerLoad & 0x00FF) | ((data & 0x07) << 8);
                this.pulse2.timer = this.pulse2.timerLoad;
                this.pulse2.lengthCounter = LENGTH_TABLE[(data >> 3) & 0x1F];
                this.pulse2.envelopeDivider = 1;
                this.pulse2.envelopeCounter = 15;
                this.pulse2.sweepMuted = false;
                break;
            case 0x4008:
                this.triangle.linearLoad = data & 0x7F;
                this.triangle.lengthHalt = (data & 0x80) !== 0;
                break;
            case 0x400A:
                this.triangle.timerLoad = (this.triangle.timerLoad & 0xFF00) | data;
                this.triangle.timer = this.triangle.timerLoad;
                break;
            case 0x400B:
                this.triangle.timerLoad = (this.triangle.timerLoad & 0x00FF) | ((data & 0x07) << 8);
                this.triangle.timer = this.triangle.timerLoad;
                this.triangle.lengthCounter = LENGTH_TABLE[(data >> 3) & 0x1F];
                this.triangle.linearReload = true;
                break;
            case 0x400C:
                this.noise.volume = data & 0x0F;
                this.noise.envelopeConstant = (data & 0x10) !== 0;
                this.noise.envelopeLoop = (data & 0x20) !== 0;
                this.noise.lengthHalt = (data & 0x20) !== 0;
                break;
            case 0x400E:
                this.noise.timerPeriod = NOISE_PERIODS[data & 0x0F];
                this.noise.modeFlag = (data & 0x80) !== 0;
                break;
            case 0x400F:
                this.noise.lengthCounter = LENGTH_TABLE[(data >> 3) & 0x1F];
                this.noise.envelopeDivider = 1;
                this.noise.envelopeCounter = 15;
                break;
            case 0x4010:
                this.dmc.irqEnable = (data & 0x80) !== 0;
                this.dmc.loop = (data & 0x40) !== 0;
                this.dmc.rateIndex = data & 0x0F;
                this.dmc.timerPeriod = DMC_PERIODS[this.dmc.rateIndex];
                break;
            case 0x4011:
                this.dmc.volume = data & 0x7F;
                break;
            case 0x4012:
                this.dmc.sampleAddress = 0xC000 | (data << 6);
                break;
            case 0x4013:
                this.dmc.sampleLength = (data << 4) | 1;
                break;
            case 0x4015:
                if ((data & 0x01) === 0) this.pulse1.lengthCounter = 0;
                if ((data & 0x02) === 0) this.pulse2.lengthCounter = 0;
                if ((data & 0x04) === 0) this.triangle.lengthCounter = 0;
                if ((data & 0x08) === 0) this.noise.lengthCounter = 0;
                if (data & 0x10) {
                    if (this.dmc.sampleCounter === 0) {
                        this.dmc.sampleCounter = this.dmc.sampleLength;
                        this.dmc.currentByte = 0;
                        this.dmc.bitsRemaining = 0;
                        this.dmc.silence = true;
                    }
                } else {
                    this.dmc.sampleCounter = 0;
                }
                this.frameIrqFlag = false;
                break;
            case 0x4017:
                this.frameCounterMode = (data & 0x80) >> 7;
                this.frameIrqInhibit = (data & 0x40) !== 0;
                this.frameCounter = 0;
                this.frameSequence = 0;
                break;
        }
    }

    clockLengthCounters() {
        if (this.pulse1.lengthCounter > 0 && !this.pulse1.lengthHalt)
            this.pulse1.lengthCounter--;
        if (this.pulse2.lengthCounter > 0 && !this.pulse2.lengthHalt)
            this.pulse2.lengthCounter--;
        if (this.triangle.lengthCounter > 0 && !this.triangle.lengthHalt)
            this.triangle.lengthCounter--;
        if (this.noise.lengthCounter > 0 && !this.noise.lengthHalt)
            this.noise.lengthCounter--;
    }

    clockEnvelope(ch) {
        if (ch.envelopeDivider > 0) {
            ch.envelopeDivider--;
        } else {
            ch.envelopeDivider = ch.envelopeConstant ? 1 : (ch.volume + 1);
            if (ch.envelopeCounter > 0) {
                ch.envelopeCounter--;
            } else if (ch.envelopeLoop) {
                ch.envelopeCounter = 15;
            }
        }
    }

    clockSweep(ch, channel) {
        if (ch.sweepCounter > 0) {
            ch.sweepCounter--;
        } else {
            ch.sweepCounter = ch.sweepPeriod;
            if (ch.sweepEnable && ch.sweepShift > 0) {
                let delta = ch.timerLoad >> ch.sweepShift;
                let target = ch.timerLoad + (ch.sweepNegate ? -delta - (channel === 1 ? 0 : 1) : delta);
                if (target >= 0x800) return;
                if (target < 0x08) return;
                ch.timerLoad = target & 0x7FF;
                ch.timer = ch.timerLoad;
                if (ch.timer < 0x08 || ch.timer > 0x7FF) {
                    ch.sweepMuted = true;
                }
            }
        }
    }

    clockTriangleLinear() {
        if (this.triangle.linearReload) {
            this.triangle.linearCounter = this.triangle.linearLoad;
        } else if (this.triangle.linearCounter > 0) {
            this.triangle.linearCounter--;
        }
        if (!this.triangle.lengthHalt) {
            this.triangle.linearReload = false;
        }
    }

    clockPulse(ch, channel) {
        if (ch.timer > 0) {
            ch.timer--;
        } else {
            ch.timer = ch.timerLoad;
            ch.dutyCounter = (ch.dutyCounter + 1) % 8;
        }
        if (ch.timer < 0x08 || ch.timer > 0x7FF) ch.sweepMuted = true;
    }

    clockTriangle() {
        if (this.triangle.timer > 0) {
            this.triangle.timer--;
        } else {
            this.triangle.timer = this.triangle.timerLoad;
            if (this.triangle.linearCounter > 0 && this.triangle.lengthCounter > 0) {
                this.triangle.sequenceCounter = (this.triangle.sequenceCounter + 1) % 32;
            }
        }
    }

    clockNoise() {
        if (this.noise.timerCounter > 0) {
            this.noise.timerCounter--;
        } else {
            this.noise.timerCounter = this.noise.timerPeriod;
            const bit = this.noise.modeFlag ? 6 : 1;
            const feedback = (this.noise.shiftRegister & 0x01) ^ ((this.noise.shiftRegister >> bit) & 0x01);
            this.noise.shiftRegister = (this.noise.shiftRegister >> 1) | (feedback << 14);
        }
    }

    clockDMC(busReadCallback) {
        if (this.dmc.timerCounter > 0) {
            this.dmc.timerCounter--;
        } else {
            this.dmc.timerCounter = this.dmc.timerPeriod;
            if (this.dmc.bitsRemaining === 0) {
                if (this.dmc.sampleCounter > 0) {
                    this.dmc.sampleCounter--;
                    if (busReadCallback) {
                        this.dmc.currentByte = busReadCallback(this.dmc.sampleAddress);
                        this.dmc.sampleAddress++;
                        if (this.dmc.sampleAddress > 0xFFFF) this.dmc.sampleAddress = 0x8000;
                    }
                    this.dmc.bitsRemaining = 8;
                    this.dmc.silence = false;
                    if (this.dmc.sampleCounter === 0 && this.dmc.loop) {
                        this.dmc.sampleCounter = this.dmc.sampleLength;
                        this.dmc.sampleAddress = 0xC000;
                    }
                    if (this.dmc.sampleCounter === 0 && this.dmc.irqEnable && this.irqCallback) {
                        this.irqCallback();
                    }
                }
            }
            if (this.dmc.bitsRemaining > 0 && !this.dmc.silence) {
                const delta = (this.dmc.currentByte & 0x01) ? 2 : -2;
                const newOutput = this.dmc.output + delta;
                if (newOutput >= 0 && newOutput <= 127) {
                    this.dmc.output = newOutput;
                }
                this.dmc.currentByte >>= 1;
                this.dmc.bitsRemaining--;
            }
        }
    }

    quarterFrame() {
        this.clockEnvelope(this.pulse1);
        this.clockEnvelope(this.pulse2);
        this.clockEnvelope(this.noise);
        this.clockTriangleLinear();
    }

    halfFrame() {
        this.quarterFrame();
        this.clockLengthCounters();
        this.clockSweep(this.pulse1, 1);
        this.clockSweep(this.pulse2, 2);
    }

    pulseSample(ch) {
        if (ch.sweepMuted || ch.lengthCounter === 0) return 0;
        if (DUTY_TABLES[ch.duty][ch.dutyCounter] === 0) return 0;
        return ch.envelopeConstant ? ch.volume : ch.envelopeCounter;
    }

    triangleSample() {
        if (this.triangle.linearCounter === 0 || this.triangle.lengthCounter === 0) return 0;
        return TRIANGLE_TABLE[this.triangle.sequenceCounter];
    }

    noiseSample() {
        if (this.noise.lengthCounter === 0) return 0;
        if (this.noise.shiftRegister & 0x01) return 0;
        return this.noise.envelopeConstant ? this.noise.volume : this.noise.envelopeCounter;
    }

    dmcSample() {
        return this.dmc.output;
    }

    step(cpuCycles, busReadCallback) {
        for (let i = 0; i < cpuCycles; i++) {
            this.cycleCounter++;

            this.clockPulse(this.pulse1, 1);
            this.clockPulse(this.pulse2, 2);
            this.clockTriangle();
            this.clockNoise();
            this.clockDMC(busReadCallback);

            if (this.frameCounterMode === 0) {
                if (this.cycleCounter >= 7457) {
                    this.cycleCounter = 0;
                    if (this.frameSequence === 0 || this.frameSequence === 2) {
                        this.quarterFrame();
                    } else {
                        this.halfFrame();
                    }
                    this.frameSequence++;
                    if (this.frameSequence >= 4) this.frameSequence = 0;
                    if (this.frameSequence === 3 && !this.frameIrqInhibit) {
                        this.frameIrqFlag = true;
                        if (this.irqCallback) this.irqCallback();
                    }
                }
            } else {
                if (this.cycleCounter >= 7457) {
                    this.cycleCounter = 0;
                    if (this.frameSequence < 5) {
                        if (this.frameSequence === 0 || this.frameSequence === 2 || this.frameSequence === 4) {
                            this.quarterFrame();
                        } else {
                            this.halfFrame();
                        }
                        this.frameSequence++;
                        if (this.frameSequence >= 5) this.frameSequence = 0;
                    }
                }
            }

            this.sampleCounter++;
            if (this.sampleCounter >= CYCLES_PER_SAMPLE) {
                this.sampleCounter = 0;
                this.sampleCount++;
            }
        }
    }

    sample() {
        const p1 = this.pulseSample(this.pulse1);
        const p2 = this.pulseSample(this.pulse2);
        const t = this.triangleSample();
        const n = this.noiseSample();
        const d = this.dmcSample();

        const pulseOut = 95.88 / (8128.0 / (p1 + p2 + 0.0001) + 100.0);
        const tndOut = 159.79 / (1.0 / (t / 8227.0 + n / 12241.0 + d / 22638.0 + 0.0001) + 100.0);

        const out = Math.round((pulseOut + tndOut) * 32767.0 * 0.3);
        return Math.max(-32768, Math.min(32767, out));
    }

    saveState() {
        return {
            pulse1: { ...this.pulse1 },
            pulse2: { ...this.pulse2 },
            triangle: { ...this.triangle },
            noise: { ...this.noise },
            dmc: { ...this.dmc },
            frameCounterMode: this.frameCounterMode,
            frameIrqInhibit: this.frameIrqInhibit,
            frameCounter: this.frameCounter,
            frameSequence: this.frameSequence,
            frameIrqFlag: this.frameIrqFlag,
            cycleCounter: this.cycleCounter,
            sampleCounter: this.sampleCounter,
            sampleCount: this.sampleCount
        };
    }

    loadState(state) {
        this.pulse1 = { ...state.pulse1 };
        this.pulse2 = { ...state.pulse2 };
        this.triangle = { ...state.triangle };
        this.noise = { ...state.noise };
        this.dmc = { ...state.dmc };
        this.frameCounterMode = state.frameCounterMode;
        this.frameIrqInhibit = state.frameIrqInhibit;
        this.frameCounter = state.frameCounter;
        this.frameSequence = state.frameSequence;
        this.frameIrqFlag = state.frameIrqFlag;
        this.cycleCounter = state.cycleCounter;
        this.sampleCounter = state.sampleCounter;
        this.sampleCount = state.sampleCount;
    }
}

class CPU {
    constructor() {
        this.pc = 0;
        this.sp = 0xFD;
        this.a = 0;
        this.x = 0;
        this.y = 0;
        this.c = 0;
        this.z = 0;
        this.i = 1;
        this.d = 0;
        this.v = 0;
        this.n = 0;

        this.cycles = 0;
        this.remainingCycles = 0;
        this.readCallback = null;
        this.writeCallback = null;
    }

    reset() {
        this.pc = (this.read(0xFFFC) | (this.read(0xFFFD) << 8)) & 0xFFFF;
        this.sp = 0xFD;
        this.a = 0;
        this.x = 0;
        this.y = 0;
        this.c = 0;
        this.z = 0;
        this.i = 1;
        this.d = 0;
        this.v = 0;
        this.n = 0;
        this.cycles = 0;
    }

    setReadCallback(cb) { this.readCallback = cb; }
    setWriteCallback(cb) { this.writeCallback = cb; }

    read(addr) { return this.readCallback ? this.readCallback(addr & 0xFFFF) : 0; }
    write(addr, data) { if (this.writeCallback) this.writeCallback(addr & 0xFFFF, data & 0xFF); }

    setFlag(flag, val) { this[flag] = val ? 1 : 0; }
    getFlag(flag) { return this[flag] ? 1 : 0; }

    updateZN(val) {
        this.z = (val & 0xFF) === 0 ? 1 : 0;
        this.n = (val & 0x80) ? 1 : 0;
    }

    push(val) { this.write(0x100 + this.sp, val); this.sp = (this.sp - 1) & 0xFF; }
    pop() { this.sp = (this.sp + 1) & 0xFF; return this.read(0x100 + this.sp); }

    nmi() {
        this.push((this.pc >> 8) & 0xFF);
        this.push(this.pc & 0xFF);
        this.push((this.c | (this.z << 1) | (this.i << 2) | (this.d << 3) | (this.v << 6) | (this.n << 7) | 0x30));
        this.i = 1;
        this.pc = (this.read(0xFFFA) | (this.read(0xFFFB) << 8)) & 0xFFFF;
        this.remainingCycles += 7;
    }

    irq() {
        if (this.i === 0) {
            this.push((this.pc >> 8) & 0xFF);
            this.push(this.pc & 0xFF);
            this.push((this.c | (this.z << 1) | (this.i << 2) | (this.d << 3) | (this.v << 6) | (this.n << 7) | 0x30));
            this.i = 1;
            this.pc = (this.read(0xFFFE) | (this.read(0xFFFF) << 8)) & 0xFFFF;
            this.remainingCycles += 7;
        }
    }

    step() {
        if (this.remainingCycles > 0) {
            this.remainingCycles--;
            return 1;
        }

        const opcode = this.read(this.pc);
        this.pc = (this.pc + 1) & 0xFFFF;
        let cycles = this.execute(opcode);
        this.cycles += cycles;
        return cycles;
    }

    execute(opcode) {
        switch (opcode) {
            case 0x00: { let a = this.read(this.pc); this.pc++; this.push((this.pc >> 8) & 0xFF); this.push(this.pc & 0xFF); this.push((this.c | (this.z << 1) | (this.i << 2) | (this.d << 3) | (this.v << 6) | (this.n << 7) | 0x30)); this.i = 1; this.pc = (this.read(0xFFFE) | (this.read(0xFFFF) << 8)) & 0xFFFF; return 7; }
            case 0x01: { let zp = this.read(this.pc); this.pc++; let ea = (zp + this.x) & 0xFF; let lo = this.read(ea); let hi = this.read((ea + 1) & 0xFF); let addr = (hi << 8) | lo; this.a = this.read(addr); this.updateZN(this.a); return 6; }
            case 0x05: { let zp = this.read(this.pc); this.pc++; this.a = this.read(zp); this.updateZN(this.a); return 3; }
            case 0x06: { let zp = this.read(this.pc); this.pc++; let v = this.read(zp); this.setFlag('c', (v & 0x80) !== 0); v = (v << 1) & 0xFF; this.updateZN(v); this.write(zp, v); return 5; }
            case 0x08: { this.push((this.c | (this.z << 1) | (this.i << 2) | (this.d << 3) | (this.v << 6) | (this.n << 7) | 0x30)); return 3; }
            case 0x09: { let v = this.read(this.pc); this.pc++; this.a = this.a | v; this.updateZN(this.a); return 2; }
            case 0x0A: { this.setFlag('c', (this.a & 0x80) !== 0); this.a = (this.a << 1) & 0xFF; this.updateZN(this.a); return 2; }
            case 0x0D: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.a = this.read(addr); this.updateZN(this.a); return 4; }
            case 0x0E: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; let v = this.read(addr); this.setFlag('c', (v & 0x80) !== 0); v = (v << 1) & 0xFF; this.updateZN(v); this.write(addr, v); return 6; }
            case 0x10: { let off = this.read(this.pc); this.pc++; if (off & 0x80) off -= 0x100; if (this.n === 1) { this.pc += off; return 3; } return 2; }
            case 0x11: { let zp = this.read(this.pc); this.pc++; let ea = (zp + this.y) & 0xFF; let lo = this.read(ea); let hi = this.read((ea + 1) & 0xFF); let addr = (hi << 8) | lo; this.a = this.read(addr); this.updateZN(this.a); return 5 + ((((addr & 0xFF) + this.y) & 0xFF) < this.y ? 1 : 0); }
            case 0x15: { let zp = this.read(this.pc); this.pc++; this.a = this.read((zp + this.x) & 0xFF); this.updateZN(this.a); return 4; }
            case 0x16: { let zp = this.read(this.pc); this.pc++; let v = this.read((zp + this.x) & 0xFF); this.setFlag('c', (v & 0x80) !== 0); v = (v << 1) & 0xFF; this.updateZN(v); this.write((zp + this.x) & 0xFF, v); return 6; }
            case 0x18: { this.c = 0; return 2; }
            case 0x19: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.a = this.read(addr + this.y); this.updateZN(this.a); return 4 + ((((addr & 0xFF) + this.y) & 0xFF) < this.y ? 1 : 0); }
            case 0x1D: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.a = this.read(addr + this.x); this.updateZN(this.a); return 4 + ((((addr & 0xFF) + this.x) & 0xFF) < this.x ? 1 : 0); }
            case 0x20: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.push(((this.pc - 1) >> 8) & 0xFF); this.push((this.pc - 1) & 0xFF); this.pc = addr; return 6; }
            case 0x21: { let zp = this.read(this.pc); this.pc++; let ea = (zp + this.x) & 0xFF; let lo = this.read(ea); let hi = this.read((ea + 1) & 0xFF); let addr = (hi << 8) | lo; this.a = this.a & this.read(addr); this.updateZN(this.a); return 6; }
            case 0x24: { let zp = this.read(this.pc); this.pc++; let v = this.read(zp); this.setFlag('z', (this.a & v) === 0); this.setFlag('n', (v & 0x80) !== 0); this.setFlag('v', (v & 0x40) !== 0); return 3; }
            case 0x28: { let p = this.pop(); this.c = (p >> 0) & 1; this.z = (p >> 1) & 1; this.i = (p >> 2) & 1; this.d = (p >> 3) & 1; this.v = (p >> 6) & 1; this.n = (p >> 7) & 1; return 4; }
            case 0x29: { let v = this.read(this.pc); this.pc++; this.a = this.a & v; this.updateZN(this.a); return 2; }
            case 0x2C: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; let v = this.read(addr); this.setFlag('z', (this.a & v) === 0); this.setFlag('n', (v & 0x80) !== 0); this.setFlag('v', (v & 0x40) !== 0); return 4; }
            case 0x30: { let off = this.read(this.pc); this.pc++; if (off & 0x80) off -= 0x100; if (this.n === 1) { this.pc += off; return 4; } return 2; }
            case 0x35: { let zp = this.read(this.pc); this.pc++; this.a = this.read((zp + this.x) & 0xFF) & this.a; this.updateZN(this.a); return 4; }
            case 0x38: { this.c = 1; return 2; }
            case 0x3D: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.a = this.read(addr + this.x) & this.a; this.updateZN(this.a); return 4 + ((((addr & 0xFF) + this.x) & 0xFF) < this.x ? 1 : 0); }
            case 0x40: { let p = this.pop(); this.c = (p >> 0) & 1; this.z = (p >> 1) & 1; this.i = (p >> 2) & 1; this.d = (p >> 3) & 1; this.v = (p >> 6) & 1; this.n = (p >> 7) & 1; let lo = this.pop(); let hi = this.pop(); this.pc = (hi << 8) | lo; return 6; }
            case 0x48: { this.push(this.a); return 3; }
            case 0x49: { let v = this.read(this.pc); this.pc++; this.a = this.a ^ v; this.updateZN(this.a); return 2; }
            case 0x4A: { this.setFlag('c', (this.a & 0x01) !== 0); this.a = this.a >> 1; this.updateZN(this.a); return 2; }
            case 0x4C: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; this.pc = (hi << 8) | lo; return 3; }
            case 0x50: { let off = this.read(this.pc); this.pc++; if (off & 0x80) off -= 0x100; if (this.v === 0) { this.pc += off; return 4; } return 2; }
            case 0x58: { this.i = 0; return 2; }
            case 0x60: { let lo = this.pop(); let hi = this.pop(); this.pc = ((hi << 8) | lo) + 1; return 6; }
            case 0x68: { this.a = this.pop(); this.updateZN(this.a); return 4; }
            case 0x69: { let v = this.read(this.pc); this.pc++; let r = this.a + v + this.c; this.setFlag('c', r > 0xFF); this.a = r & 0xFF; this.setFlag('v', ((this.a ^ v) & (this.a ^ r) & 0x80) !== 0); this.updateZN(this.a); return 2; }
            case 0x6A: { let c = this.c; this.setFlag('c', (this.a & 0x01) !== 0); this.a = (this.a >> 1) | (c << 7); this.updateZN(this.a); return 2; }
            case 0x6C: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; let l2 = this.read(addr); let h2 = this.read((addr & 0xFF00) | ((addr + 1) & 0xFF)); this.pc = (h2 << 8) | l2; return 5; }
            case 0x70: { let off = this.read(this.pc); this.pc++; if (off & 0x80) off -= 0x100; if (this.v === 1) { this.pc += off; return 4; } return 2; }
            case 0x78: { this.i = 1; return 2; }
            case 0x81: { let zp = this.read(this.pc); this.pc++; let ea = (zp + this.x) & 0xFF; let lo = this.read(ea); let hi = this.read((ea + 1) & 0xFF); let addr = (hi << 8) | lo; this.write(addr, this.a); return 6; }
            case 0x84: { let zp = this.read(this.pc); this.pc++; this.write(zp, this.y); return 3; }
            case 0x85: { let zp = this.read(this.pc); this.pc++; this.write(zp, this.a); return 3; }
            case 0x86: { let zp = this.read(this.pc); this.pc++; this.write(zp, this.x); return 3; }
            case 0x88: { this.y = (this.y - 1) & 0xFF; this.updateZN(this.y); return 2; }
            case 0x8A: { this.a = this.x; this.updateZN(this.a); return 2; }
            case 0x8C: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.write(addr, this.y); return 4; }
            case 0x8D: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.write(addr, this.a); return 4; }
            case 0x8E: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.write(addr, this.x); return 4; }
            case 0x90: { let off = this.read(this.pc); this.pc++; if (off & 0x80) off -= 0x100; if (this.c === 0) { this.pc += off; return 4; } return 2; }
            case 0x91: { let zp = this.read(this.pc); this.pc++; let ea = zp; let lo = this.read(ea); let hi = this.read((ea + 1) & 0xFF); let addr = (hi << 8) | lo; this.write(addr + this.y, this.a); return 6; }
            case 0x94: { let zp = this.read(this.pc); this.pc++; this.write((zp + this.x) & 0xFF, this.y); return 4; }
            case 0x95: { let zp = this.read(this.pc); this.pc++; this.write((zp + this.x) & 0xFF, this.a); return 4; }
            case 0x96: { let zp = this.read(this.pc); this.pc++; this.write((zp + this.y) & 0xFF, this.x); return 4; }
            case 0x98: { this.a = this.y; this.updateZN(this.a); return 2; }
            case 0x99: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.write(addr + this.y, this.a); return 5; }
            case 0x9A: { this.sp = this.x; return 2; }
            case 0x9D: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.write(addr + this.x, this.a); return 5; }
            case 0xA0: { let v = this.read(this.pc); this.pc++; this.y = v; this.updateZN(this.y); return 2; }
            case 0xA1: { let zp = this.read(this.pc); this.pc++; let ea = (zp + this.x) & 0xFF; let lo = this.read(ea); let hi = this.read((ea + 1) & 0xFF); let addr = (hi << 8) | lo; this.a = this.read(addr); this.updateZN(this.a); return 6; }
            case 0xA2: { let v = this.read(this.pc); this.pc++; this.x = v; this.updateZN(this.x); return 2; }
            case 0xA4: { let zp = this.read(this.pc); this.pc++; this.y = this.read(zp); this.updateZN(this.y); return 3; }
            case 0xA5: { let zp = this.read(this.pc); this.pc++; this.a = this.read(zp); this.updateZN(this.a); return 3; }
            case 0xA6: { let zp = this.read(this.pc); this.pc++; this.x = this.read(zp); this.updateZN(this.x); return 3; }
            case 0xA8: { this.y = this.a; this.updateZN(this.y); return 2; }
            case 0xA9: { let v = this.read(this.pc); this.pc++; this.a = v; this.updateZN(this.a); return 2; }
            case 0xAA: { this.x = this.a; this.updateZN(this.x); return 2; }
            case 0xAC: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.y = this.read(addr); this.updateZN(this.y); return 4; }
            case 0xAD: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.a = this.read(addr); this.updateZN(this.a); return 4; }
            case 0xAE: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.x = this.read(addr); this.updateZN(this.x); return 4; }
            case 0xB0: { let off = this.read(this.pc); this.pc++; if (off & 0x80) off -= 0x100; if (this.c === 1) { this.pc += off; return 4; } return 2; }
            case 0xB1: { let zp = this.read(this.pc); this.pc++; let ea = zp; let lo = this.read(ea); let hi = this.read((ea + 1) & 0xFF); let addr = (hi << 8) | lo; this.a = this.read(addr + this.y); this.updateZN(this.a); return 5 + ((((addr & 0xFF) + this.y) & 0xFF) < this.y ? 1 : 0); }
            case 0xB4: { let zp = this.read(this.pc); this.pc++; this.y = this.read((zp + this.x) & 0xFF); this.updateZN(this.y); return 4; }
            case 0xB5: { let zp = this.read(this.pc); this.pc++; this.a = this.read((zp + this.x) & 0xFF); this.updateZN(this.a); return 4; }
            case 0xB6: { let zp = this.read(this.pc); this.pc++; this.x = this.read((zp + this.y) & 0xFF); this.updateZN(this.x); return 4; }
            case 0xBA: { this.x = this.sp; return 2; }
            case 0xBC: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.y = this.read(addr + this.x); this.updateZN(this.y); return 4 + ((((addr & 0xFF) + this.x) & 0xFF) < this.x ? 1 : 0); }
            case 0xBD: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.a = this.read(addr + this.x); this.updateZN(this.a); return 4 + ((((addr & 0xFF) + this.x) & 0xFF) < this.x ? 1 : 0); }
            case 0xBE: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; this.x = this.read(addr + this.y); this.updateZN(this.x); return 4 + ((((addr & 0xFF) + this.y) & 0xFF) < this.y ? 1 : 0); }
            case 0xC0: { let v = this.read(this.pc); this.pc++; let r = this.y - v; this.setFlag('c', this.y >= v); this.updateZN(r & 0xFF); return 2; }
            case 0xC1: { let zp = this.read(this.pc); this.pc++; let ea = (zp + this.x) & 0xFF; let lo = this.read(ea); let hi = this.read((ea + 1) & 0xFF); let addr = (hi << 8) | lo; let r = this.a - this.read(addr); this.setFlag('c', this.a >= this.read(addr)); this.updateZN(r & 0xFF); return 6; }
            case 0xC4: { let zp = this.read(this.pc); this.pc++; let v = this.read(zp); let r = this.y - v; this.setFlag('c', this.y >= v); this.updateZN(r & 0xFF); return 3; }
            case 0xC5: { let zp = this.read(this.pc); this.pc++; let v = this.read(zp); let r = this.a - v; this.setFlag('c', this.a >= v); this.updateZN(r & 0xFF); return 3; }
            case 0xC6: { let zp = this.read(this.pc); this.pc++; let v = this.read(zp); v = (v - 1) & 0xFF; this.updateZN(v); this.write(zp, v); return 5; }
            case 0xC8: { this.y = (this.y + 1) & 0xFF; this.updateZN(this.y); return 2; }
            case 0xC9: { let v = this.read(this.pc); this.pc++; let r = this.a - v; this.setFlag('c', this.a >= v); this.updateZN(r & 0xFF); return 2; }
            case 0xCA: { this.x = (this.x - 1) & 0xFF; this.updateZN(this.x); return 2; }
            case 0xCC: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; let v = this.read(addr); let r = this.y - v; this.setFlag('c', this.y >= v); this.updateZN(r & 0xFF); return 4; }
            case 0xCD: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; let v = this.read(addr); let r = this.a - v; this.setFlag('c', this.a >= v); this.updateZN(r & 0xFF); return 4; }
            case 0xCE: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; let v = this.read(addr); v = (v - 1) & 0xFF; this.updateZN(v); this.write(addr, v); return 6; }
            case 0xD0: { let off = this.read(this.pc); this.pc++; if (off & 0x80) off -= 0x100; if (this.z === 0) { this.pc += off; return 4; } return 2; }
            case 0xD1: { let zp = this.read(this.pc); this.pc++; let ea = zp; let lo = this.read(ea); let hi = this.read((ea + 1) & 0xFF); let addr = (hi << 8) | lo; let r = this.a - this.read(addr + this.y); this.setFlag('c', this.a >= this.read(addr + this.y)); this.updateZN(r & 0xFF); return 5 + ((((addr & 0xFF) + this.y) & 0xFF) < this.y ? 1 : 0); }
            case 0xD5: { let zp = this.read(this.pc); this.pc++; let v = this.read((zp + this.x) & 0xFF); let r = this.a - v; this.setFlag('c', this.a >= v); this.updateZN(r & 0xFF); return 4; }
            case 0xD6: { let zp = this.read(this.pc); this.pc++; let v = this.read((zp + this.x) & 0xFF); v = (v - 1) & 0xFF; this.updateZN(v); this.write((zp + this.x) & 0xFF, v); return 6; }
            case 0xD8: { this.d = 0; return 2; }
            case 0xD9: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; let v = this.read(addr + this.y); let r = this.a - v; this.setFlag('c', this.a >= v); this.updateZN(r & 0xFF); return 4 + ((((addr & 0xFF) + this.y) & 0xFF) < this.y ? 1 : 0); }
            case 0xDD: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; let v = this.read(addr + this.x); let r = this.a - v; this.setFlag('c', this.a >= v); this.updateZN(r & 0xFF); return 4 + ((((addr & 0xFF) + this.x) & 0xFF) < this.x ? 1 : 0); }
            case 0xE0: { let v = this.read(this.pc); this.pc++; let r = this.x - v; this.setFlag('c', this.x >= v); this.updateZN(r & 0xFF); return 2; }
            case 0xE1: { let zp = this.read(this.pc); this.pc++; let ea = (zp + this.x) & 0xFF; let lo = this.read(ea); let hi = this.read((ea + 1) & 0xFF); let addr = (hi << 8) | lo; let v = this.read(addr); let r = this.a - v; this.setFlag('c', this.a >= v); this.updateZN(r & 0xFF); return 6; }
            case 0xE4: { let zp = this.read(this.pc); this.pc++; let v = this.read(zp); let r = this.x - v; this.setFlag('c', this.x >= v); this.updateZN(r & 0xFF); return 3; }
            case 0xE5: { let zp = this.read(this.pc); this.pc++; let v = this.read(zp); let r = this.a - v - this.c; this.setFlag('c', this.a >= v + this.c); this.updateZN(r & 0xFF); return 3; }
            case 0xE6: { let zp = this.read(this.pc); this.pc++; let v = this.read(zp); v = (v + 1) & 0xFF; this.updateZN(v); this.write(zp, v); return 5; }
            case 0xE8: { this.x = (this.x + 1) & 0xFF; this.updateZN(this.x); return 2; }
            case 0xE9: { let v = this.read(this.pc); this.pc++; let r = this.a - v - this.c; this.setFlag('c', this.a >= v + this.c); this.updateZN(r & 0xFF); return 2; }
            case 0xEA: { return 2; }
            case 0xEC: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; let v = this.read(addr); let r = this.x - v; this.setFlag('c', this.x >= v); this.updateZN(r & 0xFF); return 4; }
            case 0xED: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; let v = this.read(addr); let r = this.a - v - this.c; this.setFlag('c', this.a >= v + this.c); this.updateZN(r & 0xFF); return 4; }
            case 0xEE: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; let v = this.read(addr); v = (v + 1) & 0xFF; this.updateZN(v); this.write(addr, v); return 6; }
            case 0xF0: { let off = this.read(this.pc); this.pc++; if (off & 0x80) off -= 0x100; if (this.z === 1) { this.pc += off; return 4; } return 2; }
            case 0xF1: { let zp = this.read(this.pc); this.pc++; let ea = zp; let lo = this.read(ea); let hi = this.read((ea + 1) & 0xFF); let addr = (hi << 8) | lo; let r = this.a - this.read(addr + this.y) - this.c; this.setFlag('c', this.a >= this.read(addr + this.y) + this.c); this.updateZN(r & 0xFF); return 5 + ((((addr & 0xFF) + this.y) & 0xFF) < this.y ? 1 : 0); }
            case 0xF5: { let zp = this.read(this.pc); this.pc++; let v = this.read((zp + this.x) & 0xFF); let r = this.a - v - this.c; this.setFlag('c', this.a >= v + this.c); this.updateZN(r & 0xFF); return 4; }
            case 0xF6: { let zp = this.read(this.pc); this.pc++; let v = this.read((zp + this.x) & 0xFF); v = (v + 1) & 0xFF; this.updateZN(v); this.write((zp + this.x) & 0xFF, v); return 6; }
            case 0xF8: { this.d = 1; return 2; }
            case 0xF9: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; let v = this.read(addr + this.y); let r = this.a - v - this.c; this.setFlag('c', this.a >= v + this.c); this.updateZN(r & 0xFF); return 4 + ((((addr & 0xFF) + this.y) & 0xFF) < this.y ? 1 : 0); }
            case 0xFD: { let lo = this.read(this.pc); this.pc++; let hi = this.read(this.pc); this.pc++; let addr = (hi << 8) | lo; let v = this.read(addr + this.x); let r = this.a - v - this.c; this.setFlag('c', this.a >= v + this.c); this.updateZN(r & 0xFF); return 4 + ((((addr & 0xFF) + this.x) & 0xFF) < this.x ? 1 : 0); }
            default: { this.pc = (this.pc - 1) & 0xFFFF; return 1; }
        }
    }

    saveState() {
        return {
            pc: this.pc,
            sp: this.sp,
            a: this.a,
            x: this.x,
            y: this.y,
            c: this.c,
            z: this.z,
            i: this.i,
            d: this.d,
            v: this.v,
            n: this.n,
            cycles: this.cycles,
            remainingCycles: this.remainingCycles
        };
    }

    loadState(state) {
        this.pc = state.pc;
        this.sp = state.sp;
        this.a = state.a;
        this.x = state.x;
        this.y = state.y;
        this.c = state.c;
        this.z = state.z;
        this.i = state.i;
        this.d = state.d;
        this.v = state.v;
        this.n = state.n;
        this.cycles = state.cycles;
        this.remainingCycles = state.remainingCycles;
    }
}

class PPU {
    constructor() {
        this.SCREEN_WIDTH = 256;
        this.SCREEN_HEIGHT = 240;
        this.frameBuffer = new Uint32Array(256 * 240);
        this.registers = new Uint8Array(8);
        this.v = 0;
        this.t = 0;
        this.x = 0;
        this.w = 0;
        this.fineY = 0;
        this.cycle = 0;
        this.scanline = 0;
        this.frameComplete = false;
        this.nmiCallback = null;
        this.readCallback = null;
        this.writeCallback = null;
        this.buffer = 0;
        this.mirroring = 0;
        this.nameTable = new Uint8Array(0x1000);
        this.palette = new Uint8Array(32);
        this.oam = new Uint8Array(256);
        this.oamAddr = 0;

        this.ntByte = 0;
        this.atByte = 0;
        this.bgLow = 0;
        this.bgHigh = 0;
        this.bgShiftLo = 0;
        this.bgShiftHi = 0;
        this.bgAttrShiftLo = 0;
        this.bgAttrShiftHi = 0;

        this.sprites = new Array(8).fill(0).map(() => ({ y: 0, tile: 0, attr: 0, x: 0, pattern: 0, active: false }));
        this.spriteCount = 0;
        this.spriteZeroHit = false;
    }

    reset() {
        this.frameBuffer.fill(0);
        this.registers.fill(0);
        this.v = 0;
        this.t = 0;
        this.x = 0;
        this.w = 0;
        this.fineY = 0;
        this.cycle = 0;
        this.scanline = 0;
        this.frameComplete = false;
        this.buffer = 0;
        this.nameTable.fill(0);
        this.palette.fill(0);
        this.oam.fill(0);
        this.oamAddr = 0;
        this.bgShiftLo = 0;
        this.bgShiftHi = 0;
        this.bgAttrShiftLo = 0;
        this.bgAttrShiftHi = 0;
        this.spriteZeroHit = false;
    }

    setNmiCallback(cb) { this.nmiCallback = cb; }
    setReadCallback(cb) { this.readCallback = cb; }
    setWriteCallback(cb) { this.writeCallback = cb; }
    setMirroring(m) { this.mirroring = m; }

    mirrorAddr(addr) {
        const table = (addr >> 10) & 3;
        const offset = addr & 0x3FF;
        let t;
        switch (this.mirroring) {
            case 0: t = table & 1; break;
            case 1: t = (table >> 1) & 1; break;
            case 2: t = 0; break;
            case 3: t = table; break;
            default: t = 0;
        }
        return 0x2000 | (t << 10) | offset;
    }

    read(addr) { return this.readCallback ? this.readCallback(addr) : 0; }
    write(addr, data) { if (this.writeCallback) this.writeCallback(addr, data); }

    readRegister(addr) {
        let data = 0;
        switch (addr & 7) {
            case 2:
                data = (this.registers[2] & 0xE0) | ((this.v >> 12) & 0x1F);
                this.w = 0;
                break;
            case 4:
                data = this.oam[this.oamAddr];
                break;
            case 7:
                if (this.v < 0x3F00) {
                    data = this.buffer;
                    this.buffer = this.ppuRead(this.v);
                } else {
                    data = this.ppuRead(this.v);
                    this.buffer = this.ppuRead(this.v & 0x2FFF);
                }
                if ((this.registers[0] & 0x04) !== 0) {
                    this.v += 32;
                } else {
                    this.v += 1;
                }
                this.v &= 0x7FFF;
                break;
            default: data = this.registers[addr & 7]; break;
        }
        return data;
    }

    writeRegister(addr, data) {
        this.registers[addr & 7] = data;
        switch (addr & 7) {
            case 0:
                this.t = (this.t & 0xF3FF) | (((data & 0x03) << 10));
                break;
            case 1:
                break;
            case 3:
                this.oamAddr = data;
                break;
            case 4:
                this.oam[this.oamAddr++] = data;
                break;
            case 5:
                if (this.w === 0) {
                    this.t = (this.t & 0xFFE0) | (data >> 3);
                    this.x = data & 0x07;
                    this.w = 1;
                } else {
                    this.t = (this.t & 0x8FFF) | ((data & 0x07) << 12);
                    this.t = (this.t & 0xFC1F) | ((data & 0xF8) << 2);
                    this.w = 0;
                }
                break;
            case 6:
                if (this.w === 0) {
                    this.t = (this.t & 0x00FF) | ((data & 0x3F) << 8);
                    this.w = 1;
                } else {
                    this.t = (this.t & 0xFF00) | data;
                    this.v = this.t;
                    this.w = 0;
                    this.fineY = (this.v >> 12) & 7;
                }
                break;
            case 7:
                this.ppuWrite(this.v, data);
                if ((this.registers[0] & 0x04) !== 0) {
                    this.v += 32;
                } else {
                    this.v += 1;
                }
                this.v &= 0x7FFF;
                break;
        }
    }

    ppuRead(addr) {
        addr &= 0x3FFF;
        if (addr < 0x2000) return this.read(addr);
        if (addr < 0x3F00) return this.nameTable[this.mirrorAddr(addr) & 0xFFF];
        if (addr < 0x4000) {
            if ((addr & 0x13) === 0x10) addr -= 0x10;
            return this.palette[addr & 0x1F];
        }
        return 0;
    }

    ppuWrite(addr, data) {
        addr &= 0x3FFF;
        if (addr < 0x2000) { this.write(addr, data); return; }
        if (addr < 0x3F00) { this.nameTable[this.mirrorAddr(addr) & 0xFFF] = data; return; }
        if (addr < 0x4000) {
            if ((addr & 0x13) === 0x10) addr -= 0x10;
            this.palette[addr & 0x1F] = data;
            return;
        }
    }

    frame_buffer() { return this.frameBuffer; }
    frame_complete() { return this.frameComplete; }

    step() {
        if (this.frameComplete) {
            this.frameComplete = false;
        }

        const visible = this.scanline < 240 && this.cycle >= 1 && this.cycle <= 256;
        const preRender = this.scanline === 261;

        if (visible) {
            const pixelX = this.cycle - 1;
            const pixelY = this.scanline;

            let bgPixel = 0;
            let bgPalette = 0;
            if ((this.registers[1] & 0x08) !== 0) {
                const bit = 15 - this.x;
                const p0 = (this.bgShiftLo >> bit) & 1;
                const p1 = (this.bgShiftHi >> bit) & 1;
                bgPixel = (p1 << 1) | p0;
                const a0 = (this.bgAttrShiftLo >> (bit >> 2)) & 1;
                const a1 = (this.bgAttrShiftHi >> (bit >> 2)) & 1;
                bgPalette = (a1 << 1) | a0;
            }

            let sprPixel = 0;
            let sprPalette = 0;
            let sprPriority = 0;
            let sprZero = false;
            if ((this.registers[1] & 0x10) !== 0) {
                for (let i = 0; i < this.spriteCount; i++) {
                    const s = this.sprites[i];
                    if (pixelX >= s.x && pixelX < s.x + 8) {
                        const off = 7 - (pixelX - s.x);
                        const p0 = (s.pattern >> (off + 8)) & 1;
                        const p1 = (s.pattern >> off) & 1;
                        const p = (p1 << 1) | p0;
                        if (p !== 0) {
                            sprPixel = p;
                            sprPalette = (s.attr & 0x03) + 4;
                            sprPriority = (s.attr >> 5) & 1;
                            sprZero = i === 0;
                            break;
                        }
                    }
                }
            }

            let finalPixel = 0;
            if (bgPixel === 0 && sprPixel === 0) {
                finalPixel = this.ppuRead(0x3F00);
            } else if (bgPixel === 0) {
                finalPixel = this.ppuRead(0x3F00 | sprPalette << 2 | sprPixel);
            } else if (sprPixel === 0 || sprPriority === 1) {
                finalPixel = this.ppuRead(0x3F00 | bgPalette << 2 | bgPixel);
            } else {
                finalPixel = this.ppuRead(0x3F00 | sprPalette << 2 | sprPixel);
                if (sprZero && bgPixel !== 0 && pixelX >= 1 && pixelX < 255 && (this.registers[2] & 0x40) === 0) {
                    this.spriteZeroHit = true;
                    this.registers[2] |= 0x40;
                }
            }

            const rgb = [this.NES_PALETTE[finalPixel * 3], this.NES_PALETTE[finalPixel * 3 + 1], this.NES_PALETTE[finalPixel * 3 + 2]];
            const idx = pixelY * 256 + pixelX;
            this.frameBuffer[idx] = 0xFF000000 | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0];
        }

        if (this.scanline < 240 || preRender) {
            if (this.cycle >= 280 && this.cycle <= 304 && (preRender || this.scanline < 240)) {
                this.v = (this.v & 0xFBE0) | (this.t & 0x041F);
            }

            if (this.cycle === 257 && this.scanline < 240) {
                this.v = (this.v & 0x841F) | (this.t & 0x7BE0);
            }

            if (this.cycle === 256 || (this.cycle > 320 && this.cycle < 337)) {
                this.bgShiftLo = (this.bgShiftLo << 8) | this.bgLow;
                this.bgShiftHi = (this.bgShiftHi << 8) | this.bgHigh;
                this.bgAttrShiftLo = (this.bgAttrShiftLo << 8) | ((this.atByte & 1) ? 0xFF : 0x00);
                this.bgAttrShiftHi = (this.bgAttrShiftHi << 8) | ((this.atByte & 2) ? 0xFF : 0x00);
            }

            const fetchCycle = (this.cycle - 1) & 0x07;
            if (fetchCycle === 0 && this.cycle <= 256) {
                const ntAddr = 0x2000 | (this.v & 0x0FFF);
                this.ntByte = this.ppuRead(ntAddr);
            } else if (fetchCycle === 2 && this.cycle <= 256) {
                const atAddr = 0x23C0 | (this.v & 0x0C00) | ((this.v >> 4) & 0x38) | ((this.v >> 2) & 0x07);
                this.atByte = this.ppuRead(atAddr);
                const shift = ((this.v >> 4) & 4) | (this.v & 2);
                this.atByte = (this.atByte >> shift) & 3;
            } else if (fetchCycle === 4 && this.cycle <= 256) {
                const table = (this.registers[0] & 0x10) << 8;
                const fineY = (this.v >> 12) & 7;
                const tile = this.ntByte;
                const addr = table | (tile << 4) | fineY;
                this.bgLow = this.ppuRead(addr);
            } else if (fetchCycle === 6 && this.cycle <= 256) {
                const table = (this.registers[0] & 0x10) << 8;
                const fineY = (this.v >> 12) & 7;
                const tile = this.ntByte;
                const addr = table | (tile << 4) | fineY | 8;
                this.bgHigh = this.ppuRead(addr);
            } else if (fetchCycle === 7 && this.cycle <= 256) {
                let v = this.v;
                if ((v & 0x001F) === 31) {
                    v = (v & 0xFFE0) | 0;
                    v ^= 0x0400;
                } else {
                    v += 1;
                }
                this.v = v;
            }

            if (this.cycle === 257 && this.scanline < 240) {
                this.spriteCount = 0;
                const y = this.scanline + 1;
                const sprHeight = (this.registers[0] & 0x20) ? 16 : 8;
                for (let i = 0; i < 64 && this.spriteCount < 8; i++) {
                    const o = i * 4;
                    const sy = this.oam[o];
                    if (y >= sy && y < sy + sprHeight) {
                        const s = this.sprites[this.spriteCount];
                        s.y = sy;
                        s.tile = this.oam[o + 1];
                        s.attr = this.oam[o + 2];
                        s.x = this.oam[o + 3];
                        s.active = true;

                        const table = (this.registers[0] & 0x20) ? ((s.tile & 1) << 12) : ((this.registers[0] & 0x08) << 9);
                        let tile = (this.registers[0] & 0x20) ? (s.tile & 0xFE) : s.tile;
                        let row = y - sy;
                        if (s.attr & 0x80) row = sprHeight - 1 - row;
                        const a = this.ppuRead(table | (tile << 4) | row);
                        const b = this.ppuRead(table | (tile << 4) | row | 8);
                        s.pattern = 0;
                        for (let bit = 0; bit < 8; bit++) {
                            const shift = (s.attr & 0x40) ? bit : 7 - bit;
                            const p0 = (a >> shift) & 1;
                            const p1 = (b >> shift) & 1;
                            s.pattern |= (p1 << 1 | p0) << (bit * 2);
                        }
                        this.spriteCount++;
                    }
                }
            }
        }

        if (preRender && this.cycle === 1) {
            this.registers[2] &= ~0x40;
            this.spriteZeroHit = false;
            this.frameComplete = false;
        }

        if (this.scanline === 241 && this.cycle === 1) {
            this.registers[2] |= 0x80;
            if ((this.registers[0] & 0x80) !== 0 && this.nmiCallback) {
                this.nmiCallback();
            }
            this.frameComplete = true;
        }

        if (preRender && this.cycle === 339 && (this.registers[0] & 0x80) !== 0) {
            this.registers[2] &= ~0x80;
        }

        this.cycle++;
        if (this.cycle > 340) {
            this.cycle = 0;
            this.scanline++;
            if (this.scanline > 261) {
                this.scanline = 0;
                if ((this.v & 0x7000) !== 0x7000) {
                    this.v += 0x1000;
                } else {
                    this.v = (this.v & 0x8FFF);
                    let v = this.v & 0x03E0;
                    if (v === 0x03A0) {
                        v = 0;
                        this.v ^= 0x0800;
                    } else if (v === 0x03E0) {
                        v = 0;
                    } else {
                        v += 0x0020;
                    }
                    this.v = (this.v & 0xFC1F) | v;
                }
            }
        }
    }

    saveState() {
        return {
            scanline: this.scanline,
            cycle: this.cycle,
            frameComplete: this.frameComplete,
            vram: Array.from(this.nameTable),
            oam: Array.from(this.oam),
            palette: Array.from(this.palette),
            mirroring: this.mirroring,
            ctrl: this.registers[0],
            mask: this.registers[1],
            status: this.registers[2],
            oamAddr: this.oamAddr,
            dataBuffer: this.buffer,
            v: this.v,
            t: this.t,
            fineX: this.x,
            writeLatch: this.w,
            fineY: this.fineY,
            ntData: this.ntByte,
            atData: this.atByte,
            ptLow: this.bgLow,
            ptHigh: this.bgHigh,
            shiftPtLow: this.bgShiftLo,
            shiftPtHigh: this.bgShiftHi,
            shiftAtLow: this.bgAttrShiftLo,
            shiftAtHigh: this.bgAttrShiftHi,
            spriteCount: this.spriteCount,
            spriteZeroHit: this.spriteZeroHit,
            sprites: this.sprites.map(s => ({ ...s }))
        };
    }

    loadState(state) {
        this.scanline = state.scanline;
        this.cycle = state.cycle;
        this.frameComplete = state.frameComplete;
        this.nameTable = new Uint8Array(state.vram);
        this.oam = new Uint8Array(state.oam);
        this.palette = new Uint8Array(state.palette);
        this.mirroring = state.mirroring;
        this.registers[0] = state.ctrl;
        this.registers[1] = state.mask;
        this.registers[2] = state.status;
        this.oamAddr = state.oamAddr;
        this.buffer = state.dataBuffer;
        this.v = state.v;
        this.t = state.t;
        this.x = state.fineX;
        this.w = state.writeLatch;
        this.fineY = state.fineY;
        this.ntByte = state.ntData;
        this.atByte = state.atData;
        this.bgLow = state.ptLow;
        this.bgHigh = state.ptHigh;
        this.bgShiftLo = state.shiftPtLow;
        this.bgShiftHi = state.shiftPtHigh;
        this.bgAttrShiftLo = state.shiftAtLow;
        this.bgAttrShiftHi = state.shiftAtHigh;
        this.spriteCount = state.spriteCount;
        this.spriteZeroHit = state.spriteZeroHit;
        this.sprites = state.sprites.map(s => ({ ...s }));
    }
}

PPU.prototype.NES_PALETTE = new Uint8Array([
    0x54, 0x54, 0x54, 0x00, 0x1E, 0x74, 0x08, 0x10, 0x90, 0x30, 0x00, 0x88,
    0x44, 0x00, 0x64, 0x5C, 0x00, 0x30, 0x54, 0x04, 0x00, 0x3C, 0x18, 0x00,
    0x20, 0x2A, 0x00, 0x08, 0x3A, 0x00, 0x00, 0x40, 0x00, 0x00, 0x3C, 0x00,
    0x00, 0x32, 0x3C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x98, 0x96, 0x98, 0x08, 0x4C, 0xC4, 0x30, 0x32, 0xEC, 0x5C, 0x1E, 0xE4,
    0x88, 0x14, 0xB0, 0xA0, 0x14, 0x64, 0x98, 0x22, 0x20, 0x78, 0x3C, 0x00,
    0x54, 0x5A, 0x00, 0x28, 0x72, 0x00, 0x08, 0x7C, 0x00, 0x00, 0x76, 0x28,
    0x00, 0x66, 0x78, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0xEC, 0xEE, 0xEC, 0x4C, 0x9A, 0xEC, 0x78, 0x7C, 0xEC, 0xB0, 0x62, 0xEC,
    0xE4, 0x54, 0xEC, 0xEC, 0x48, 0xB4, 0xEC, 0x6A, 0x64, 0xD4, 0x88, 0x20,
    0x9C, 0xAA, 0x00, 0x6C, 0xC4, 0x00, 0x42, 0xD2, 0x40, 0x2A, 0xCC, 0x90,
    0x30, 0xB2, 0xCC, 0x3C, 0x3C, 0x3C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0xEC, 0xEE, 0xEC, 0xA8, 0xCC, 0xEC, 0xBC, 0xBC, 0xEC, 0xD4, 0xB2, 0xEC,
    0xEC, 0xAE, 0xEC, 0xEC, 0xAE, 0xD4, 0xEC, 0xB4, 0xB0, 0xE4, 0xC4, 0x90,
    0xD4, 0xCC, 0x78, 0xB8, 0xD8, 0x78, 0xA8, 0xE0, 0x90, 0xA0, 0xE2, 0xB8,
    0x88, 0xD8, 0xD8, 0x90, 0x90, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

class Controller {
    constructor() {
        this.buttons = new Array(8).fill(false);
        this.index = 0;
        this.strobe = 0;
    }

    reset() {
        this.buttons.fill(false);
        this.index = 0;
        this.strobe = 0;
    }

    setButton(idx, val) {
        this.buttons[idx] = !!val;
    }

    write(data) {
        this.strobe = data & 1;
        if (this.strobe) this.index = 0;
    }

    read() {
        let val = 0;
        if (this.index < 8) val = this.buttons[this.index] ? 1 : 0;
        if (!this.strobe) this.index++;
        return val | 0x40;
    }

    saveState() {
        return {
            buttons: [...this.buttons],
            index: this.index,
            strobe: this.strobe
        };
    }

    loadState(state) {
        this.buttons = [...state.buttons];
        this.index = state.index;
        this.strobe = state.strobe;
    }
}

Controller.A = 0;
Controller.B = 1;
Controller.SELECT = 2;
Controller.START = 3;
Controller.UP = 4;
Controller.DOWN = 5;
Controller.LEFT = 6;
Controller.RIGHT = 7;

class Cartridge {
    constructor() {
        this.valid = false;
        this.mapper = 0;
        this.mirroring = 0;
        this.prgRom = null;
        this.chrRom = null;
        this.prgRam = new Uint8Array(0x2000);
        this.prgBankCount = 0;
        this.chrBankCount = 0;
        this.prgBank1 = 0;
        this.prgBank2 = 0;
        this.chrBank1 = 0;
        this.chrBank2 = 0;
        this.mmc1Shift = 0;
        this.mmc1Count = 0;
        this.mmc1Ctrl = 0;
        this.mmc1Chr0 = 0;
        this.mmc1Chr1 = 0;
        this.mmc1Prg = 0;
        this.mmc3BankSelect = 0;
        this.mmc3Banks = new Array(8).fill(0);
        this.mmc3IrqLatch = 0;
        this.mmc3IrqCounter = 0;
        this.mmc3IrqEnable = false;
        this.mmc3PrgMode = false;
        this.mmc3ChrMode = false;
    }

    load(path) {
        try {
            const fs = require('fs');
            const data = fs.readFileSync(path);
            if (data.length < 16 || data[0] !== 0x4E || data[1] !== 0x45 || data[2] !== 0x53 || data[3] !== 0x1A) {
                return false;
            }
            this.prgBankCount = data[4];
            this.chrBankCount = data[5];
            this.mirroring = (data[6] & 1) ? 1 : 0;
            if (data[6] & 8) this.mirroring = 2;
            this.mapper = ((data[6] >> 4) & 0x0F) | (data[7] & 0xF0);
            let offset = 16;
            if (data[6] & 4) offset += 512;
            const prgSize = this.prgBankCount * 0x4000;
            this.prgRom = new Uint8Array(data.slice(offset, offset + prgSize));
            offset += prgSize;
            if (this.chrBankCount === 0) {
                this.chrRom = new Uint8Array(0x2000);
            } else {
                const chrSize = this.chrBankCount * 0x2000;
                this.chrRom = new Uint8Array(data.slice(offset, offset + chrSize));
            }
            this.prgBank1 = 0;
            this.prgBank2 = Math.max(0, this.prgBankCount - 1);
            this.valid = true;
            return true;
        } catch (e) {
            console.error('ROM load error:', e);
            return false;
        }
    }

    cpuRead(addr) {
        addr &= 0xFFFF;
        if (addr >= 0x8000) {
            switch (this.mapper) {
                case 0:
                case 2:
                    const idx = (addr >= 0xC000 ? this.prgBank2 : this.prgBank1) * 0x4000 + (addr & 0x3FFF);
                    return this.prgRom[idx % this.prgRom.length];
                case 1: {
                    let bank;
                    if (this.prgRom.length <= 0x4000) {
                        bank = 0;
                    } else if ((this.mmc1Prg & 0x08) !== 0) {
                        bank = (addr >= 0xC000 ? (this.mmc1Prg & 0x0F) : 0) * 0x4000;
                    } else {
                        bank = ((this.mmc1Prg & 0x0E) | (addr >= 0xC000 ? 1 : 0)) * 0x4000;
                    }
                    return this.prgRom[(bank + (addr & 0x3FFF)) % this.prgRom.length];
                }
                case 3:
                    return this.prgRom[((this.prgBank1 % this.prgBankCount) * 0x8000 + (addr - 0x8000)) % this.prgRom.length];
            }
        } else if (addr >= 0x6000 && addr < 0x8000) {
            return this.prgRam[addr - 0x6000];
        }
        return 0;
    }

    cpuWrite(addr, data) {
        addr &= 0xFFFF;
        if (addr >= 0x8000) {
            switch (this.mapper) {
                case 1:
                    if ((data & 0x80) !== 0) {
                        this.mmc1Shift = 0;
                        this.mmc1Count = 0;
                        this.mmc1Prg |= 0x0C;
                    } else {
                        this.mmc1Shift |= ((data & 1) << this.mmc1Count);
                        this.mmc1Count++;
                        if (this.mmc1Count === 5) {
                            const reg = (addr >> 13) & 3;
                            if (reg === 0) {
                                this.mmc1Ctrl = this.mmc1Shift & 0x1F;
                                this.mirroring = this.mmc1Ctrl & 3;
                            } else if (reg === 1) {
                                this.mmc1Chr0 = this.mmc1Shift & 0x1F;
                                if ((this.mmc1Ctrl & 0x10) === 0) {
                                    this.chrBank1 = this.mmc1Chr0 >> 1;
                                } else {
                                    this.chrBank1 = this.mmc1Chr0;
                                }
                            } else if (reg === 2) {
                                this.mmc1Chr1 = this.mmc1Shift & 0x1F;
                                if ((this.mmc1Ctrl & 0x10) !== 0) {
                                    this.chrBank2 = this.mmc1Chr1;
                                }
                            } else if (reg === 3) {
                                this.mmc1Prg = this.mmc1Shift & 0x1F;
                                this.prgBank1 = this.mmc1Prg;
                                this.prgBank2 = Math.max(0, this.prgBankCount - 1);
                            }
                            this.mmc1Shift = 0;
                            this.mmc1Count = 0;
                        }
                    }
                    break;
                case 2:
                    this.prgBank1 = data & 0x0F;
                    break;
                case 3:
                    this.chrBank1 = data & 0x03;
                    break;
            }
        } else if (addr >= 0x6000 && addr < 0x8000) {
            this.prgRam[addr - 0x6000] = data;
        }
    }

    ppuRead(addr) {
        addr &= 0x1FFF;
        switch (this.mapper) {
            case 0:
            case 1:
            case 2:
                return this.chrRom[addr % this.chrRom.length];
            case 3: {
                const bankSize = this.chrBankCount > 1 ? 0x2000 : 0x1000;
                return this.chrRom[((this.chrBank1 % Math.max(1, this.chrBankCount)) * bankSize + addr) % this.chrRom.length];
            }
        }
        return 0;
    }

    ppuWrite(addr, data) {
        addr &= 0x1FFF;
        if (this.chrBankCount === 0) {
            this.chrRom[addr] = data;
        }
    }

    saveState() {
        return {
            prgRam: Array.from(this.prgRam),
            mapper: this.mapper,
            mirroring: this.mirroring,
            prgBank1: this.prgBank1,
            prgBank2: this.prgBank2,
            chrBank1: this.chrBank1,
            chrBank2: this.chrBank2,
            mmc1Shift: this.mmc1Shift,
            mmc1Count: this.mmc1Count,
            mmc1Ctrl: this.mmc1Ctrl,
            mmc1Chr0: this.mmc1Chr0,
            mmc1Chr1: this.mmc1Chr1,
            mmc1Prg: this.mmc1Prg,
            mmc3BankSelect: this.mmc3BankSelect,
            mmc3Banks: [...this.mmc3Banks],
            mmc3IrqLatch: this.mmc3IrqLatch,
            mmc3IrqCounter: this.mmc3IrqCounter,
            mmc3IrqEnable: this.mmc3IrqEnable,
            mmc3PrgMode: this.mmc3PrgMode,
            mmc3ChrMode: this.mmc3ChrMode
        };
    }

    loadState(state) {
        this.prgRam = new Uint8Array(state.prgRam);
        this.mapper = state.mapper;
        this.mirroring = state.mirroring;
        this.prgBank1 = state.prgBank1;
        this.prgBank2 = state.prgBank2;
        this.chrBank1 = state.chrBank1;
        this.chrBank2 = state.chrBank2;
        this.mmc1Shift = state.mmc1Shift;
        this.mmc1Count = state.mmc1Count;
        this.mmc1Ctrl = state.mmc1Ctrl;
        this.mmc1Chr0 = state.mmc1Chr0;
        this.mmc1Chr1 = state.mmc1Chr1;
        this.mmc1Prg = state.mmc1Prg;
        this.mmc3BankSelect = state.mmc3BankSelect;
        this.mmc3Banks = [...state.mmc3Banks];
        this.mmc3IrqLatch = state.mmc3IrqLatch;
        this.mmc3IrqCounter = state.mmc3IrqCounter;
        this.mmc3IrqEnable = state.mmc3IrqEnable;
        this.mmc3PrgMode = state.mmc3PrgMode;
        this.mmc3ChrMode = state.mmc3ChrMode;
    }
}

class Bus {
    constructor() {
        this.cpu = new CPU();
        this.ppu = new PPU();
        this.apu = new APU();
        this.ctrl1 = new Controller();
        this.ctrl2 = new Controller();
        this.cart = null;
        this.cpuRam = new Uint8Array(2048);
        this.apuRegs = new Uint8Array(0x400);
        this.dmaTransfer = false;
        this.dmaDummy = true;
        this.dmaPage = 0;
        this.dmaAddr = 0;
        this.dmaData = 0;
        this.audioBuffer = [];
        this.lastSampleCount = 0;

        this.cpu.setReadCallback(addr => this.cpuRead(addr));
        this.cpu.setWriteCallback((addr, data) => this.cpuWrite(addr, data));
        this.ppu.setReadCallback(addr => this.cart ? this.cart.ppuRead(addr) : 0);
        this.ppu.setWriteCallback((addr, data) => { if (this.cart) this.cart.ppuWrite(addr, data); });
        this.ppu.setNmiCallback(() => this.cpu.nmi());
        this.apu.irqCallback = () => this.cpu.irq();
    }

    insertCartridge(cart) {
        this.cart = cart;
        if (cart) this.ppu.setMirroring(cart.mirroring);
    }

    reset() {
        this.cpu.reset();
        this.ppu.reset();
        this.apu.reset();
        this.ctrl1.reset();
        this.ctrl2.reset();
        this.cpuRam.fill(0);
        this.dmaTransfer = false;
        this.audioBuffer = [];
        this.lastSampleCount = 0;
    }

    cpuRead(addr) {
        addr &= 0xFFFF;
        if (addr < 0x2000) return this.cpuRam[addr & 0x07FF];
        if (addr < 0x4000) return this.ppu.readRegister(0x2000 + (addr & 0x0007));
        if (addr === 0x4014) return 0;
        if (addr === 0x4015) return this.apu.readRegister(addr);
        if (addr === 0x4016) return this.ctrl1.read();
        if (addr === 0x4017) return this.ctrl2.read();
        if (addr < 0x4020) return 0;
        if (this.cart) return this.cart.cpuRead(addr);
        return 0;
    }

    cpuWrite(addr, data) {
        addr &= 0xFFFF;
        if (addr < 0x2000) { this.cpuRam[addr & 0x07FF] = data; return; }
        if (addr < 0x4000) { this.ppu.writeRegister(0x2000 + (addr & 0x0007), data); return; }
        if (addr === 0x4014) {
            this.dmaPage = data;
            this.dmaTransfer = true;
            this.dmaDummy = true;
            this.dmaAddr = 0;
            return;
        }
        if (addr >= 0x4000 && addr <= 0x4017) { this.apu.writeRegister(addr, data); return; }
        if (addr === 0x4016) { this.ctrl1.write(data); this.ctrl2.write(data); return; }
        if (addr < 0x4020) return;
        if (this.cart) this.cart.cpuWrite(addr, data);
    }

    ppuRead(addr) { return this.ppu.readRegister(addr); }
    ppuWrite(addr, data) { this.ppu.writeRegister(addr, data); }

    setController1State(state) {
        for (let i = 0; i < 8; i++) this.ctrl1.setButton(i, (state >> i) & 0x01);
    }

    audioSampleCount() { return this.apu.sampleCount; }

    getAudioSamples() {
        const count = this.apu.sampleCount - this.lastSampleCount;
        if (count > 0) {
            for (let i = 0; i < count; i++) {
                this.audioBuffer.push(this.apu.sample());
            }
            this.lastSampleCount += count;
        }
        const result = this.audioBuffer.slice();
        this.audioBuffer = [];
        return result;
    }

    clearAudioSamples() {
        this.audioBuffer = [];
        this.lastSampleCount = this.apu.sampleCount;
    }

    saveState() {
        return {
            cpu: this.cpu.saveState(),
            ppu: this.ppu.saveState(),
            apu: this.apu.saveState(),
            ctrl1: this.ctrl1.saveState(),
            ctrl2: this.ctrl2.saveState(),
            cart: this.cart ? this.cart.saveState() : null,
            cpuRam: Array.from(this.cpuRam),
            dmaTransfer: this.dmaTransfer,
            dmaDummy: this.dmaDummy,
            dmaPage: this.dmaPage,
            dmaAddr: this.dmaAddr,
            dmaData: this.dmaData
        };
    }

    loadState(state) {
        this.cpu.loadState(state.cpu);
        this.ppu.loadState(state.ppu);
        this.apu.loadState(state.apu);
        this.ctrl1.loadState(state.ctrl1);
        this.ctrl2.loadState(state.ctrl2);
        if (this.cart && state.cart) {
            this.cart.loadState(state.cart);
        }
        this.cpuRam = new Uint8Array(state.cpuRam);
        this.dmaTransfer = state.dmaTransfer;
        this.dmaDummy = state.dmaDummy;
        this.dmaPage = state.dmaPage;
        this.dmaAddr = state.dmaAddr;
        this.dmaData = state.dmaData;
    }
}

class NesEmulator {
    constructor() {
        this.bus = new Bus();
        this.cart = null;
    }

    loadROM(path) {
        const c = new Cartridge();
        if (!c.load(path)) return false;
        this.cart = c;
        this.bus.insertCartridge(c);
        this.bus.reset();
        return true;
    }

    reset() { this.bus.reset(); }

    isLoaded() { return this.cart !== null; }

    setButton(button, pressed) { this.bus.ctrl1.setButton(button, !!pressed); }

    stepFrame() {
        if (!this.cart) return;
        for (;;) {
            if (!this.bus.dmaTransfer) {
                const cycles = this.bus.cpu.step();
                this.bus.apu.step(cycles, (addr) => this.bus.cpuRead(addr));
            } else {
                this.bus.apu.step(1, (addr) => this.bus.cpuRead(addr));
                if (this.bus.dmaDummy) {
                    this.bus.dmaDummy = false;
                } else {
                    const addr = (this.bus.dmaPage << 8) | this.bus.dmaAddr;
                    this.bus.dmaData = this.bus.cpuRead(addr);
                    this.bus.ppu.writeRegister(0x2004, this.bus.dmaData);
                    this.bus.dmaAddr++;
                    if (this.bus.dmaAddr === 0) this.bus.dmaTransfer = false;
                }
            }
            this.bus.ppu.step();
            this.bus.ppu.step();
            this.bus.ppu.step();
            if (this.bus.ppu.frame_complete()) break;
        }
    }

    stepBySamples(sampleCount) {
        if (!this.cart) return;
        const target = this.bus.audioSampleCount() + sampleCount;
        let framesStepped = 0;

        while (this.bus.audioSampleCount() < target) {
            if (!this.bus.dmaTransfer) {
                const cycles = this.bus.cpu.step();
                this.bus.apu.step(cycles, (addr) => this.bus.cpuRead(addr));
            } else {
                this.bus.apu.step(1, (addr) => this.bus.cpuRead(addr));
                if (this.bus.dmaDummy) {
                    this.bus.dmaDummy = false;
                } else {
                    const addr = (this.bus.dmaPage << 8) | this.bus.dmaAddr;
                    this.bus.dmaData = this.bus.cpuRead(addr);
                    this.bus.ppu.writeRegister(0x2004, this.bus.dmaData);
                    this.bus.dmaAddr++;
                    if (this.bus.dmaAddr === 0) this.bus.dmaTransfer = false;
                }
            }
            this.bus.ppu.step();
            this.bus.ppu.step();
            this.bus.ppu.step();
            if (this.bus.ppu.frame_complete()) {
                framesStepped++;
                if (framesStepped >= 2) break;
            }
        }
    }

    getFrameBuffer() { return new Uint8Array(this.bus.ppu.frame_buffer().buffer); }
    getAudioSamples() { return new Int16Array(this.bus.getAudioSamples()); }
    clearAudioSamples() { this.bus.clearAudioSamples(); }

    get cpu() { return this.bus.cpu; }
    get ppu() { return this.bus.ppu; }
    get apu() { return this.bus.apu; }

    saveState() {
        return this.bus.saveState();
    }

    loadState(state) {
        this.bus.loadState(state);
        this.bus.clearAudioSamples();
    }
}

module.exports = {
    BUTTON_A, BUTTON_B, BUTTON_SELECT, BUTTON_START,
    BUTTON_UP, BUTTON_DOWN, BUTTON_LEFT, BUTTON_RIGHT,
    NesEmulator, APU
};
