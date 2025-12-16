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


        this.inputEnergyBands_CPU_Write = loader.energyBands_CPU;
        this.transfer_function = new Float32Array(this.bandCount);
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
        const vector = this.inputEnergyBands_CPU_Write;
        
        for (let i = 0; i < this.bandCount; i++) {
            vector[i] = 1.0;//Math.random();
                        
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


    async loadSound(url, { loop = false } = {}) {
        if (!this.audioContext) {
            throw new Error("Call create() first");
        }

        this.stop();

        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const audioBuffer =
            await this.audioContext.decodeAudioData(buffer);

        this.source = this.audioContext.createBufferSource();
        this.source.buffer = audioBuffer;
        this.source.loop = loop;
        this.source.connect(this.roomNode);
    }

    play() {
        if (!this.source || this.isPlaying) return;
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
