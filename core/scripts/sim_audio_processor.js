const MAX_REFLECTIONS = 16;
const MAX_DELAY_SEC = 1.0;
const REFLECTION_SMOOTHING = 0.02; // ~20–30 ms


class SimAudioProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();

        // ---- bands ----
        this.bandCount = options.processorOptions?.bandCount ?? 8;

        this.bands = new Float32Array(this.bandCount).fill(1.0);
        this.smoothBands = new Float32Array(this.bandCount).fill(1.0);

        // ---- delay / echo ----
        this.sampleRate = sampleRate;
        this.maxDelaySamples = Math.floor(MAX_DELAY_SEC * sampleRate);
        this.delayBuffers = [];
        this.writeIndex = 0;

        // Each reflection:
        // { delayCurrent, delayTarget, gainCurrent, gainTarget }
        this.reflections = [];

        this.port.onmessage = e => {
            if (e.data.bands &&
                e.data.bands.length === this.bandCount) {
                this.bands.set(e.data.bands);
            }

            if (e.data.reflections) {
                const incoming = e.data.reflections.slice(0, MAX_REFLECTIONS);

                this.reflections.length = incoming.length;

                for (let i = 0; i < incoming.length; i++) {
                    const r = incoming[i];

                    if (!this.reflections[i]) {
                        this.reflections[i] = {
                            delayCurrent: r.delay,
                            delayTarget: r.delay,
                            gainCurrent: r.gain,
                            gainTarget: r.gain
                        };
                    } else {
                        this.reflections[i].delayTarget = r.delay;
                        this.reflections[i].gainTarget = r.gain;
                    }
                }
            }
        };
    }

    process(inputs, outputs) {
        const inputChannels = inputs[0];
        const outputChannels = outputs[0];

        // REQUIRED: handle empty or missing input
        if (!inputChannels || inputChannels.length === 0) {
            if (outputChannels) {
                for (let ch = 0; ch < outputChannels.length; ch++) {
                    outputChannels[ch].fill(0);
                }
            }
            return true;
        }

        const chCount = inputChannels.length;
        const n = inputChannels[0].length;

        // Lazy init delay buffers
        if (this.delayBuffers.length !== chCount) {
            this.delayBuffers = [];
            for (let ch = 0; ch < chCount; ch++) {
                this.delayBuffers.push(
                    new Float32Array(this.maxDelaySamples)
                );
            }
        }

        // ---- smooth band gains ----
        for (let i = 0; i < this.bandCount; i++) {
            this.smoothBands[i] +=
                0.05 * (this.bands[i] - this.smoothBands[i]);
        }

        // ---- smooth reflections (CRITICAL FIX) ----
        for (const r of this.reflections) {
            r.delayCurrent +=
                REFLECTION_SMOOTHING * (r.delayTarget - r.delayCurrent);
            r.gainCurrent +=
                REFLECTION_SMOOTHING * (r.gainTarget - r.gainCurrent);
        }

        // ---- per-sample processing ----
        for (let i = 0; i < n; i++) {
            const band =
                Math.min(
                    this.bandCount - 1,
                    Math.floor(i / n * this.bandCount)
                );

            for (let ch = 0; ch < chCount; ch++) {
                const input = inputChannels[ch][i];

                // spectral coloration
                let out = input * this.smoothBands[band];

                // echoes (use SMOOTHED values)
                for (const r of this.reflections) {
                    const delaySamples = Math.min(
                        Math.floor(r.delayCurrent * this.sampleRate),
                        this.maxDelaySamples - 1
                    );

                    const readIndex =
                        (this.writeIndex - delaySamples + this.maxDelaySamples)
                        % this.maxDelaySamples;

                    out += r.gainCurrent * this.delayBuffers[ch][readIndex];
                }

                outputChannels[ch][i] = out;
                this.delayBuffers[ch][this.writeIndex] = input;
            }

            this.writeIndex =
                (this.writeIndex + 1) % this.maxDelaySamples;
        }

        return true;
    }
}

registerProcessor("sim_audio_processor", SimAudioProcessor);
