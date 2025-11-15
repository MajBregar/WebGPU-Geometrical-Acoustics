import { Renderer } from "./core/scripts/renderer.js";
import { Loader } from "./core/scripts/loader.js";
import { Controller } from "./core/scripts/controller.js";

const canvas = document.getElementById("gfx");
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

const fpsDiv = document.getElementById("fps");

// WebGPU init
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
    throw new Error("WebGPU adapter not found.");
}
const device = await adapter.requestDevice();

// Load assets
const loader = new Loader(device);
await loader.init();

// Input controller
const controller = new Controller(canvas);

// Renderer
const renderer = new Renderer(canvas, device, loader, controller);

// --------------------------------------------------------
// FPS COUNTER
// --------------------------------------------------------
let lastTime = performance.now();
let frameCount = 0;

function updateFPS() {
    const now = performance.now();
    frameCount++;
    if (now - lastTime >= 500) {
        const fps = (frameCount * 1000) / (now - lastTime);
        fpsDiv.textContent = `FPS: ${fps.toFixed(1)}`;
        lastTime = now;
        frameCount = 0;
    }
}

// --------------------------------------------------------
// GAME LOOP
// --------------------------------------------------------
let running = true;

function gameLoop() {
    if (running) {
        renderer.renderFrame();
        updateFPS();
    }
    setTimeout(gameLoop, 0);
}

gameLoop();


