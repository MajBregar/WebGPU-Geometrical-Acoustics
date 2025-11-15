
export class Controller {

    constructor(canvas, settings) {
        this.canvas = canvas;
        this.settings = settings;

        this.yaw = settings.CONTROLS.start_yaw;
        this.pitch = settings.CONTROLS.start_pitch;
        this.zoom = settings.CONTROLS.start_zoom;

        this.dragging = false;
        this.lastX = 0;
        this.lastY = 0;

        this.rotateSpeed = settings.CONTROLS.mouse_sensitivity;
        this.zoomSpeed = settings.CONTROLS.zoom_sensitivity;

        this.initEventHandlers();
    }


    initEventHandlers() {

        this.canvas.addEventListener("mousedown", (e) => {
            //start rotation drag
            this.dragging = true;
            this.lastX = e.clientX;
            this.lastY = e.clientY;
        });

        window.addEventListener("mouseup", () => {
            //end rotation drag
            this.dragging = false;
        });

        window.addEventListener("mousemove", (e) => {
            //mouse drag rotation
            if (!this.dragging) return;

            const dx = e.clientX - this.lastX;
            const dy = e.clientY - this.lastY;

            this.lastX = e.clientX;
            this.lastY = e.clientY;

            this.yaw   += dx * this.rotateSpeed;
            this.pitch += dy * this.rotateSpeed;

            const maxPitch = Math.PI / 2 - 0.05;
            this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
        });

        this.canvas.addEventListener("wheel", (e) => {
            this.zoom += e.deltaY * this.zoomSpeed;
            this.zoom = Math.max(this.settings.CONTROLS.min_zoom, Math.min(this.settings.CONTROLS.max_zoom, this.zoom));
            e.preventDefault();
        }, { passive: false });
    }

    getYaw()   { return this.yaw; }
    getPitch() { return this.pitch; }
    getZoom()  { return this.zoom; }
}
