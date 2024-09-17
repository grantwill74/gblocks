const SAMPLE_RATE: number = 44100;


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
    node: GainNode;
    envelope: AdsrEnvelope;

    constructor (context: AudioContext) {
        this.node = context.createGain();

        this.envelope = AdsrEnvelope.default;

        this.node.gain.setValueAtTime (0, 0);
    }

    setEnvelope (env: AdsrEnvelope) {
        this.envelope = env;
    }

    noteOn (time: number) {
        const g = this.node.gain;

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
        const g = this.node.gain;

        g.cancelScheduledValues (time);

        g.setValueAtTime (this.envelope.sustainLevel, time);
        g.linearRampToValueAtTime (0, time + this.envelope.releaseTime);
    }
}

class SoundSys {
    context: AudioContext;

    crash_buf: AudioBuffer;
    pulse_buf_50_a4: AudioBuffer;
    pulse_buf_25_a4: AudioBuffer;

    chn_noise: AudioChannel;
    chn_pulse1: AudioChannel;

    src_noise: AudioBufferSourceNode;
    src_pulse1: AudioBufferSourceNode;

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

        this.chn_noise = new AudioChannel (context);
        this.chn_pulse1 = new AudioChannel (context);

        this.master_gain = context.createGain();

        this.src_noise = context.createBufferSource ();
        this.src_pulse1 = context.createBufferSource ();
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

        sys.src_noise.buffer = sys.crash_buf;
        sys.src_pulse1.buffer = sys.pulse_buf_50_a4;

        sys.master_gain.gain.value = 0.25;

        sys.src_noise.connect (sys.chn_noise.node);
        sys.src_pulse1.connect (sys.chn_pulse1.node);

        sys.chn_noise.node.connect (sys.master_gain);
        sys.chn_pulse1.node.connect (sys.master_gain);
        sys.master_gain.connect (context.destination);

        sys.src_noise.loop = true;
        sys.src_pulse1.loop = true;

        sys.src_noise.start ();
        sys.src_pulse1.start ();

        return sys;
    }

    crash (): void {
        this.chn_noise.setEnvelope (AdsrEnvelope.crash);
        this.src_noise.playbackRate.setValueAtTime (0.5, 0);
        this.chn_noise.noteOff (this.context.currentTime);
    }

    clear1 (): void {
        this.chn_pulse1.setEnvelope (AdsrEnvelope.clear);
        this.chn_pulse1.noteOff (this.context.currentTime);
    }

    moveBeep (): void {
        this.chn_pulse1.setEnvelope (AdsrEnvelope.beep);
        this.src_pulse1.playbackRate.setValueAtTime (2.0, 0);
        this.chn_pulse1.noteOff (this.context.currentTime);
    }
}

async function soundTest(): Promise <void> {
    const sys = await SoundSys.create ();

    sys.clear1 ();
}