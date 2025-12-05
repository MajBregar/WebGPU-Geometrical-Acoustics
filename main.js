import { Renderer } from "./core/scripts/renderer.js";
import { Loader } from "./core/scripts/loader.js";
import { Controller } from "./core/scripts/controller.js";
import { UI } from "./core/scripts/ui.js";

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

const ui = new UI(settings, renderer);


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


let running = true;
async function gameLoop() {
    if (running) {
        const start = performance.now();

        await renderer.renderFrame();
        updateGPUFPS(start);
    }

    requestAnimationFrame(gameLoop);
}


gameLoop();
