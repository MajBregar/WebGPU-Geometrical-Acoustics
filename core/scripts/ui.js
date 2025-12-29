import { WebglPlot, WebglLine, ColorRGBA } from "https://cdn.jsdelivr.net/gh/danchitnis/webgl-plot@master/dist/webglplot.esm.min.js";

export class UI {

    constructor(settings, renderer, audio_engine) {
        this.settings = settings;
        this.renderer = renderer;
        this.audio_engine = audio_engine;

        this.roomW = settings.SIMULATION.room_dimensions[0];
        this.roomH = settings.SIMULATION.room_dimensions[1];
        this.roomD = settings.SIMULATION.room_dimensions[2];

        this.initEmitterListenerSliders();
        this.initWallCheckboxes();
        this.initReloadButton();
        this.initHeatmapCheckboxes();
        this.initAudioFileControls();

        this.inputGraph  = this.createGraph("energyPlot1");
        this.addYLabels("energyPlot1", this.inputGraph.bounds, this.inputGraph.ymaxValue);

        this.outputGraph = this.createGraph("energyPlot2");
        this.addYLabels("energyPlot2", this.outputGraph.bounds, this.outputGraph.ymaxValue);

    }

    addYLabels(canvasId, bounds, ymaxValue) {
        const canvas = document.getElementById(canvasId);
        const container = canvas.parentElement;

        container.querySelectorAll(".y-label").forEach(e => e.remove());

        const YTICKS = [0, 0.25, 0.5, 0.75, 1.0];

        const heightPx = canvas.height;
        const widthPx  = canvas.width;
        const yAxisOffset = 0.03;
        const yAxisX = bounds.Xmin + yAxisOffset;

        const xPixel = ((yAxisX + 1) / 2) * widthPx;

        for (const v of YTICKS) {
            const ty = bounds.Ymin + (v / ymaxValue) * (bounds.Ymax - bounds.Ymin);

            const yPixel = (1 - (ty + 1) / 2) * heightPx;

            const label = document.createElement("div");
            label.className = "y-label";
            label.textContent = v.toFixed(2);

            label.style.top  = `${yPixel - 7}px`;
            label.style.left = `${xPixel - 8}px`;

            container.appendChild(label);
        }
    }



