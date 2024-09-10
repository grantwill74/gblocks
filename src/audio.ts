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
    for (let i = 8; i < bufData.length; i += 8) {
        let r = Math.random() * 2 - 1;
        bufData[i - 7] = r;
        bufData[i - 6] = r;
        bufData[i - 5] = r;
        bufData[i - 4] = r;
        bufData[i - 3] = r;
        bufData[i - 2] = r;
        bufData[i - 1] = r;
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

        g.setValueAtTime (this.sustainLevel, time);
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
        crash_source.playbackRate.value = 0.5;

        crash_source.connect (this.crash_inst.node);

        crash_source.start (this.context.currentTime);
        const off_time = 0.0;
        this.crash_inst.noteOff (this.context.currentTime + off_time);
        crash_source.stop (this.context.currentTime + 
            off_time + this.crash_inst.releaseTime);
    }

    clear1 (): void {
        
    }
}

async function soundTest(): Promise <void> {
    const sys = await SoundSys.create ();

    sys.crash ();
}