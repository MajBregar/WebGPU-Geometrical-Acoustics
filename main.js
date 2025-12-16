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



const reflections = [
    {
        delay: 0.050,
        gain: 0.35
    },
    {
        delay: 0.070,
        gain: 0.22
    },
    {
        delay: 0.062,
        gain: 0.15
    }
];

async function simulationLoop() {

    const start = performance.now();

    audio_engine.update_loader_energy_vector();
    await renderer.renderFrame();

    const emitter_energy = loader.energyBands_CPU;
    const listener_energy = renderer.listenerEnergy;

    const transfer_function = audio_engine.get_transfer_function(listener_energy);

    audio_engine.updateRoom({
        bands: transfer_function,
        reflections
    });

    ui.updateGraph(inputGraph, emitter_energy);
    ui.updateGraph(outputGraph, ui.normalize_curve(transfer_function));

    updateGPUFPS(start);
    requestAnimationFrame(simulationLoop);
}


simulationLoop();