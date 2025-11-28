
import { mulMat4, invertMat4, normalize3, length3 } from "./math.js";
import { lookAt, perspective, ortographic } from "./matrix_helpers.js";
import {mat4} from "./glm.js"

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
        this.reload = false;

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
        const ctrl = this.controller;
        const dims = loader.room_dimensions;

        const w = this.canvas.width;
        const h = this.canvas.height;
        const aspect = w / h;

        const yaw   = ctrl.getYaw();
        const pitch = ctrl.getPitch();
        const dist  = ctrl.getZoom();

        const camera_pos = [
            Math.cos(pitch) * Math.cos(yaw) * dist,
            Math.sin(pitch) * dist,
            Math.cos(pitch) * Math.sin(yaw) * dist
        ];

        const target = [
            dims[0] * 0.5,
            dims[1] * 0.5,
            dims[2] * 0.5
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


        const uni = new Float32Array(64);

        uni.set(viewProj, 0);
        uni.set(invViewProj, 16);

        uni[32] = w;
        uni[33] = h;

        uni[36] = lightDir[0];
        uni[37] = lightDir[1];
        uni[38] = lightDir[2];


        uni[40] = lightColor[0];
        uni[41] = lightColor[1];
        uni[42] = lightColor[2];

        uni[43] = lightIntensity;




        
        const lightDirNorm = normalize3(settings.LIGHTING.direction);
        
        const lightDistance = 1500;
        const lightPos = [
            dims[0] * 0.5 - lightDirNorm[0] * lightDistance,
            dims[1] * 0.5 - lightDirNorm[1] * lightDistance,
            dims[2] * 0.5 - lightDirNorm[2] * lightDistance
        ];

        const center = [
            dims[0] * 0.5,
            dims[1] * 0.5,
            dims[2] * 0.5
        ];

        const light_view = mat4.lookAt(mat4.create(), lightPos, center, [0,1,0]);
        const half = 500;
        const light_proj = mat4.orthoZO(mat4.create(), -half, half, -half, half, 1, 4000);
        const light_mat = mat4.multiply(mat4.create(), light_proj, light_view);




        uni.set(light_mat, 44);

        uni[60] = sh.bias;
        uni[61] = sh.normal_bias;

        this.device.queue.writeBuffer(loader.uniformBuffer, 0, uni);
        this.device.queue.writeBuffer(loader.shadowUniformBuffer, 0, light_mat);

    }

    requestReload(){
        this.reload = true;
    }

    handleReload(){
        this.loader.reload();
        this.reload = false;
    }

    renderFrame() {
        if (!this.initialized) return;

        if (this.reload) {
            this.handleReload();
        }

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

        
        // ----------------------------------------------------
        // PASS 1: SHADOW MAP RENDERING
        // ----------------------------------------------------
        
        
        const shadowPass = encoder.beginRenderPass({
            colorAttachments: [],
            depthStencilAttachment: {
                view: loader.shadowMapView,
                depthLoadOp: "clear",
                depthClearValue: 1.0,
                depthStoreOp: "store"
            }
        });


        shadowPass.setPipeline(loader.shadowPipeline);
        shadowPass.setBindGroup(0, loader.shadowBindGroup);
        shadowPass.setVertexBuffer(0, loader.vertexBuffer);
        shadowPass.setIndexBuffer(loader.indexBuffer, "uint32");
        shadowPass.drawIndexed(loader.indexCount);
        shadowPass.end();
        


    
        // ----------------------------------------------------
        // PASS 2: MAIN FORWARD RENDERING
        // ----------------------------------------------------
        
        const bgc = this.settings.SIMULATION.background_color;
        const background_color = [
            bgc[0] / 255,
            bgc[1] / 255,
            bgc[2] / 255,
            bgc[3] / 255
        ];

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: {
                    r: background_color[0],
                    g: background_color[1],
                    b: background_color[2],
                    a: background_color[3]
                },
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
