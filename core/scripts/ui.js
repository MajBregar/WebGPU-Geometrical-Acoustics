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

        const renderer = this.renderer;

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
