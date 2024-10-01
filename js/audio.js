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
const AUDIO_TICKS_PER_SEC = 60;
const AUDIO_SECS_PER_TICK = 1 / AUDIO_TICKS_PER_SEC;
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
        this.gain = context.createGain();
        this.envelope = AdsrEnvelope.default;
        this.gain.gain.setValueAtTime(0, 0);
        this.source = context.createBufferSource();
        this.source.connect(this.gain);
        this.source.loop = true;
        this.source.start();
    }
    setBuffer(context, buf) {
        this.source.stop();
        this.source = context.createBufferSource();
        this.source.connect(this.gain);
        this.source.loop = true;
        this.source.buffer = buf;
        this.source.start();
    }
    setEnvelope(env) {
        this.envelope = env;
    }
    setPlaybackRate(rate) {
        this.source.playbackRate.setValueAtTime(rate, 0);
    }
    noteOn(note, time) {
        // the frequency of midi note 'n' is 
        // 440 * 2^((n-69)/12)
        // assuming that 440 is the base frequency (which it is for us)
        const freq_exp = (note - 69) / 12;
        // however, we don't need the 440 factor, because we will be
        // dividing by the base frequency of the channel, which is hardcoded
        // to 440, to compute the playback speed.
        const playback_speed = Math.pow(2, freq_exp);
        this.source.playbackRate.cancelScheduledValues(time);
        this.source.playbackRate.setValueAtTime(playback_speed, time);
        const g = this.gain.gain;
        const sustain_time = this.envelope.attackTime +
            this.envelope.decayTime;
        g.cancelScheduledValues(0);
        g.setValueAtTime(0, time);
        g.linearRampToValueAtTime(this.envelope.attackLevel, time + this.envelope.attackTime);
        g.linearRampToValueAtTime(this.envelope.sustainLevel, time + sustain_time);
    }
    noteOff(time) {
        const g = this.gain.gain;
        g.cancelScheduledValues(0);
        g.setValueAtTime(this.envelope.sustainLevel, time);
        g.linearRampToValueAtTime(0, time + this.envelope.releaseTime);
    }
}
var ChannelId;
(function (ChannelId) {
    ChannelId[ChannelId["Noise"] = 0] = "Noise";
    ChannelId[ChannelId["Pulse1"] = 1] = "Pulse1";
})(ChannelId || (ChannelId = {}));
class SoundSys {
    constructor(context, crash_buf, pulse_buf_50_a4, pulse_buf_25_a4) {
        this.context = context;
        this.crash_buf = crash_buf;
        this.pulse_buf_50_a4 = pulse_buf_50_a4;
        this.pulse_buf_25_a4 = pulse_buf_25_a4;
        this.channels = new Array(2);
        this.channels[ChannelId.Noise] = new AudioChannel(context);
        this.channels[ChannelId.Pulse1] = new AudioChannel(context);
        this.music = this.channels.map((_) => SoundProcess.Nothing);
        this.sfx = this.channels.map((_) => SoundProcess.Nothing);
        this.master_gain = context.createGain();
    }
    static create() {
        return __awaiter(this, void 0, void 0, function* () {
            const context = createAudioContext();
            const crash_buf_prom = genWhiteNoise(context, 4);
            const pulse_buf_prom = genPulseWave(context, 0.5, 440, 4);
            const pulse_buf_25_prom = genPulseWave(context, 0.25, 440, 4);
            const sys = new SoundSys(context, yield crash_buf_prom, yield pulse_buf_prom, yield pulse_buf_25_prom);
            sys.master_gain.gain.setValueAtTime(.25, 0);
            sys.channels[ChannelId.Noise].gain.connect(sys.master_gain);
            sys.channels[ChannelId.Pulse1].gain.connect(sys.master_gain);
            sys.master_gain.connect(context.destination);
            sys.channels[ChannelId.Noise].setBuffer(sys.context, sys.crash_buf);
            sys.channels[ChannelId.Pulse1].setBuffer(sys.context, sys.pulse_buf_50_a4);
            return sys;
        });
    }
    tick(time) {
        for (let i = 0; i < this.nChannels; i++) {
            // sound effects pre-empt music
            const which_proc = this.sfx[i].playing ?
                this.sfx[i] :
                this.music[i];
            const op = which_proc.tick(time);
            if (op instanceof NoteOn) {
                // TODO don't hardcode this in the future
                this.channels[i].setEnvelope(AdsrEnvelope.beep);
                this.channels[i].noteOn(op.which, time);
            }
            else if (op instanceof NoteOff) {
                // TODO don't hardcode this in the future
                this.channels[i].setEnvelope(AdsrEnvelope.beep);
                this.channels[i].noteOff(time);
            }
            else if (op instanceof NoteNop) {
                // do nothing
            }
            else {
                throw new Error("unrecognized sound operation" + op);
            }
        }
    }
    get nChannels() { return this.channels.length; }
    crash() {
        this.channels[ChannelId.Noise].setBuffer(this.context, this.crash_buf);
        this.channels[ChannelId.Noise].setEnvelope(AdsrEnvelope.crash);
        this.channels[ChannelId.Noise].setPlaybackRate(0.5);
        this.channels[ChannelId.Noise].noteOff(this.context.currentTime);
    }
    clear1() {
        this.channels[ChannelId.Pulse1].setBuffer(this.context, this.pulse_buf_50_a4);
        this.channels[ChannelId.Pulse1].setEnvelope(AdsrEnvelope.clear);
        this.channels[ChannelId.Pulse1].setPlaybackRate(1);
        this.channels[ChannelId.Pulse1].noteOff(this.context.currentTime);
    }
    moveBeep() {
        this.channels[ChannelId.Pulse1].setBuffer(this.context, this.pulse_buf_50_a4);
        this.channels[ChannelId.Pulse1].setEnvelope(AdsrEnvelope.beep);
        this.channels[ChannelId.Pulse1].setPlaybackRate(2);
        this.channels[ChannelId.Pulse1].noteOff(this.context.currentTime);
    }
}
var SoundOpcode;
(function (SoundOpcode) {
    SoundOpcode[SoundOpcode["NoteNop"] = 0] = "NoteNop";
    SoundOpcode[SoundOpcode["NoteOn"] = 1] = "NoteOn";
    SoundOpcode[SoundOpcode["NoteOff"] = 2] = "NoteOff";
})(SoundOpcode || (SoundOpcode = {}));
// sound commands
class NoteOn {
    get opcode() { return SoundOpcode.NoteOn; }
    constructor(which) {
        this.which = which;
    }
}
class NoteOff {
    get opcode() { return SoundOpcode.NoteOff; }
}
class NoteNop {
    get opcode() { return SoundOpcode.NoteNop; }
}
class SoundCommand {
    constructor(when, op) {
        this.when = when;
        this.op = op;
    }
}
class SoundProcess {
    constructor(ops, bpm) {
        this.ip = -1;
        this.beats = 0;
        this.last_update = -1;
        this.loops = false;
        this.ops = ops;
        this.bpm = bpm;
    }
    start(time) {
        this.last_update = time;
    }
    get playing() {
        return this.last_update >= 0;
    }
    tick(time) {
        if (this.ops.length == 0 || !this.playing) {
            return new NoteNop;
        }
        if (this.ip >= this.ops.length - 1) {
            if (this.loops) {
                this.ip = -1;
                this.beats = 0;
            }
            else {
                return new NoteNop;
            }
        }
        console.assert(this.ip >= -1);
        console.assert(this.ip < this.ops.length - 1);
        const delta = time - this.last_update;
        const delta_beats = delta * this.bpm / 60;
        this.beats += delta_beats;
        this.last_update = time;
        const next = this.ops[this.ip + 1];
        const its_time_for_next_note = this.beats >= next.when;
        if (its_time_for_next_note) {
            this.ip++;
            return next.op;
        }
        else {
            return new NoteNop;
        }
    }
}
SoundProcess.Nothing = new SoundProcess([], 0);
/// Builder for a single channel's sound operations
class SoundProgBuilder {
    constructor() {
        this.n_beats = 0;
        this._bpm = 96;
        this.n = this.note;
        this.r = this.rest;
        this.ops = new Array();
    }
    get bpm() { return this._bpm; }
    set bpm(n) { this._bpm = n; }
    /// which note to play and how many beats to play it
    note(which, howLong) {
        const op_on = new SoundCommand(this.n_beats, new NoteOn(which));
        this.n_beats += howLong;
        const op_off = new SoundCommand(this.n_beats, new NoteOff());
        this.ops.push(op_on, op_off);
    }
    rest(howLong) {
        this.n_beats += howLong;
    }
    // insert a nop at the end if we end on a rest
    finish() {
        if (this.ops.length == 0) {
            return;
        }
        const last_op = this.ops[this.ops.length - 1];
        if (last_op.op.opcode == SoundOpcode.NoteOff && last_op.when != this.n_beats) {
            this.ops.push(new SoundCommand(this.n_beats, new NoteNop));
        }
    }
    program() {
        return this.ops;
    }
}
function testSong() {
    const b = new SoundProgBuilder;
    const n8 = 0.5;
    b.n(72, n8);
    b.r(n8);
    b.n(74, n8);
    b.r(n8);
    b.n(76, n8);
    b.r(n8);
    b.n(77, n8);
    b.r(n8);
    b.n(79, n8);
    b.r(1.5);
    b.n(79, n8);
    b.r(1.5);
    b.finish();
    return b.program();
}
function soundTest() {
    return __awaiter(this, void 0, void 0, function* () {
        const sys = yield SoundSys.create();
        const song = testSong();
        sys.music[ChannelId.Pulse1] = new SoundProcess(song, 164);
        sys.music[ChannelId.Pulse1].loops = true;
        sys.music[ChannelId.Pulse1].start(sys.context.currentTime);
        function tick_audio() {
            setTimeout(tick_audio, SECS_PER_TICK * 1000);
            const time = sys.context.currentTime;
            sys.tick(time);
        }
        tick_audio();
    });
}
