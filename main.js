import { Renderer } from "./core/scripts/renderer.js";
import { Loader } from "./core/scripts/loader.js";
import { Controller } from "./core/scripts/controller.js";
import { UI } from "./core/scripts/ui.js";
import { AudioEngine } from "./core/scripts/audio_engine.js"

const canvas = document.getElementById("gfx");
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
const fpsDiv = document.getElementById("fps");

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
    throw new Error("WebGPU adapter not found.");
}
const device = await adapter.requestDevice();


const settingsResponse = await fetch("./settings.json");
const settings = await settingsResponse.json();


const loader = new Loader(device, settings);
await loader.init();
const controller = new Controller(canvas, settings);
const renderer = new Renderer(canvas, device, loader, controller, settings);

const audio_engine = new AudioEngine(device, loader, settings);

const ui = new UI(settings, renderer, audio_engine);
const inputGraph = ui.inputGraph;
const outputGraph = ui.outputGraph;


let lastTime = performance.now();
let gpuFrames = 0;

async function updateGPUFPS() {
    await device.queue.onSubmittedWorkDone();

    gpuFrames++;
    const now = performance.now();

    if (now - lastTime >= 500) {
        const fps = (gpuFrames * 1000) / (now - lastTime);
        fpsDiv.textContent = `GPU FPS: ${fps.toFixed(1)}`;
        gpuFrames = 0;
        lastTime = now;
    }
}


async function simulationLoop() {

    const start = performance.now();

    audio_engine.update_loader_energy_vector();

    await renderer.renderFrame();
    const emitter_energy = loader.energyBands_CPU;
    
    if (audio_engine.audioContext && audio_engine.isPlaying) {

        const frameData     = renderer.listenerEnergy;
        const irBinCount  = 44000;
        const sampleRate  = audio_engine.audioContext.sampleRate;

        const accumulatedCoefs = audio_engine.accumulateCoefs(
                frameData,
                irBinCount,
                audio_engine.bandCount
            );

        const room_coefficients = audio_engine.computeTransmissionCoefs(
                frameData,
                irBinCount,
                audio_engine.bandCount,
                sampleRate,
                emitter_energy
            );

        const now = performance.now() * 0.001;

        let reflections = audio_engine._cachedReflections;

        if (now - audio_engine._lastReflectionUpdate > audio_engine._reflectionUpdateInterval) {
            const broadbandIR = audio_engine.collapseHistogram(
                accumulatedCoefs,
                irBinCount,
                audio_engine.bandCount
            );

            reflections = audio_engine.extractReflections(
                broadbandIR,
                sampleRate
            );

            audio_engine.normalizeReflections(reflections);
            audio_engine.smoothReflections(reflections);

            audio_engine._cachedReflections = reflections;
            audio_engine._lastReflectionUpdate = now;
        }

        audio_engine.updateRoom({
            bands: room_coefficients,
            reflections: reflections
        });

        ui.updateGraph(outputGraph, ui.normalize_curve(room_coefficients));
    }

    ui.updateGraph(inputGraph, ui.normalize_curve(emitter_energy));

    updateGPUFPS(start);
    requestAnimationFrame(simulationLoop);
}




simulationLoop();