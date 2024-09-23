const SAMPLE_RATE: number = 44100;
const AUDIO_TICKS_PER_SEC = 60;
const AUDIO_SECS_PER_TICK = 1 / AUDIO_TICKS_PER_SEC;

function createAudioContext(): AudioContext {
    const context = new window.AudioContext({
        latencyHint: 'interactive',
        sampleRate: SAMPLE_RATE,
    });

    return context;
}

async function genWhiteNoise(context: AudioContext, duration: number): 
    Promise <AudioBuffer> 
{
    const nChannels = 1;
    const buffer = context.createBuffer(
        nChannels, 
        SAMPLE_RATE * duration, 
        SAMPLE_RATE
    );
    
    const bufData = buffer.getChannelData (0);
    for (let i = 0; i < bufData.length; i++) {
        if ( (i & 0x7) == 0) {
            let r = Math.random() * 2 - 1;
            bufData[i] = r;
        }
        else {
            bufData[i] = bufData[i & 0xFFFFFFF8];
        }
    }

    return buffer;
}

async function genPulseWave (
    context: AudioContext, 
    duty: number, 
    freq: number,
    duration: number
) : Promise <AudioBuffer>
{
    const buffer = context.createBuffer (
        1, SAMPLE_RATE * duration, SAMPLE_RATE);
    
    const buf_data = buffer.getChannelData (0);
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
            if (Math.random () < lo_pulse_error) {
                buf_data[i] = 0;
            }
            else {
                buf_data[i] = 1;
            }
        }
        else if (i_s > lo_pulse_length && 
            i_s < (samples_per_cycle - (samples_per_cycle % 1))) 
        {
            buf_data[i] = 1;
        }
        else {
            if (Math.random () < hi_pulse_error) {
                buf_data[i] = 1;
            }
            else {
                buf_data[i] = 0;
            }
        }
    }

    return buffer;
}

class AdsrEnvelope {
    attackTime: number;
    attackLevel: number;
    decayTime: number;
    sustainLevel: number;
    releaseTime: number;

    constructor (
        attackTime: number,
        attackLevel: number,
        decayTime: number,
        sustainLevel: number,
        releaseTime: number,
    ) {
        this.attackTime = attackTime;
        this.attackLevel = attackLevel;
        this.decayTime = decayTime;
        this.sustainLevel = sustainLevel;
        this.releaseTime = releaseTime;
    }

    static default: AdsrEnvelope = new AdsrEnvelope (0, 1, 0, 1, 0);
    static crash: AdsrEnvelope = new AdsrEnvelope (0, 1, 0, 1, 0.15);
    static clear: AdsrEnvelope = new AdsrEnvelope (0, 1, 0.5, 0.5, 1);
    static beep: AdsrEnvelope = new AdsrEnvelope (0, 1, 0, 0.08, 0.1);
}

class AudioChannel {
    gain: GainNode;
    envelope: AdsrEnvelope;
    source: AudioBufferSourceNode;

    constructor (context: AudioContext) {
        this.gain = context.createGain ();

        this.envelope = AdsrEnvelope.default;

        this.gain.gain.setValueAtTime (0, 0);

        this.source = context.createBufferSource ();
        this.source.connect (this.gain);
        this.source.loop = true;
        this.source.start ();
    }

    setBuffer (context: AudioContext, buf: AudioBuffer) {
        this.source.stop ();
        this.source = context.createBufferSource ();
        this.source.connect (this.gain);
        this.source.loop = true;
        this.source.buffer = buf;
        this.source.start ();
    }

    setEnvelope (env: AdsrEnvelope) {
        this.envelope = env;
    }

    setPlaybackRate (rate: number) {
        this.source.playbackRate.setValueAtTime (rate, 0);
    }

    noteOn (note: number, time: number) {
        // the frequency of midi note 'n' is 
        // 440 * 2^((n-69)/12)
        // assuming that 440 is the base frequency (which it is for us)
        const freq_exp = (note - 69) / 12;
        
        // however, we don't need the 440 factor, because we will be
        // dividing by the base frequency of the channel, which is hardcoded
        // to 440, to compute the playback speed.
        const playback_speed = Math.pow (2, freq_exp);
        
        this.source.playbackRate.cancelScheduledValues (time);
        this.source.playbackRate.setValueAtTime (playback_speed, time);

        const g = this.gain.gain;

        const sustain_time = 
            this.envelope.attackTime + 
            this.envelope.decayTime;

        g.cancelScheduledValues (time);

        g.setValueAtTime (0, time);
        g.linearRampToValueAtTime (
            this.envelope.attackLevel, 
            time + this.envelope.attackTime
        );

        g.linearRampToValueAtTime (
            this.envelope.sustainLevel, 
            time + sustain_time
        );
    }

