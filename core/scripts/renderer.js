
import { mulMat4, invertMat4 } from "./math.js";
import { lookAt, perspective } from "./matrix_helpers.js";

export class Renderer {

    constructor(canvas, device, loader, controller, settings) {
        this.canvas = canvas;
        this.device = device;
        this.loader = loader;
        this.controller = controller;
        this.settings = settings;

        this.context = null;
        this.format = null;
        this.initialized = false;

        this.depthView = null;
        this.depthWidth = 0;
        this.depthHeight = 0;

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

        this.resizeDepthTexture();

        this.initialized = true;
    }

    resizeDepthTexture() {
        const loader = this.loader;
        const width = this.canvas.width;
        const height = this.canvas.height;

        loader.createDepthTexture(width, height);
        this.depthView = loader.depthTexture.createView();

        this.depthWidth = width;
        this.depthHeight = height;
    }

    updateUniforms() {
        const loader = this.loader;
        const settings = this.settings;
        const room_dimensions = loader.room_dimensions;
        const ctrl = this.controller;
        const aspect = this.canvas.width / this.canvas.height;

        const yaw   = ctrl.getYaw();
        const pitch = ctrl.getPitch();
        const dist  = ctrl.getZoom();

        const camera_pos = [
            Math.cos(pitch) * Math.cos(yaw) * dist,
            Math.sin(pitch) * dist,
            Math.cos(pitch) * Math.sin(yaw) * dist
        ];

        const target = [
            room_dimensions[0] * 0.5,
            room_dimensions[1] * 0.5,
            room_dimensions[2] * 0.5
        ];

        const up = [0, 1, 0];

        const view = lookAt(camera_pos, target, up);
        const proj = perspective(
            settings.CAMERA.fov,
            aspect,
            settings.CAMERA.near,
            settings.CAMERA.far
        );

        const viewProj = mulMat4(proj, view);
        const invViewProj = invertMat4(viewProj);

        const light = settings.LIGHTING;
        const sh = light.shadow_map;

        const lightDir = light.direction;
        const lightColor = light.color;
        const lightIntensity = light.intensity;

        const shadowMat = new Float32Array([
            1,0,0,0,
            0,1,0,0,
            0,0,1,0,
            0,0,0,1
        ]);

        const uni = new Float32Array(64);

        uni.set(viewProj, 0);
        uni.set(invViewProj, 16);

        uni[32] = this.canvas.width;
        uni[33] = this.canvas.height;

        uni[34] = lightDir[0];
        uni[35] = lightDir[1];
        uni[36] = lightDir[2];
        uni[38] = lightColor[0];
        uni[39] = lightColor[1];
        uni[40] = lightColor[2];
        uni[41] = lightIntensity;

        uni.set(shadowMat, 42);

        uni[58] = sh.bias;
        uni[59] = sh.normal_bias;

        this.device.queue.writeBuffer(
            loader.uniformBuffer,
            0,
            uni
        );
    }



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

        
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;

        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
            this.resizeDepthTexture();
        }

        
        this.updateUniforms();
        const device = this.device;
        const encoder = device.createCommandEncoder();

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
