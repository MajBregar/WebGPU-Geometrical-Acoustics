//
// renderer.js
// Renderer that draws voxel mesh created by Loader
//

import { mulMat4, invertMat4 } from "./math.js";
import { lookAt, perspective } from "./matrix_helpers.js";

export class Renderer {

    constructor(canvas, device, loader, controller) {
        this.canvas = canvas;
        this.device = device;
        this.loader = loader;
        this.controller = controller;

        this.context = null;
        this.format = null;
        this.initialized = false;

        this.depthView = null;

        this.init();
    }

    init() {
        this.context = this.canvas.getContext("webgpu");
        this.format = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: "opaque"
        });

        // ----------------------------------------------------
        // Create depth texture sized for the canvas
        // ----------------------------------------------------
        this.resizeDepthTexture();

        this.initialized = true;
    }

    // --------------------------------------------------------
    // Resize depth texture when canvas size changes
    // --------------------------------------------------------
    resizeDepthTexture() {
        const loader = this.loader;

        loader.createDepthTexture(this.canvas.width, this.canvas.height);
        this.depthView = loader.depthTexture.createView();
    }

    // --------------------------------------------------------
    // Build and upload camera matrices to uniform buffer
    // --------------------------------------------------------
    updateUniforms() {
        const loader = this.loader;
        const size = loader.SIZE;
        const ctrl = this.controller;

        const aspect = this.canvas.width / this.canvas.height;

        // Camera angles
        const yaw   = ctrl.getYaw();
        const pitch = Math.max(-1.5, Math.min(1.5, ctrl.getPitch()));
        const dist  = ctrl.getZoom();

        const camera_pos = [
            Math.cos(pitch) * Math.cos(yaw) * dist,
            Math.sin(pitch) * dist,
            Math.cos(pitch) * Math.sin(yaw) * dist
        ];

        const target = [size / 2, size / 2, size / 2];
        const up = [0, 1, 0];

        const view = lookAt(camera_pos, target, up);

        const proj = perspective(
            Math.PI / 2,
            aspect,
            0.1,
            500.0
        );

        const viewProj = mulMat4(proj, view);
        const invViewProj = invertMat4(viewProj);

        // Upload uniforms (144 bytes)
        const uni = new Float32Array(36);
        uni.set(viewProj, 0);
        uni.set(invViewProj, 16);
        uni[32] = this.canvas.width;
        uni[33] = this.canvas.height;

        this.device.queue.writeBuffer(
            loader.uniformBuffer,
            0,
            uni.buffer,
            0,
            uni.byteLength
        );
    }

    // --------------------------------------------------------
    // Render frame
    // --------------------------------------------------------
    renderFrame() {
        if (!this.initialized) return;

        const loader = this.loader;

        if (!loader.pipeline ||
            !loader.bindGroup ||
            !loader.vertexBuffer ||
            !loader.indexBuffer ||
            loader.indexCount === 0)
        {
            return;
        }

        // In case canvas resized: ensure depth texture matches
        if (!this.depthView ||
            this.depthView.width !== this.canvas.width ||
            this.depthView.height !== this.canvas.height)
        {
            this.resizeDepthTexture();
        }

        // Upload uniforms
        this.updateUniforms();

        const device = this.device;
        const encoder = device.createCommandEncoder();

        // ----------------------------------------------------
        // Render pass WITH DEPTH ATTACHMENT
        // ----------------------------------------------------
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: { r: 1, g: 1, b: 1, a: 1 },
                storeOp: "store"
            }],

            depthStencilAttachment: {
                view: this.depthView,
                depthLoadOp: "clear",
                depthClearValue: 1.0,
                depthStoreOp: "store"
            }
        });

        pass.setPipeline(loader.pipeline);
        pass.setBindGroup(0, loader.bindGroup);
        pass.setVertexBuffer(0, loader.vertexBuffer);
        pass.setIndexBuffer(loader.indexBuffer, "uint32");

        pass.drawIndexed(loader.indexCount);

        pass.end();
        device.queue.submit([encoder.finish()]);
    }
}
