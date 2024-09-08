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


async function createAndPlaySound(): Promise <void> {
    const audio = createAudioContext();
    const source = audio.createBufferSource();
    const noiseBuf = await genWhiteNoise(audio, 5);
    source.buffer = noiseBuf;
    source.loop = true;

    const master_gain = audio.createGain();
    master_gain.gain.value = 0.25;

    const fwoosh_envelope = new AdsrEnvelope (audio, 2, 1, 1, 0.125, 1);
    const bang_envelope = new AdsrEnvelope (audio, 0, 1, 0, 1, 0.25);


    const lo_pass = audio.createBiquadFilter();
    lo_pass.type = 'lowpass';
    lo_pass.frequency.value = 2222;
    lo_pass.Q.value = 10;

    source.connect (bang_envelope.node);
    bang_envelope.node.connect (lo_pass);
    lo_pass.connect (master_gain);
    master_gain.connect (audio.destination);

    source.playbackRate.setValueAtTime (.07, audio.currentTime);

    source.start (audio.currentTime);
    bang_envelope.noteOn (audio.currentTime);
    bang_envelope.noteOff (audio.currentTime + .1);
}