    createGraph(divID) {
        const plot = document.getElementById(divID);

        plot.width  = plot.clientWidth;
        plot.height = plot.clientHeight;

        const graphSampleCount = this.settings.SIMULATION.energy_bands;
        const offset = 0.05;

        const Xmin = -1 + offset;
        const Xmax =  1 - offset;
        const Ymin = -1 + offset;
        const Ymax =  1 - offset;

        const yAxisOffset = 0.1;
        const Y_AXIS_X = Xmin + yAxisOffset;

        const X_AXIS_START = Y_AXIS_X;
        const X_AXIS_END   = Xmax;

        const wglp = new WebglPlot(plot);

        const mainLine = new WebglLine(new ColorRGBA(1, 0, 0, 1), graphSampleCount);
        mainLine.lineWidth = 2;

        for (let i = 0; i < graphSampleCount; i++) {
            const t = i / (graphSampleCount - 1);
            mainLine.setX(i, X_AXIS_START + t * (X_AXIS_END - X_AXIS_START));
            mainLine.setY(i, Ymin);
        }

        wglp.addLine(mainLine);

        const xAxis = new WebglLine(new ColorRGBA(0, 0, 0, 1), 2);
        xAxis.setX(0, X_AXIS_START); xAxis.setY(0, Ymin);
        xAxis.setX(1, X_AXIS_END);   xAxis.setY(1, Ymin);
        wglp.addLine(xAxis);

        const yAxis = new WebglLine(new ColorRGBA(0, 0, 0, 1), 2);
        yAxis.setX(0, Y_AXIS_X); yAxis.setY(0, Ymin);
        yAxis.setX(1, Y_AXIS_X); yAxis.setY(1, Ymax);
        wglp.addLine(yAxis);

        const YTICKS = [0, 0.25, 0.5, 0.75, 1.0];
        const yTicks = [];

        for (let tVal of YTICKS) {
            const ty = Ymin + (tVal / 1.2) * (Ymax - Ymin);
            const tick = new WebglLine(new ColorRGBA(0, 0, 0, 1), 2);

            tick.setX(0, Y_AXIS_X);
            tick.setY(0, ty);

            tick.setX(1, Y_AXIS_X + 0.03);
            tick.setY(1, ty);

            yTicks.push(tick);
            wglp.addLine(tick);
        }

        const GRID_COUNT = 10;
        const gridLines = [];

        for (let i = 0; i < GRID_COUNT; i++) {
            const t = i / (GRID_COUNT - 1);

            const gx = X_AXIS_START + t * (X_AXIS_END - X_AXIS_START);

            const SEGMENTS = 20;
            const dotted = new WebglLine(
                new ColorRGBA(0, 0, 0, 0.3),
                SEGMENTS * 2
            );

            for (let s = 0; s < SEGMENTS; s++) {
                const y0 = Ymin + (s / SEGMENTS) * (Ymax - Ymin);
                const y1 = Ymin + ((s + 0.5) / SEGMENTS) * (Ymax - Ymin);

                dotted.setX(s * 2,     gx);
                dotted.setY(s * 2,     y0);

                dotted.setX(s * 2 + 1, gx);
                dotted.setY(s * 2 + 1, y1);
            }

            gridLines.push(dotted);
            wglp.addLine(dotted);
        }

        wglp.update();

        return {
            wglp,
            mainLine,
            xAxis,
            yAxis,
            yTicks,
            gridLines,
            sampleCount: graphSampleCount,
            bounds: { Xmin, Xmax, Ymin, Ymax },
            ymaxValue: 1.2
        };
    }



    normalize_curve(curve) {
        let max = 0;

        const n = curve.length;
        for (let i = 0; i < n; i++) {
            const v = curve[i];
            if (v > max) max = v;
        }
        
        if (max <= 0) return curve;

        for (let i = 0; i < n; i++) {
            curve[i] /= max;
        }

        return curve;
    }


    updateGraph(graph, values) {
        if (!graph || !graph.mainLine) return;

        const { mainLine, wglp, sampleCount, bounds } = graph;
        const { Ymin, Ymax } = bounds;

        const n = Math.min(values.length, sampleCount);

        for (let i = 0; i < n; i++) {
            const v = values[i];
            const y = Ymin + (v / 1.2) * (Ymax - Ymin);
            mainLine.setY(i, y);
        }

        wglp.update();
    }

    initAudioFileControls() {
        const engine = this.audio_engine;

        const fileInput = document.getElementById("audio-file-input");
        const fileLabel = document.getElementById("selected-audio-file");
        const button    = document.getElementById("play-toggle-button");

        let currentFile = null;
        let state = "idle"; 

        function setButton(text, enabled = true) {
            button.textContent = text;
            button.disabled = !enabled;
        }

        fileInput.addEventListener("change", () => {
            if (!fileInput.files || fileInput.files.length === 0) {
                currentFile = null;
                fileLabel.textContent = "No file selected";
                setButton("Load", false);
                state = "idle";
                return;
            }

            currentFile = fileInput.files[0];
            fileLabel.textContent = currentFile.name;
            setButton("Load", true);
            state = "idle";
        });

        button.addEventListener("click", async () => {
            if (!currentFile) return;

            // LOAD
            if (state === "idle") {
                const url = URL.createObjectURL(currentFile);
            
                await engine.create();
                await engine.loadSound(url, { loop: false });

                setButton("Play");
                state = "loaded";
                return;
            }

            // PLAY
            if (state === "loaded" || state === "paused") {
                engine.resume();
                engine.play();

                setButton("Pause");
                state = "playing";
                return;
            }

            // PAUSE
            if (state === "playing") {
                engine.pause();

                setButton("Play");
                state = "paused";
            }
        });
    }




