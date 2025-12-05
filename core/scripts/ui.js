import { WebglPlot, WebglLine, ColorRGBA } from "https://cdn.jsdelivr.net/gh/danchitnis/webgl-plot@master/dist/webglplot.esm.min.js";

export class UI {

    constructor(settings, renderer) {
        this.settings = settings;
        this.renderer = renderer;

        this.roomW = settings.SIMULATION.room_dimensions[0];
        this.roomH = settings.SIMULATION.room_dimensions[1];
        this.roomD = settings.SIMULATION.room_dimensions[2];

        this.initEmitterListenerSliders();
        this.initWallCheckboxes();
        this.initReloadButton();
        this.createGraph();
    }

    createGraph() {
        const plot = document.getElementById("energyPlot");

        plot.width = plot.clientWidth;
        plot.height = plot.clientHeight;

        this.wglp = new WebglPlot(plot);

        this.graphSampleCount = this.settings.SIMULATION.energy_bands;

        const offset = 0.05;

        // ----------------------------
        // Main data line
        // ----------------------------
        this.graphLine = new WebglLine(new ColorRGBA(1, 0, 0, 1), this.graphSampleCount);
        this.graphLine.lineWidth = 2;
        this.wglp.addLine(this.graphLine);

        const Xmin = -1 + offset;
        const Xmax =  1 - offset;
        const Ymin = -1 + offset;
        const Ymax =  1 - offset;

        for (let i = 0; i < this.graphSampleCount; i++) {
            const t = i / (this.graphSampleCount - 1);

            // X scaled into plot region
            this.graphLine.setX(i, Xmin + t * (Xmax - Xmin));

            // Y initially zero inside plot region
            this.graphLine.setY(i, Ymin);
        }

        // ----------------------------
        // X axis line
        // ----------------------------
        this.xAxis = new WebglLine(new ColorRGBA(0, 0, 0, 1), 2);
        this.xAxis.setX(0, Xmin); this.xAxis.setY(0, Ymin);
        this.xAxis.setX(1, Xmax); this.xAxis.setY(1, Ymin);
        this.wglp.addLine(this.xAxis);

        // ----------------------------
        // Y axis line
        // ----------------------------
        this.yAxis = new WebglLine(new ColorRGBA(0, 0, 0, 1), 2);
        this.yAxis.setX(0, Xmin); this.yAxis.setY(0, Ymin);
        this.yAxis.setX(1, Xmin); this.yAxis.setY(1, Ymax);
        this.wglp.addLine(this.yAxis);

        // ----------------------------
        // Y ticks
        // ----------------------------
        const YTICKS = [0, 250, 500, 750, 1000];
        this.yTicks = [];

        for (let tVal of YTICKS) {
            const ty = Ymin + (tVal / 1000) * (Ymax - Ymin);  // scale tick to plot region

            const tick = new WebglLine(new ColorRGBA(0, 0, 0, 1), 2);
            tick.setX(0, Xmin);          tick.setY(0, ty);
            tick.setX(1, Xmin + 0.03);   tick.setY(1, ty);  // small horizontal tick
            this.yTicks.push(tick);

            this.wglp.addLine(tick);
        }

        this.wglp.update();
    }



    updateGraph(values) {
        if (!this.graphLine) return;

        const offset = 0.05;
        const Ymin = -1 + offset;
        const Ymax =  1 - offset;

        const n = Math.min(values.length, this.graphSampleCount);

        for (let i = 0; i < n; i++) {
            const v = values[i];

            // clamp to [0, 1000]
            const vClamped = Math.max(0, Math.min(1000, v));

            // normalised 0..1
            const t = vClamped / 1000;

            // map into padded coordinate system
            const y = Ymin + t * (Ymax - Ymin);

            this.graphLine.setY(i, y);
        }

        this.wglp.update();
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
            zv: document.getElementById("lz_val")
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

        emit.x.addEventListener("input", updateEmitter);
        emit.y.addEventListener("input", updateEmitter);
        emit.z.addEventListener("input", updateEmitter);

        listen.x.addEventListener("input", updateListener);
        listen.y.addEventListener("input", updateListener);
        listen.z.addEventListener("input", updateListener);
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

            renderer.requestReload();
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

    initReloadButton() {
        const btn = document.getElementById("reloadBtn");
        const renderer = this.renderer;

        if (btn) {
            btn.addEventListener("click", () => {
                renderer.requestReload();
            });
        }
    }
}
