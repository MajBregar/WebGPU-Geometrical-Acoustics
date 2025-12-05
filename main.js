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
    const roomW = settings.SIMULATION.room_dimensions[0];
    const roomH = settings.SIMULATION.room_dimensions[1];
    const roomD = settings.SIMULATION.room_dimensions[2];

    const emit_sliders = {
        x: document.getElementById("ex_slider"),
        y: document.getElementById("ey_slider"),
        z: document.getElementById("ez_slider"),
        xv: document.getElementById("ex_val"),
        yv: document.getElementById("ey_val"),
        zv: document.getElementById("ez_val")
    };

    const listen_sliders = {
        x: document.getElementById("lx_slider"),
        y: document.getElementById("ly_slider"),
        z: document.getElementById("lz_slider"),
        xv: document.getElementById("lx_val"),
        yv: document.getElementById("ly_val"),
        zv: document.getElementById("lz_val")
    };

    emit_sliders.x.min = listen_sliders.x.min = 0;
    emit_sliders.y.min = listen_sliders.y.min = 0;
    emit_sliders.z.min = listen_sliders.z.min = 0;

    emit_sliders.x.max = listen_sliders.x.max = roomW;
    emit_sliders.y.max = listen_sliders.y.max = roomH;
    emit_sliders.z.max = listen_sliders.z.max = roomD;

    const [ex0, ey0, ez0] = settings.SIMULATION.emitter_position;
    const [lx0, ly0, lz0] = settings.SIMULATION.listener_position;

    emit_sliders.x.value = ex0;
    emit_sliders.y.value = ey0;
    emit_sliders.z.value = ez0;

    listen_sliders.x.value = lx0;
    listen_sliders.y.value = ly0;
    listen_sliders.z.value = lz0;

    emit_sliders.xv.textContent = ex0;
    emit_sliders.yv.textContent = ey0;
    emit_sliders.zv.textContent = ez0;

    listen_sliders.xv.textContent = lx0;
    listen_sliders.yv.textContent = ly0;
    listen_sliders.zv.textContent = lz0;



    function updateEmitter() {
        const x = Number(emit_sliders.x.value);
        const y = Number(emit_sliders.y.value);
        const z = Number(emit_sliders.z.value);

        emit_sliders.xv.textContent = x;
        emit_sliders.yv.textContent = y;
        emit_sliders.zv.textContent = z;

        settings.SIMULATION.emitter_position = [x, y, z];
    }

    function updateListener() {
        const x = Number(listen_sliders.x.value);
        const y = Number(listen_sliders.y.value);
        const z = Number(listen_sliders.z.value);

        listen_sliders.xv.textContent = x;
        listen_sliders.yv.textContent = y;
        listen_sliders.zv.textContent = z;

        settings.SIMULATION.listener_position = [x, y, z];
    }

    emit_sliders.x.addEventListener("input", updateEmitter);
    emit_sliders.y.addEventListener("input", updateEmitter);
    emit_sliders.z.addEventListener("input", updateEmitter);

    listen_sliders.x.addEventListener("input", updateListener);
    listen_sliders.y.addEventListener("input", updateListener);
    listen_sliders.z.addEventListener("input", updateListener);


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

    [c1, c2, c3, c4, c5].forEach(cb => cb.addEventListener("change", updateCheckboxes));

    const hw = settings.SIMULATION.hide_walls;
    c1.checked = hw.north;
    c2.checked = hw.west;
    c3.checked = hw.top;
    c4.checked = hw.east;
    c5.checked = hw.south;

    document.getElementById("reloadBtn").addEventListener("click", () => {
        renderer.requestReload();
    });
}


setupDebugUI();
gameLoop();
