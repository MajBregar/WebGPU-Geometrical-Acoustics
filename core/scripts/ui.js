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
        this.initHeatmapCheckboxes();

        this.inputGraph  = this.createGraph("energyPlot1");
        this.outputGraph = this.createGraph("energyPlot2");
    }

    createGraph(divID) {
        const plot = document.getElementById(divID);

        plot.width  = plot.clientWidth;
        plot.height = plot.clientHeight;

        const graphSampleCount = this.settings.SIMULATION.energy_bands;
        const offset = 0.05;

        // Coordinate bounds inside plot region
        const Xmin = -1 + offset;
        const Xmax =  1 - offset;
        const Ymin = -1 + offset;
        const Ymax =  1 - offset;

        // ----------------------------
        // WebglPlot instance
        // ----------------------------
        const wglp = new WebglPlot(plot);

        // ----------------------------
        // Main data line
        // ----------------------------
        const mainLine = new WebglLine(new ColorRGBA(1, 0, 0, 1), graphSampleCount);
        mainLine.lineWidth = 2;

        for (let i = 0; i < graphSampleCount; i++) {
            const t = i / (graphSampleCount - 1);
            mainLine.setX(i, Xmin + t * (Xmax - Xmin));
            mainLine.setY(i, Ymin);
        }

        wglp.addLine(mainLine);

        // ----------------------------
        // X axis
        // ----------------------------
        const xAxis = new WebglLine(new ColorRGBA(0, 0, 0, 1), 2);
        xAxis.setX(0, Xmin); xAxis.setY(0, Ymin);
        xAxis.setX(1, Xmax); xAxis.setY(1, Ymin);
        wglp.addLine(xAxis);

        // ----------------------------
        // Y axis
        // ----------------------------
        const yAxis = new WebglLine(new ColorRGBA(0, 0, 0, 1), 2);
        yAxis.setX(0, Xmin); yAxis.setY(0, Ymin);
        yAxis.setX(1, Xmin); yAxis.setY(1, Ymax);
        wglp.addLine(yAxis);

        // ----------------------------
        // Y ticks (0 to 1.2)
        // ----------------------------
        const YTICKS = [0, 0.3, 0.6, 0.9, 1.2];
        const yTicks = [];

        for (let tVal of YTICKS) {
            const ty = Ymin + (tVal / 1.2) * (Ymax - Ymin);
            const tick = new WebglLine(new ColorRGBA(0, 0, 0, 1), 2);

            tick.setX(0, Xmin);
            tick.setY(0, ty);

            tick.setX(1, Xmin + 0.03);
            tick.setY(1, ty);

            yTicks.push(tick);
            wglp.addLine(tick);
        }

        wglp.update();

        return {
            wglp,
            mainLine,
            xAxis,
            yAxis,
            yTicks,
            sampleCount: graphSampleCount,
            bounds: { Xmin, Xmax, Ymin, Ymax },
            ymaxValue: 1.2
        };
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

        function updateDebug() {
            const x = Number(debug.x.value);
            const y = Number(debug.y.value);
            const z = Number(debug.z.value);

            debug.xv.textContent = x;
            debug.yv.textContent = y;
            debug.zv.textContent = z;
        }

        emit.x.addEventListener("input", updateEmitter);
        emit.y.addEventListener("input", updateEmitter);
        emit.z.addEventListener("input", updateEmitter);

        listen.x.addEventListener("input", updateListener);
        listen.y.addEventListener("input", updateListener);
        listen.z.addEventListener("input", updateListener);

        heatmap.sens.addEventListener("input", updateHeatmap);


        debug.x.addEventListener("input", updateDebug);
        debug.y.addEventListener("input", updateDebug);
        debug.z.addEventListener("input", updateDebug);
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

        if (btn) {
            btn.addEventListener("click", () => {
                renderer.requestReload();
            });
        }
    }
}
