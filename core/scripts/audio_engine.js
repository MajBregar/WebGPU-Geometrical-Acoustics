import FFT from "./fft.js";

export class AudioEngine {
    constructor(device, loader, settings) {
        this.loader = loader;
        this.settings = settings;
        this.device = device;

        this.bandCount = settings.SIMULATION.energy_bands;

        this.audioContext = null;
        this.roomNode = null;
        this.source = null;
        this.current_url = null;

        this.bands = new Float32Array(this.bandCount);
        this.reflections = [];

        this.isPlaying = false;
        this.isPaused = false;
        this.playbackStartTime = 0;

        this.inputEnergyBands_CPU_Write = loader.energyBands_CPU;
        this.transfer_function = new Float32Array(this.bandCount);

        this.band_ranges = settings.SIMULATION.band_ranges;

        this.irAccumulator = null;
        this.irBroadband = null;
        this.irBinCount = 0;

        this.irDecay = settings.SIMULATION.ir_accumulation_decay;

        this.reflectionScratch = [];
        this.maxReflections = settings.SIMULATION.max_reflections;
        this.directSoundInterval = settings.SIMULATION.direct_sound_interval;

        this.energyTimeline = null;
        this.energyHopSize = 1024;
        this.energyFFTSize = 2048;
        this.energySampleRate = 0;

        this._lastReflectionUpdate = 0;
        this._reflectionUpdateInterval = settings.SIMULATION.reflection_sample_interval;
        this._cachedReflections = [];

        this._reflectionState = [];
        this.reflectionGainSmoothing  = settings.SIMULATION.reflection_gain_smoothing;
        this.reflectionDelaySmoothing = settings.SIMULATION.reflection_delay_smoothing;

    }

    ensureAccumulator(irBinCount, bandCount) {
        const total = irBinCount * bandCount;
        if (!this.irAccumulator || this.irAccumulator.length !== total) {
            this.irAccumulator = new Float32Array(total);
            this.irBroadband = new Float32Array(irBinCount);
            this.irBinCount = irBinCount;
        }
    }

    accumulateCoefs(frameIR, irBinCount, bandCount) {
        this.ensureAccumulator(irBinCount, bandCount);

        const acc = this.irAccumulator;
        const decay = this.irDecay;
        const n = acc.length;

        for (let i = 0; i < n; i++) {
            acc[i] = acc[i] * decay + frameIR[i];
        }

        return acc;
    }


    collapseHistogram(irHistogram, irBinCount, bandCount) {
        const out = this.irBroadband;
        out.fill(0);

        for (let t = 0; t < irBinCount; t++) {
            let sum = 0;
            const base = t * bandCount;
            for (let b = 0; b < bandCount; b++) {
                sum += irHistogram[base + b];
            }
            out[t] = sum;
        }

        return out;
    }

    computeTransmissionCoefs(
        irHistogram,
        irBinCount,
        bandCount,
        sampleRate,
        emitter_energy
    ) {
        const out = this.transfer_function;
        out.fill(0);

        let firstBin = -1;
        for (let t = 0; t < irBinCount; t++) {
            const base = t * bandCount;
            let sum = 0;
            for (let b = 0; b < bandCount; b++) {
                sum += irHistogram[base + b];
            }
            if (sum > 0) {
                firstBin = t;
                break;
            }
        }

        if (firstBin < 0) {
            return out;
        }

        const windowBins = Math.max(1, Math.floor(this.directSoundInterval * sampleRate));
        const endBin = Math.min(firstBin + windowBins, irBinCount);

        for (let t = firstBin; t < endBin; t++) {
            const base = t * bandCount;
            for (let b = 0; b < bandCount; b++) {
                out[b] += irHistogram[base + b];
            }
        }

        for (let b = 0; b < bandCount; b++) {
            out[b] = Math.sqrt(out[b] / (emitter_energy[b] + 1e-10));
        }

        return out;
    }

    extractReflections(broadbandIR, sampleRate) {
        const scratch = this.reflectionScratch;
        scratch.length = 0;

        let firstBin = -1;
        for (let i = 0; i < broadbandIR.length; i++) {
            if (broadbandIR[i] > 0) {
                firstBin = i;
                break;
            }
        }
        if (firstBin < 0) return scratch;

        const windowBins = Math.floor(this.directSoundInterval * sampleRate);
        const endBin = Math.min(firstBin + windowBins, broadbandIR.length);

        let direct_peak = 0.0;
        for (let i = firstBin; i < endBin; i++) {
            direct_peak = Math.max(direct_peak, broadbandIR[i]);
        }

        if (direct_peak < 1e-12) return scratch;

        const invDirect = 1.0 / direct_peak;

        //console.log(windowBins, directEnergy, invDirect);
        
        for (let i = endBin; i < broadbandIR.length; i++) {
            const e = broadbandIR[i];
            if (e <= 0) continue;

            scratch.push({
                delay: (i - firstBin) / sampleRate,
                gain: Math.sqrt(e * invDirect)
            });
        }

        scratch.sort((a, b) => b.gain - a.gain);
        if (scratch.length > this.maxReflections) {
            scratch.length = this.maxReflections;
        }

        return scratch;
    }


    smoothReflections(reflections) {
        const state = this._reflectionState;

        while (state.length < reflections.length) {
            state.push({
                delay: reflections[state.length].delay,
                gain: reflections[state.length].gain
            });
        }

        while (state.length > reflections.length) {
            state.pop();
        }

        for (let i = 0; i < reflections.length; i++) {
            const s = state[i];
            const r = reflections[i];

            s.delay += this.reflectionDelaySmoothing * (r.delay - s.delay);
            s.gain  += this.reflectionGainSmoothing  * (r.gain  - s.gain);

            r.delay = s.delay;
            r.gain  = s.gain;
        }

        return reflections;
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
            "sim_audio_processor",
            {
                processorOptions: {
                    band_ranges: this.band_ranges,
                    max_reflections: this.maxReflections,
                    max_delay_sec: this.settings.SIMULATION.max_reflection_delay_seconds,
                    aw_dry_smoothing: this.settings.SIMULATION.aw_dry_smoothing,
                    aw_wet_smoothing: this.settings.SIMULATION.aw_wet_smoothing
                }
            }
        );

        this.roomNode.connect(this.audioContext.destination);
    }

    updateRoom({ bands, reflections }) {
        if (!this.roomNode) return;

        if (bands) this.bands.set(bands);
        if (reflections) this.reflections = reflections;

        this.roomNode.port.postMessage({
            bands: this.bands,
            reflections: this.reflections
        });
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
                    const [f0, f1] = this.band_ranges[b];
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

        this.current_url = url;

        this.stop();

        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(buffer);

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
        this.isPaused = true;
    }

    resume() {
        if (!this.audioContext) return;
        this.audioContext.resume();
        this.isPaused = false;
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


    async reload(options = {}) {
        if (!this.current_url) return;

        const loader = this.loader;

        this.inputEnergyBands_CPU_Write = loader.energyBands_CPU;
        this.stop();
        await this.loadSound(this.current_url, options);
        this.inputEnergyBands_CPU_Write.fill(0);
    }

}
