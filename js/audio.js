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
            bufData[i] = Math.random();
        }
        return buffer;
    });
}
function createAndPlaySound() {
    return __awaiter(this, void 0, void 0, function* () {
        const audio = createAudioContext();
        const source = audio.createBufferSource();
        const noiseBuf = yield genWhiteNoise(audio, 0.125);
        source.buffer = noiseBuf;
        const gain = audio.createGain();
        gain.gain.value = 0.125;
        source.connect(gain);
        gain.connect(audio.destination);
        source.start();
    });
}
