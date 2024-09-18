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

    setBuffer (buf: AudioBuffer) {
        this.source.buffer = buf;
    }

    setEnvelope (env: AdsrEnvelope) {
        this.envelope = env;
    }

    setPlaybackRate (rate: number) {
        this.source.playbackRate.setValueAtTime (rate, 0);
    }

    noteOn (time: number) {
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

        sys.channels [ChannelId.Noise].setBuffer (sys.crash_buf);
        sys.channels [ChannelId.Pulse1].setBuffer (sys.pulse_buf_50_a4);

        sys.master_gain.gain.setValueAtTime (.25, 0);

        sys.channels [ChannelId.Noise].gain.connect (sys.master_gain);
        sys.channels [ChannelId.Pulse1].gain.connect (sys.master_gain);
        sys.master_gain.connect (context.destination);

        return sys;
    }

    noteOn (channel: number, note: number): void {
        // the frequency of midi note 'n' is 
        // 440 * 2^((n-69)/12)
        // assuming that 440 is the base frequency (which it is for us)
        const freq_exp = (note - 69) / 12;
        
        // however, we don't need the 440 factor, because we will be
        // dividing by the base frequency of the channel, which is hardcoded
        // to 440, to compute the playback speed.
        const playback_speed = Math.pow (2, freq_exp);
        
        this.channels 
    }

    crash (): void {
        this.channels [ChannelId.Noise].setEnvelope (AdsrEnvelope.crash);
        this.channels [ChannelId.Noise].setPlaybackRate (0.5);
        this.channels [ChannelId.Noise].noteOff (this.context.currentTime);
    }

    clear1 (): void {
        this.channels [ChannelId.Pulse1].setEnvelope (AdsrEnvelope.clear);
        this.channels [ChannelId.Pulse1].setPlaybackRate (1);
        this.channels [ChannelId.Pulse1].noteOff (this.context.currentTime);
    }

    moveBeep (): void {
        this.channels [ChannelId.Pulse1].setEnvelope (AdsrEnvelope.beep);
        this.channels [ChannelId.Pulse1].setPlaybackRate (2);
        this.channels [ChannelId.Pulse1].noteOff (this.context.currentTime);
    }
}

async function soundTest(): Promise <void> {
    const sys = await SoundSys.create ();

    sys.clear1 ();
}