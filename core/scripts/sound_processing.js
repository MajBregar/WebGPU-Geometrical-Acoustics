

export class SoundProcessor {
    constructor(device, loader, settings) {
        this.loader = loader;
        this.settings = settings;
        this.device = device;

        this.energyBandCount = settings.SIMULATION.energy_bands;
        this.inputEnergyBands_CPU_Write = loader.energyBands_CPU;
        this.outputEnergyBands_Formatted = new Float32Array(this.energyBandCount);
    }

    process_listener_sound(raw_received_energies) {
        const out = this.outputEnergyBands_Formatted;

        if (!raw_received_energies) return out;

        const n = Math.min(raw_received_energies.length, this.energyBandCount);

        let maxVal = 0;
        for (let i = 0; i < n; i++) {
            if (raw_received_energies[i] > maxVal) {
                maxVal = raw_received_energies[i];
            }
        }

        if (maxVal <= 0) {
            for (let i = 0; i < n; i++) out[i] = 0;
            return out;
        }

        for (let i = 0; i < n; i++) {
            out[i] = raw_received_energies[i] / maxVal;
        }
        return out;
    }

    update_loader_energy_vector() {
        const vector = this.inputEnergyBands_CPU_Write;

        for (let i = 0; i < this.energyBandCount; i++) {
            vector[i] = Math.random();            
        }
    }
}
