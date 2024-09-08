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
        let r = Math.random() * 2 - 1;
        bufData[i] = r;
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

        g.linearRampToValueAtTime (0, time + this.releaseTime);
    }
}

class SoundSys {
    context: AudioContext;

    crash_buf: AudioBuffer;

    crash_inst: AdsrEnvelope;

    master_gain: GainNode;

    private constructor (context: AudioContext, crash_buf: AudioBuffer) {
        this.context = context;

        this.crash_buf = crash_buf;

        this.crash_inst = new AdsrEnvelope (context, 0, 1, 0, 1, 0.2);

        this.master_gain = context.createGain();
    }

    static async create (): Promise <SoundSys> {
        const context = createAudioContext();

        const crash_buf = await genWhiteNoise (context, 5);
        
        const sys = new SoundSys (context, crash_buf);

        sys.master_gain.gain.value = 0.25;

        sys.crash_inst.node.connect (sys.master_gain);
        sys.master_gain.connect (context.destination);

        return sys;
    }

    crash (): void {
        const crash_source = this.context.createBufferSource ();
        crash_source.buffer = this.crash_buf;
        crash_source.loop = true;
        crash_source.playbackRate.value = 0.1;

        const hi_pass = this.context.createBiquadFilter ();
        hi_pass.type = 'highpass';
        hi_pass.Q.value = 2;
        hi_pass.frequency.value = 444;

        crash_source.connect (hi_pass);
        hi_pass.connect (this.crash_inst.node);
        // crash_source.connect (this.crash_inst.node);

        crash_source.start (this.context.currentTime);
        const off_time = 0.04;
        this.crash_inst.noteOn (this.context.currentTime);
        this.crash_inst.noteOff (this.context.currentTime + off_time);
        crash_source.stop (this.context.currentTime + 
            off_time + this.crash_inst.releaseTime);
    }
}

async function soundTest(): Promise <void> {
    const audio = createAudioContext();
    const source = audio.createBufferSource();
    const noiseBuf = await genWhiteNoise(audio, 1);
    source.buffer = noiseBuf;
    source.loop = true;

    const master_gain = audio.createGain();
    master_gain.gain.value = 0.25;

    const fwoosh_envelope = new AdsrEnvelope (audio, 2, 1, 1, 0.125, 1);
    const bang_envelope = new AdsrEnvelope (audio, 0, 1, 0, 1, 0.2);


    const lo_pass = audio.createBiquadFilter();
    lo_pass.type = 'lowpass';
    lo_pass.frequency.value = 9999;
    lo_pass.Q.value = 10;

    source.connect (bang_envelope.node);
    bang_envelope.node.connect (lo_pass);
    lo_pass.connect (master_gain);
    master_gain.connect (audio.destination);

    source.playbackRate.setValueAtTime (.1, audio.currentTime);

    source.start (audio.currentTime);
    bang_envelope.noteOn (audio.currentTime);
    bang_envelope.noteOff (audio.currentTime + .037);
}