    noteOff (time: number) {
        const g = this.gain.gain;

        g.cancelScheduledValues (time);

        g.setValueAtTime (this.envelope.sustainLevel, time);
        g.linearRampToValueAtTime (0, time + this.envelope.releaseTime);
    }
}

enum ChannelId {
    Noise = 0,
    Pulse1 = 1,
}

class SoundSys {
    context: AudioContext;

    crash_buf: AudioBuffer;
    pulse_buf_50_a4: AudioBuffer;
    pulse_buf_25_a4: AudioBuffer;

    channels: AudioChannel[];
    music: SoundProcess[];
    sfx: SoundProcess[];

    master_gain: GainNode;

    private constructor (
        context: AudioContext, 
        crash_buf: AudioBuffer,
        pulse_buf_50_a4: AudioBuffer,
        pulse_buf_25_a4: AudioBuffer,
    ) {
        this.context = context;

        this.crash_buf = crash_buf;
        this.pulse_buf_50_a4 = pulse_buf_50_a4;
        this.pulse_buf_25_a4 = pulse_buf_25_a4;

        this.channels = new Array <AudioChannel> (2);
        this.channels [ChannelId.Noise] = new AudioChannel (context);
        this.channels [ChannelId.Pulse1] = new AudioChannel (context);

        this.music = this.channels.map ((_) => SoundProcess.Nothing);
        this.sfx = this.channels.map ((_) => SoundProcess.Nothing);

        this.master_gain = context.createGain();
    }

    static async create (): Promise <SoundSys> {
        const context = createAudioContext();

        const crash_buf_prom = genWhiteNoise (context, 4);
        const pulse_buf_prom = genPulseWave (context, 0.5, 440, 4);
        const pulse_buf_25_prom = genPulseWave (context, 0.25, 440, 4)
        
        const sys = new SoundSys (
            context, 
            await crash_buf_prom,
            await pulse_buf_prom,
            await pulse_buf_25_prom,
        );

        sys.master_gain.gain.setValueAtTime (.25, 0);

        sys.channels [ChannelId.Noise].gain.connect (sys.master_gain);
        sys.channels [ChannelId.Pulse1].gain.connect (sys.master_gain);
        sys.master_gain.connect (context.destination);

        sys.channels [ChannelId.Noise].setBuffer (sys.context, sys.crash_buf);
        sys.channels [ChannelId.Pulse1].setBuffer (sys.context, sys.pulse_buf_50_a4 );

        return sys;
    }

    tick (time: number): void {
        for (let i = 0; i < this.nChannels; i++) {
            // sound effects pre-empt music
            const which_proc: SoundProcess = 
                this.sfx [i].playing ?
                this.sfx [i] :
                this.music [i];

            const op = which_proc.tick (time);
            
            if (op instanceof NoteOn) {
                console.log ('on')
                // TODO don't hardcode this in the future
                this.channels [i].setEnvelope (AdsrEnvelope.beep);

                this.channels [i].noteOn (op.which, time);
            }
            else if (op instanceof NoteOff) {
                console.log ('off')
                // TODO don't hardcode this in the future
                this.channels [i].setEnvelope (AdsrEnvelope.beep);

                this.channels [i].noteOff (time);
            }
            else if (op instanceof NoteNop) {
                // do nothing
            }
            else {
                throw new Error ("unrecognized sound operation" + op);
            }
        }
    }

    get nChannels (): number { return this.channels.length; }

    crash (): void {
        this.channels [ChannelId.Noise].setBuffer (this.context, this.crash_buf);
        this.channels [ChannelId.Noise].setEnvelope (AdsrEnvelope.crash);
        this.channels [ChannelId.Noise].setPlaybackRate (0.5);
        this.channels [ChannelId.Noise].noteOff (this.context.currentTime);
    }

    clear1 (): void {
        this.channels [ChannelId.Pulse1].setBuffer (this.context, this.pulse_buf_50_a4);
        this.channels [ChannelId.Pulse1].setEnvelope (AdsrEnvelope.clear);
        this.channels [ChannelId.Pulse1].setPlaybackRate (1);
        this.channels [ChannelId.Pulse1].noteOff (this.context.currentTime);
    }

