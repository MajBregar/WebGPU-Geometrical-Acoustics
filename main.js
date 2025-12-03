import { Renderer } from "./core/scripts/renderer.js";
import { Loader } from "./core/scripts/loader.js";
import { Controller } from "./core/scripts/controller.js";

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




function setupDebugUI() {

    const s1 = document.getElementById("slider1");
    const s2 = document.getElementById("slider2");
    const s3 = document.getElementById("slider3");
    const s1val = document.getElementById("s1val");
    const s2val = document.getElementById("s2val");
    const s3val = document.getElementById("s3val");

    function updateSliders() {
        const x = Number(s1.value);
        const y = Number(s2.value);
        const z = Number(s3.value);
        s1val.textContent = x;
        s2val.textContent = y;
        s3val.textContent = z;

        //settings.LIGHTING.direction = [x, y, z];
        //settings.LIGHTING.shadow_map.normal_bias = x;
        //settings.LIGHTING.shadow_map.bias = y;
        //settings.LIGHTING.ambient_light = x;
        //settings.LIGHTING.intensity = y;

        //settings.SIMULATION.emitter_position = [x, y, z];

    }

    s1.addEventListener("input", updateSliders);
    s2.addEventListener("input", updateSliders);
    s3.addEventListener("input", updateSliders);

    updateSliders();

    const c1 = document.getElementById("c1");
    const c2 = document.getElementById("c2");
    const c3 = document.getElementById("c3");
    const c4 = document.getElementById("c4");
    const c5 = document.getElementById("c5");

    function updateCheckboxes() {
        const new_hidden_walls = {
            top: c3.checked,
            north: c1.checked,
            south: c5.checked,
            east: c4.checked,
            west: c2.checked
        };

        settings.SIMULATION.hide_walls = new_hidden_walls;
        renderer.requestReload();
    }

    [c1, c2, c3, c4, c5].forEach(cb => {
        cb.addEventListener("change", updateCheckboxes);
    });

    const hw = settings.SIMULATION.hide_walls;
    c1.checked = hw.north;
    c2.checked = hw.west;
    c3.checked = hw.top;
    c4.checked = hw.east;
    c5.checked = hw.south;

    const reloadButton = document.getElementById("reloadBtn");

    reloadButton.addEventListener("click", () => {
        renderer.requestReload();
    });
}


setupDebugUI();
gameLoop();
