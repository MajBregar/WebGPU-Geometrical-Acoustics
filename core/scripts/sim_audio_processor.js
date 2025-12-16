const BAND_RANGES = [
    [22, 44], [44, 88], [88, 177], [177, 354], [354, 707],
    [707, 1414], [1414, 2828], [2828, 5657], [5657, 11314], [11314, 22627],
];

const MAX_REFLECTIONS = 16;
const MAX_DELAY_SEC = 1.0;

const GAIN_SMOOTHING = 0.02;
const REFLECTION_SMOOTHING = 0.02;

class BiquadBandpass {
    constructor(sampleRate, f0, Q) {
        const w0 = 2 * Math.PI * f0 / sampleRate;
        const alpha = Math.sin(w0) / (2 * Q);
        const cosw0 = Math.cos(w0);

        const b0 = alpha;
        const b1 = 0;
        const b2 = -alpha;
        const a0 = 1 + alpha;
        const a1 = -2 * cosw0;
        const a2 = 1 - alpha;

        this.b0 = b0 / a0;
        this.b1 = b1 / a0;
        this.b2 = b2 / a0;
        this.a1 = a1 / a0;
        this.a2 = a2 / a0;

        this.x1 = 0; this.x2 = 0;
        this.y1 = 0; this.y2 = 0;
    }

    process(x) {
        const y =
            this.b0 * x +
            this.b1 * this.x1 +
            this.b2 * this.x2 -
            this.a1 * this.y1 -
            this.a2 * this.y2;

        this.x2 = this.x1;
        this.x1 = x;
        this.y2 = this.y1;
        this.y1 = y;

        return y;
    }
}

class SimAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        this.bandCount = BAND_RANGES.length;
        this.bandGains = new Float32Array(this.bandCount).fill(1.0);
        this.smoothGains = new Float32Array(this.bandCount).fill(1.0);

        this.filters = [];
        for (let b = 0; b < this.bandCount; b++) {
            const [f0, f1] = BAND_RANGES[b];
            const center = Math.sqrt(f0 * f1);
            const Q = center / (f1 - f0);
            this.filters[b] = new BiquadBandpass(sampleRate, center, Q);
        }

        this.maxDelaySamples = Math.floor(MAX_DELAY_SEC * sampleRate);
        this.delayBuffer = new Float32Array(this.maxDelaySamples);
        this.delayIndex = 0;

        this.reflections = [];


        this.port.onmessage = e => {
            if (e.data.bands?.length === this.bandCount) {
                this.bandGains.set(e.data.bands);
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
                        this.reflections[i].gainTarget  = r.gain;
                    }
                }
            }
        };
    }

    process(inputs, outputs) {
        const input = inputs[0];
        const output = outputs[0];
        if (!input || input.length === 0) return true;

        const n = input[0].length;
        const chCount = input.length;

        for (let b = 0; b < this.bandCount; b++) {
            this.smoothGains[b] += GAIN_SMOOTHING * (this.bandGains[b] - this.smoothGains[b]);
        }

        for (const r of this.reflections) {
            r.delayCurrent += REFLECTION_SMOOTHING * (r.delayTarget - r.delayCurrent);
            r.gainCurrent += REFLECTION_SMOOTHING * (r.gainTarget - r.gainCurrent);
        }

        for (let i = 0; i < n; i++) {
            const x = input[0][i];

            //MAIN FILTERING
            let dry = 0;
            for (let b = 0; b < this.bandCount; b++) {
                dry += this.filters[b].process(x) * this.smoothGains[b];
            }

            //REVERB
            let wet = dry;
            for (const r of this.reflections) {
                const d = Math.min(
                    Math.floor(r.delayCurrent * sampleRate),
                    this.maxDelaySamples - 1
                );
                const idx =
                    (this.delayIndex - d + this.maxDelaySamples) %
                    this.maxDelaySamples;

                wet += r.gainCurrent * this.delayBuffer[idx];
            }

            // MAIN OUTPUT
            for (let ch = 0; ch < chCount; ch++) {
                output[ch][i] = wet;
            }

            // REVERB OUTPUT
            this.delayBuffer[this.delayIndex] = dry;
            this.delayIndex = (this.delayIndex + 1) % this.maxDelaySamples;
        }

        return true;
    }
}

registerProcessor("sim_audio_processor", SimAudioProcessor);
