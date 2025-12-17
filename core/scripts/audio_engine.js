
import FFT from "./fft.js";

const BAND_RANGES = [
    [22, 44], [44, 88], [88, 177], [177, 354], [354, 707],
    [707, 1414], [1414, 2828], [2828, 5657], [5657, 11314], [11314, 22627],
];

export class AudioEngine {
    constructor(device, loader, settings) {
        this.loader = loader;
        this.settings = settings;
        this.device = device;
        
        this.bandCount = settings.SIMULATION.energy_bands;

        this.audioContext = null;
        this.roomNode = null;
        this.source = null;

        this.bands = new Float32Array(this.bandCount);
        this.reflections = [];

        this.isPlaying = false;
        this.playbackStartTime = 0;



        this.inputEnergyBands_CPU_Write = loader.energyBands_CPU;
        this.transfer_function = new Float32Array(this.bandCount);


        this.energyTimeline = null;
        this.energyHopSize = 1024;
        this.energyFFTSize = 2048;
        this.energySampleRate = 0;



    }

    get_transfer_function(listener_energy) {
        const emitter = this.inputEnergyBands_CPU_Write;
        const transfer_function = this.transfer_function;

        if (!listener_energy || !emitter) return out;

        for (let i = 0; i < this.bandCount; i++){
            transfer_function[i] = Math.sqrt(listener_energy[i] / (emitter[i] + 1e-10));
        }

        return transfer_function;
    }


    update_loader_energy_vector() {
        if (!this.energyTimeline || !this.audioContext || !this.isPlaying) return;

        const t = this.audioContext.currentTime - this.playbackStartTime;
        if (t < 0) return;

        const frame = Math.floor(
            t * this.energySampleRate / this.energyHopSize
        );

        const energy = this.energyTimeline[frame];
        if (!energy) return;

        // let max = 0.0;
        // for (let i = 0; i < energy.length; i++) {
        //     if (energy[i] > max) max = energy[i];
        // }

        // const invMax = max > 1e-12 ? 1.0 / max : 0.0;

        const out = this.inputEnergyBands_CPU_Write;
        for (let i = 0; i < energy.length; i++) {
            out[i] = energy[i];
        }
    }




    async create() {
        if (this.audioContext) return;

        this.audioContext = new AudioContext();

        await this.audioContext.audioWorklet.addModule(
            "./core/scripts/sim_audio_processor.js"
        );

        this.roomNode = new AudioWorkletNode(
            this.audioContext,
            "sim_audio_processor"
        );

        this.roomNode.connect(this.audioContext.destination);
    }

    generateEnergyVectors(audioBuffer) {
        const fftSize = this.energyFFTSize;
        const hopSize = this.energyHopSize;
        const bandCount = this.bandCount;
        const sampleRate = audioBuffer.sampleRate;

        const channelData = audioBuffer.getChannelData(0);
        const fft = new FFT(fftSize);

        const complexIn = fft.createComplexArray();
        const complexOut = fft.createComplexArray();

        const window = new Float32Array(fftSize);
        for (let i = 0; i < fftSize; i++) {
            window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
        }

        const frameCount = Math.floor((channelData.length - fftSize) / hopSize);
        const timeline = new Array(frameCount);

        const nyquist = sampleRate * 0.5;
        const spectrumBins = fftSize >> 1;
        const binHz = sampleRate / fftSize;

        for (let frame = 0; frame < frameCount; frame++) {
            const offset = frame * hopSize;

            for (let i = 0; i < fftSize; i++) {
                complexIn[2 * i] = channelData[offset + i] * window[i];
                complexIn[2 * i + 1] = 0;
            }

            fft.transform(complexOut, complexIn);

            const bands = new Float32Array(bandCount);

            for (let bin = 1; bin < spectrumBins; bin++) {
                const freq = bin * binHz;
                if (freq > nyquist) break;

                const re = complexOut[2 * bin];
                const im = complexOut[2 * bin + 1];
                const mag2 = re * re + im * im;

                for (let b = 0; b < bandCount; b++) {
                    const [f0, f1] = BAND_RANGES[b];
                    if (freq >= f0 && freq < f1) {
                        bands[b] += mag2;
                        break;
                    }
                }
            }

            timeline[frame] = bands;
        }

        return timeline;
    }


    async loadSound(url, { loop = false } = {}) {
        if (!this.audioContext) {
            throw new Error("Call create() first");
        }

        this.stop();

        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const audioBuffer =
            await this.audioContext.decodeAudioData(buffer);

        this.energyTimeline = this.generateEnergyVectors(audioBuffer);
        this.energySampleRate = audioBuffer.sampleRate;

        this.source = this.audioContext.createBufferSource();
        this.source.buffer = audioBuffer;
        this.source.loop = loop;
        this.source.connect(this.roomNode);
    }


    play() {
        if (!this.source || this.isPlaying) return;

        this.playbackStartTime = this.audioContext.currentTime;
        this.source.start();
        this.isPlaying = true;
    }


    pause() {
        if (!this.audioContext) return;
        this.audioContext.suspend();
    }

    resume() {
        if (!this.audioContext) return;
        this.audioContext.resume();
    }

    stop() {
        if (this.source) {
            try { this.source.stop(); } catch {}
            this.source.disconnect();
            this.source = null;
        }
        this.isPlaying = false;
        this.inputEnergyBands_CPU_Write.fill(0);
    }


    async reload(url, options = {}) {
        await this.loadSound(url, options);
    }

    updateRoom({ bands, reflections }) {
        if (!this.roomNode) return;

        if (bands) {
            this.bands.set(bands);
        }

        if (reflections) {
            this.reflections = reflections;
        }

        this.roomNode.port.postMessage({
            bands: this.bands,
            reflections: this.reflections
        });
    }
}
