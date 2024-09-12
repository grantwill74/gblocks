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
    node: GainNode;

    attackTime: number;
    attackLevel: number;
    decayTime: number;
    sustainLevel: number;
    releaseTime: number;

    constructor (
        context: AudioContext,
        attackTime: number,
        attackLevel: number,
        decayTime: number,
        sustainLevel: number,
        releaseTime: number,
    ) {
        this.node = context.createGain();

        this.attackTime = attackTime;
        this.attackLevel = attackLevel;
        this.decayTime = decayTime;
        this.sustainLevel = sustainLevel;
        this.releaseTime = releaseTime;

        this.node.gain.value = 0;
    }

    noteOn (time: number) {
        const g = this.node.gain;

        const sustain_time = this.attackTime + this.decayTime;

        g.cancelScheduledValues (time);

        g.setValueAtTime (0, time);
        g.linearRampToValueAtTime (this.attackLevel, time + this.attackTime);
        g.linearRampToValueAtTime (this.sustainLevel, time + sustain_time);
    }

    noteOff (time: number) {
        const g = this.node.gain;

        g.cancelScheduledValues (time);

        g.setValueAtTime (this.sustainLevel, time);
        g.linearRampToValueAtTime (0, time + this.releaseTime);
    }
}

class SoundSys {
    context: AudioContext;

    crash_buf: AudioBuffer;
    pulse_buf_50: AudioBuffer;

    crash_adsr: AdsrEnvelope;
    doo_adsr: AdsrEnvelope;

    crash_source: AudioBufferSourceNode;
    clear_source: AudioBufferSourceNode;

    master_gain: GainNode;

    private constructor (
        context: AudioContext, 
        crash_buf: AudioBuffer,
        pulse_buf_50: AudioBuffer
    ) {
        this.context = context;

        this.crash_buf = crash_buf;
        this.pulse_buf_50 = pulse_buf_50;

        this.crash_adsr = new AdsrEnvelope (context, 0, 1, 0, 1, 0.15);
        this.doo_adsr = new AdsrEnvelope (context, 0, 1, 0.5, 0.5, 1);

        this.master_gain = context.createGain();

        this.crash_source = context.createBufferSource ();
        this.clear_source = context.createBufferSource ();
    }

    static async create (): Promise <SoundSys> {
        const context = createAudioContext();

        const crash_buf_prom = genWhiteNoise (context, 4);
        const pulse_buf_prom = genPulseWave (context, 0.5, 261.6256, 4);
        
        const sys = new SoundSys (
            context, 
            await crash_buf_prom,
            await pulse_buf_prom
        );

        sys.crash_source.buffer = sys.crash_buf;
        sys.clear_source.buffer = sys.pulse_buf_50;

        sys.master_gain.gain.value = 0.25;

        sys.crash_source.connect (sys.crash_adsr.node);
        sys.clear_source.connect (sys.doo_adsr.node);

        sys.crash_adsr.node.connect (sys.master_gain);
        sys.doo_adsr.node.connect (sys.master_gain);
        sys.master_gain.connect (context.destination);

        sys.crash_source.start ();
        sys.clear_source.start ();

        return sys;
    }

    crash (): void {
        this.crash_adsr.noteOff (this.context.currentTime);
    }

    clear1 (): void {
        this.doo_adsr.noteOff (this.context.currentTime);
    }
}

async function soundTest(): Promise <void> {
    const sys = await SoundSys.create ();

    sys.clear1 ();
}