    initEmitterListenerSliders() {

        const settings = this.settings;

        const emit = {
            x: document.getElementById("ex_slider"),
            y: document.getElementById("ey_slider"),
            z: document.getElementById("ez_slider"),
            xv: document.getElementById("ex_val"),
            yv: document.getElementById("ey_val"),
            zv: document.getElementById("ez_val")
        };

        const listen = {
            x: document.getElementById("lx_slider"),
            y: document.getElementById("ly_slider"),
            z: document.getElementById("lz_slider"),
            xv: document.getElementById("lx_val"),
            yv: document.getElementById("ly_val"),
            zv: document.getElementById("lz_val"),
        };

        const heatmap = {
            sens: document.getElementById("lsens_slider"),
            sensv: document.getElementById("lsens_val")
        };

        const recursion = {
            depth: document.getElementById("rec_depth_slider"),
            depthv: document.getElementById("rec_depth_val"),
            entries: document.getElementById("rec_entry_slider"),
            entriesv: document.getElementById("rec_entry_val"),
        };

        const debug = {
            x: document.getElementById("dx_slider"),
            y: document.getElementById("dy_slider"),
            z: document.getElementById("dz_slider"),
            xv: document.getElementById("dx_val"),
            yv: document.getElementById("dy_val"),
            zv: document.getElementById("dz_val")
        };

        [emit, listen].forEach(S => {
            S.x.min = 0; S.y.min = 0; S.z.min = 0;
            S.x.max = this.roomW;
            S.y.max = this.roomH;
            S.z.max = this.roomD;
        });

        const [ex0, ey0, ez0] = settings.SIMULATION.emitter_position;
        emit.x.value = ex0; emit.y.value = ey0; emit.z.value = ez0;
        emit.xv.textContent = ex0; emit.yv.textContent = ey0; emit.zv.textContent = ez0;

        const [lx0, ly0, lz0] = settings.SIMULATION.listener_position;
        listen.x.value = lx0; listen.y.value = ly0; listen.z.value = lz0;
        listen.xv.textContent = lx0; listen.yv.textContent = ly0; listen.zv.textContent = lz0;

        const visualization_sensitivity = settings.SIMULATION.heatmap_sensitivity;
        heatmap.sens.value = visualization_sensitivity;
        heatmap.sensv.textContent = visualization_sensitivity;

        const max_recursion_level = settings.SIMULATION.max_recursion_level;
        recursion.depth.value = max_recursion_level;
        recursion.depthv.textContent = max_recursion_level;

        const max_recursion_entries = settings.SIMULATION.max_recursion_entries;
        recursion.entries.value = max_recursion_entries;
        recursion.entriesv.textContent = max_recursion_entries;

        function updateEmitter() {
            const x = Number(emit.x.value);
            const y = Number(emit.y.value);
            const z = Number(emit.z.value);

            emit.xv.textContent = x;
            emit.yv.textContent = y;
            emit.zv.textContent = z;

            settings.SIMULATION.emitter_position = [x, y, z];
        }

        function updateListener() {
            const x = Number(listen.x.value);
            const y = Number(listen.y.value);
            const z = Number(listen.z.value);

            listen.xv.textContent = x;
            listen.yv.textContent = y;
            listen.zv.textContent = z;

            settings.SIMULATION.listener_position = [x, y, z];
        }

        function updateHeatmap() {
            const s = Number(heatmap.sens.value);
            heatmap.sensv.textContent = s;

            settings.SIMULATION.heatmap_sensitivity = s;
        }

        function updateRecursionSettings() {
            const d = Number(recursion.depth.value);
            const e = Number(recursion.entries.value);

            recursion.depthv.textContent = d;
            recursion.entriesv.textContent = e;

            settings.SIMULATION.max_recursion_level = d;
            settings.SIMULATION.max_recursion_entries = e;
        }

        emit.x.addEventListener("input", updateEmitter);
        emit.y.addEventListener("input", updateEmitter);
        emit.z.addEventListener("input", updateEmitter);

        listen.x.addEventListener("input", updateListener);
        listen.y.addEventListener("input", updateListener);
        listen.z.addEventListener("input", updateListener);

        heatmap.sens.addEventListener("input", updateHeatmap);

        recursion.depth.addEventListener("input", updateRecursionSettings);
        recursion.entries.addEventListener("input", updateRecursionSettings);

    }

