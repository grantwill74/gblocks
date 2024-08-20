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
        bufData[i] = Math.random();
    }

    return buffer;
}

async function createAndPlaySound(): Promise <void> {
    const audio = createAudioContext();
    const source = audio.createBufferSource();
    const noiseBuf = await genWhiteNoise(audio, 0.125);
    source.buffer = noiseBuf;

    const gain = audio.createGain();
    gain.gain.value = 0.125;


    source.connect (gain);
    gain.connect (audio.destination);

    source.start();
}