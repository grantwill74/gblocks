"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const SAMPLE_RATE = 44100;
function createAudioContext() {
    const context = new window.AudioContext({
        latencyHint: 'interactive',
        sampleRate: SAMPLE_RATE,
    });
    return context;
}
function genWhiteNoise(context, duration) {
    return __awaiter(this, void 0, void 0, function* () {
        const nChannels = 1;
        const buffer = context.createBuffer(nChannels, SAMPLE_RATE * duration, SAMPLE_RATE);
        const bufData = buffer.getChannelData(0);
        for (let i = 0; i < bufData.length; i++) {
            if ((i & 0x7) == 0) {
                let r = Math.random() * 2 - 1;
                bufData[i] = r;
            }
            else {
                bufData[i] = bufData[i & 0xFFFFFFF8];
            }
        }
        return buffer;
    });
}
function genPulseWave(context, duty, freq, duration) {
    return __awaiter(this, void 0, void 0, function* () {
        const buffer = context.createBuffer(1, SAMPLE_RATE * duration, SAMPLE_RATE);
        const buf_data = buffer.getChannelData(0);
        const seconds_per_cycle = 1 / freq;
        const samples_per_cycle = seconds_per_cycle * SAMPLE_RATE;
        const lo_pulse_length = samples_per_cycle * (duty % 1);
        const lo_pulse_error = lo_pulse_length % 1;
        const hi_pulse_length = samples_per_cycle - lo_pulse_length;
        const hi_pulse_error = hi_pulse_length % 1;
        for (let i = 0; i < buf_data.length; i++) {
            let i_s = i % samples_per_cycle;
            if (i_s < lo_pulse_length) {
                buf_data[i] = 0;
            }
            else if (i_s == (lo_pulse_length - lo_pulse_error)) {
                if (Math.random() < lo_pulse_error) {
                    buf_data[i] = 0;
                }
                else {
                    buf_data[i] = 1;
                }
            }
            else if (i_s > lo_pulse_length &&
                i_s < (samples_per_cycle - (samples_per_cycle % 1))) {
                buf_data[i] = 1;
            }
            else {
                if (Math.random() < hi_pulse_error) {
                    buf_data[i] = 1;
                }
                else {
                    buf_data[i] = 0;
                }
            }
        }
        return buffer;
    });
}
class AdsrEnvelope {
    constructor(attackTime, attackLevel, decayTime, sustainLevel, releaseTime) {
        this.attackTime = attackTime;
        this.attackLevel = attackLevel;
        this.decayTime = decayTime;
        this.sustainLevel = sustainLevel;
        this.releaseTime = releaseTime;
    }
}
AdsrEnvelope.default = new AdsrEnvelope(0, 1, 0, 1, 0);
AdsrEnvelope.crash = new AdsrEnvelope(0, 1, 0, 1, 0.15);
AdsrEnvelope.clear = new AdsrEnvelope(0, 1, 0.5, 0.5, 1);
AdsrEnvelope.beep = new AdsrEnvelope(0, 1, 0, 0.08, 0.1);
class AudioChannel {
    constructor(context) {
        this.node = context.createGain();
        this.envelope = AdsrEnvelope.default;
        this.node.gain.setValueAtTime(0, 0);
    }
    setEnvelope(env) {
        this.envelope = env;
    }
    noteOn(time) {
        const g = this.node.gain;
        const sustain_time = this.envelope.attackTime +
            this.envelope.decayTime;
        g.cancelScheduledValues(time);
        g.setValueAtTime(0, time);
        g.linearRampToValueAtTime(this.envelope.attackLevel, time + this.envelope.attackTime);
        g.linearRampToValueAtTime(this.envelope.sustainLevel, time + sustain_time);
    }
    noteOff(time) {
        const g = this.node.gain;
        g.cancelScheduledValues(time);
        g.setValueAtTime(this.envelope.sustainLevel, time);
        g.linearRampToValueAtTime(0, time + this.envelope.releaseTime);
    }
}
class SoundSys {
    constructor(context, crash_buf, pulse_buf_50_c4, pulse_buf_25_c4) {
        this.context = context;
        this.crash_buf = crash_buf;
        this.pulse_buf_50_c4 = pulse_buf_50_c4;
        this.pulse_buf_25_c4 = pulse_buf_25_c4;
        this.chn_noise = new AudioChannel(context);
        this.chn_pulse1 = new AudioChannel(context);
        this.master_gain = context.createGain();
        this.src_noise = context.createBufferSource();
        this.src_pulse1 = context.createBufferSource();
    }
    static create() {
        return __awaiter(this, void 0, void 0, function* () {
            const context = createAudioContext();
            const crash_buf_prom = genWhiteNoise(context, 4);
            const pulse_buf_prom = genPulseWave(context, 0.5, 261.6256, 4);
            const pulse_buf_25_prom = genPulseWave(context, 0.25, 261.6256, 4);
            const sys = new SoundSys(context, yield crash_buf_prom, yield pulse_buf_prom, yield pulse_buf_25_prom);
            sys.src_noise.buffer = sys.crash_buf;
            sys.src_pulse1.buffer = sys.pulse_buf_50_c4;
            sys.master_gain.gain.value = 0.25;
            sys.src_noise.connect(sys.chn_noise.node);
            sys.src_pulse1.connect(sys.chn_pulse1.node);
            sys.chn_noise.node.connect(sys.master_gain);
            sys.chn_pulse1.node.connect(sys.master_gain);
            sys.master_gain.connect(context.destination);
            sys.src_noise.loop = true;
            sys.src_pulse1.loop = true;
            sys.src_noise.start();
            sys.src_pulse1.start();
            return sys;
        });
    }
    crash() {
        this.chn_noise.setEnvelope(AdsrEnvelope.crash);
        this.src_noise.playbackRate.setValueAtTime(0.5, 0);
        this.chn_noise.noteOff(this.context.currentTime);
    }
    clear1() {
        this.chn_pulse1.setEnvelope(AdsrEnvelope.clear);
        this.chn_pulse1.noteOff(this.context.currentTime);
    }
    moveBeep() {
        this.chn_pulse1.setEnvelope(AdsrEnvelope.beep);
        this.src_pulse1.playbackRate.setValueAtTime(2.0, 0);
        this.chn_pulse1.noteOff(this.context.currentTime);
    }
}
function soundTest() {
    return __awaiter(this, void 0, void 0, function* () {
        const sys = yield SoundSys.create();
        sys.clear1();
    });
}