    initWallCheckboxes() {

        const settings = this.settings;
        const renderer = this.renderer;

        const c1 = document.getElementById("c1");
        const c2 = document.getElementById("c2");
        const c3 = document.getElementById("c3");
        const c4 = document.getElementById("c4");
        const c5 = document.getElementById("c5");

        function updateCheckboxes() {
            settings.SIMULATION.hide_walls = {
                top:   c3.checked,
                north: c1.checked,
                south: c5.checked,
                east:  c4.checked,
                west:  c2.checked
            };

            renderer.requestWallUpdate();
        }

        const hw = settings.SIMULATION.hide_walls;
        c1.checked = hw.north;
        c2.checked = hw.west;
        c3.checked = hw.top;
        c4.checked = hw.east;
        c5.checked = hw.south;

        [c1, c2, c3, c4, c5].forEach(cb => {
            cb.addEventListener("change", updateCheckboxes);
        });
    }


    initHeatmapCheckboxes() {

        const settings = this.settings;

        const cbDisabled = document.getElementById("hm_disabled");
        const cbAbsorbed = document.getElementById("hm_absorbed");
        const cbBounces  = document.getElementById("hm_bounces");

        function setExclusive(active) {
            cbDisabled.checked = active === "disabled";
            cbAbsorbed.checked = active === "absorbed";
            cbBounces.checked  = active === "bounces";
        }

        function updateFromUI(e) {
            const source = e.target;
            
            if (source === cbDisabled) {
                setExclusive("disabled");
                settings.SIMULATION.show_heatmap = false;
                settings.SIMULATION.show_bounces_instead = false;
            } 
            else if (source === cbAbsorbed) {
                setExclusive("absorbed");
                settings.SIMULATION.show_heatmap = true;
                settings.SIMULATION.show_bounces_instead = false;
            } 
            else if (source === cbBounces) {
                setExclusive("bounces");
                settings.SIMULATION.show_heatmap = true;
                settings.SIMULATION.show_bounces_instead = true;
            }
        }

        if (!settings.SIMULATION.show_heatmap) {
            setExclusive("disabled");
        } else if (settings.SIMULATION.show_bounces_instead) {
            setExclusive("bounces");
        } else {
            setExclusive("absorbed");
        }

        cbDisabled.addEventListener("change", updateFromUI);
        cbAbsorbed.addEventListener("change", updateFromUI);
        cbBounces.addEventListener("change", updateFromUI);
    }



    initReloadButton() {
        const btn = document.getElementById("reloadBtn");
        const renderer = this.renderer;
        const engine   = this.audio_engine;

        const fileInput = document.getElementById("audio-file-input");
        const fileLabel = document.getElementById("selected-audio-file");
        const button    = document.getElementById("play-toggle-button");

        if (!btn) return;

        let saving = false;

        btn.addEventListener("click", () => {
            if (saving) return;

            saving = true;

            // --- existing behavior ---
            renderer.requestPipelineRebuild();
            engine.reload();

            try {
                engine.stop?.();
                engine.pause?.();
            } catch (e) {}

            fileInput.value = "";
            fileLabel.textContent = "No file selected";
            button.textContent = "Load";
            button.disabled = true;
            // -------------------------

            // --- save feedback ---
            btn.textContent = "Saved";
            btn.disabled = true;

            setTimeout(() => {
                btn.textContent = "Save";
                btn.disabled = false;
                saving = false;
            }, 2000);
        });
    }


}
