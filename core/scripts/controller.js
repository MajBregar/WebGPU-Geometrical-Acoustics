//
// controller.js
// Handles all user input for camera control
//

export class Controller {

    constructor(canvas) {
        this.canvas = canvas;

        // --------------------------------------------------------
        // Internal camera control state
        // --------------------------------------------------------
        this.yaw = 0;        // horizontal rotation
        this.pitch = 0;      // vertical rotation
        this.zoom = 10;     // distance from center

        this.dragging = false;
        this.lastX = 0;
        this.lastY = 0;

        // sensitivity controls
        this.rotateSpeed = 0.003;
        this.zoomSpeed = 0.02;

        this.initEventHandlers();
    }


    initEventHandlers() {

        // Mouse press
        this.canvas.addEventListener("mousedown", (e) => {
            this.dragging = true;
            this.lastX = e.clientX;
            this.lastY = e.clientY;
        });

        // Stop drag
        window.addEventListener("mouseup", () => {
            this.dragging = false;
        });

        // Mouse move while dragging
        window.addEventListener("mousemove", (e) => {
            if (!this.dragging) return;

            const dx = e.clientX - this.lastX;
            const dy = e.clientY - this.lastY;

            this.lastX = e.clientX;
            this.lastY = e.clientY;

            this.yaw   += dx * this.rotateSpeed;
            this.pitch += dy * this.rotateSpeed;

            // Clamp pitch to avoid flip
            const maxPitch = Math.PI / 2 - 0.05;
            this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
        });

        // Scroll wheel zoom
        this.canvas.addEventListener("wheel", (e) => {
            this.zoom += e.deltaY * this.zoomSpeed;
            this.zoom = Math.max(0, Math.min(5000, this.zoom));
            e.preventDefault();
        }, { passive: false });
    }

    // --------------------------------------------------------
    // Provide a clean interface for renderer
    // --------------------------------------------------------

    getYaw()   { return this.yaw; }
    getPitch() { return this.pitch; }
    getZoom()  { return this.zoom; }
}