    moveBeep (): void {
        this.channels [ChannelId.Pulse1].setBuffer (this.context, this.pulse_buf_50_a4);
        this.channels [ChannelId.Pulse1].setEnvelope (AdsrEnvelope.beep);
        this.channels [ChannelId.Pulse1].setPlaybackRate (2);
        this.channels [ChannelId.Pulse1].noteOff (this.context.currentTime);
    }
}

enum SoundOpcode {
    Op_NoteNop = 0,
    Op_NoteOn,
    Op_NoteOff,
}

// sound commands
class NoteOn { 
    which: number;
    get opcode (): number { return SoundOpcode.Op_NoteOn}

    constructor (which: number) {
        this.which = which;
    }
}

class NoteOff {
    get opcode (): number { return SoundOpcode.Op_NoteOff}
}

class NoteNop {
    get opcode (): number { return SoundOpcode.Op_NoteNop}
}

type SoundOp = NoteOn | NoteOff | NoteNop;

class SoundCommand {
    op: SoundOp;
    when: number;

    constructor (when: number, op: SoundOp) {
        this.when = when;
        this.op = op;
    }
}

class SoundProcess {
    ops: SoundCommand [];
    bpm: number;
    ip: number = 0; 
    beats: number = 0;
    last_update: number = -1;
    loops: boolean = false;

    // becomes true when the top note has been returned by 'tick'
    // so that we don't process a note mulitple times
    played: boolean = false;

    constructor (ops: SoundCommand[], bpm: number) {
        this.ops = ops;
        this.bpm = bpm;
    }

    start (time: number): void {
        this.last_update = time;
    }

    get playing (): boolean {
        return this.last_update >= 0;
    }

    tick (time: number): SoundOp {
        if (this.ops.length == 0 || !this.playing) {
            return new NoteNop;
        }

        if (this.ip >= this.ops.length && !this.loops) {
            return new NoteNop;
        }

        const delta = time - this.last_update;
        const delta_beats = delta * this.bpm / 60;
        const top = this.ops [this.ip];
        this.beats += delta_beats;
        this.last_update = time;

        if (this.ip == this.ops.length - 1) {
            if (this.loops) {
                this.ip = 0;
            }
            else {
                this.ip ++;
            }

            this.played = true;
            return top.op;
        }
        
        const next = this.ops [this.ip + 1];

        if (this.beats >= next.when) {
            this.ip ++;
        }
        else if (this.played) {
            return new NoteNop;
        }

        // always make sure we finish the current note
        // don't return next until it's the current note
        this.played = true;
        return top.op;
    }

    static Nothing: SoundProcess = new SoundProcess ([], 96);
}

/// Builder for a single channel's sound operations
class SoundProgBuilder {
    ops: SoundCommand[];
    n_beats: number = 0;
    _bpm: number = 96;

    constructor () {
        this.ops = new Array <SoundCommand> ();
    }

    n = this.note;
    r = this.rest;

    get bpm (): number { return this._bpm; }
    set bpm (n: number) { this._bpm = n; }

    /// which note to play and how many beats to play it
    note (which: number, howLong: number) {
        const op_on = new SoundCommand (this.n_beats, new NoteOn (which));

        this.n_beats += howLong;

        const op_off = new SoundCommand (this.n_beats, new NoteOff ());

        this.ops.push (op_on, op_off);
    }

    rest (howLong: number) {
        this.n_beats += howLong;
    }

    program (): SoundCommand[] {
        return this.ops;
    }
}

function testSong(): SoundCommand [] {
    const b = new SoundProgBuilder;

    b.n (72, 1);
    b.n (74, 1);
    b.n (76, 1);
    b.n (77, 1);
    b.n (79, 2);
    b.r (1);
    b.n (79, 1);

    return b.program ();
}


async function soundTest(): Promise <void> {
    const sys = await SoundSys.create ();

    const song = testSong ();

    sys.music [ChannelId.Pulse1] = new SoundProcess (song, 96);
    sys.music [ChannelId.Pulse1].loops = false;
    sys.music [ChannelId.Pulse1].start (sys.context.currentTime);

    function tick_audio () {
        setTimeout (tick_audio, SECS_PER_TICK * 1000);
        const time = sys.context.currentTime;

        sys.tick (time);
    }

    // sys.channels [1].noteOn (72, 0);
    // sys.channels [1].noteOff (0.5);
    // sys.channels [1].setBuffer (sys.context, sys.pulse_buf_50_a4);
    // sys.channels [1].setEnvelope (AdsrEnvelope.beep);
    // sys.channels [1].noteOn (73, 0);
    tick_audio ();
}