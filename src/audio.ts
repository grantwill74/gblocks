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
    pulse_buf_50_c4: AudioBuffer;

    crash_inst: AdsrEnvelope;
    doo_inst: AdsrEnvelope;

    master_gain: GainNode;

    private constructor (
        context: AudioContext, 
        crash_buf: AudioBuffer,
        pulse_buf_50_c4: AudioBuffer
    ) {
        this.context = context;

        this.crash_buf = crash_buf;
        this.pulse_buf_50_c4 = pulse_buf_50_c4;

        this.crash_inst = new AdsrEnvelope (context, 0, 1, 0, 1, 0.15);
        this.doo_inst = new AdsrEnvelope (context, 0, 1, 0.5, 0.5, 0.1);

        this.master_gain = context.createGain();
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

        sys.master_gain.gain.value = 0.25;

        sys.crash_inst.node.connect (sys.master_gain);
        sys.master_gain.connect (context.destination);

        return sys;
    }

    crash (): void {
        const crash_source = this.context.createBufferSource ();
        crash_source.buffer = this.crash_buf;
        crash_source.loop = true;
        crash_source.playbackRate.value = 0.5;

        crash_source.connect (this.crash_inst.node);

        crash_source.start (this.context.currentTime);
        const off_time = 0.0;
        this.crash_inst.noteOff (this.context.currentTime + off_time);
        crash_source.stop (this.context.currentTime + 
            off_time + this.crash_inst.releaseTime);
    }

    clear1 (): void {
        const clear_source = this.context.createBufferSource ();
    }
}

async function soundTest(): Promise <void> {
    const sys = await SoundSys.create ();

    sys.crash ();
}