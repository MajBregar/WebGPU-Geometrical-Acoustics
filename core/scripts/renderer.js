
import { lookAt, perspective, ortographic, matMul, normalize3 } from "./matrix_helpers.js";
import { mat4, vec3 } from "./glm.js"

function type_mat4(v)  { return { kind:"mat4",  value:v }; }
function type_vec2(v)  { return { kind:"vec2",  value:v }; }
function type_vec3(v)  { return { kind:"vec3",  value:v }; }
function type_float(v) { return { kind:"float", value: [v] }; }


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
        const viewProj = matMul(proj, view);
        const invViewProj = mat4.create();

        const light = settings.LIGHTING;
        const smap = light.shadow_map;

        const lightDir =  normalize3(light.direction);
        const lightColor = light.color;
        const lightIntensity = light.intensity;

        const lightPos = [
            dims[0] * 0.5 - lightDir[0] * smap.distance,
            dims[1] * 0.5 - lightDir[1] * smap.distance,
            dims[2] * 0.5 - lightDir[2] * smap.distance
        ];

        const light_view = lookAt(lightPos, target, up);
        const light_proj = ortographic(smap.half, smap.near, smap.far);
        const light_mat = matMul(light_proj, light_view);

        const uniforms = {
            viewProj: type_mat4(viewProj),
            invViewProj: type_mat4(invViewProj),
            screenSize: type_vec2([w, h]),
            lightDir: type_vec3(lightDir),
            lightColor: type_vec3(lightColor),
            lightIntensity: type_float(lightIntensity),
            shadowMatrix: type_mat4(light_mat),
            shadowBias: type_float(smap.bias),
            shadowNormalBias: type_float(smap.normal_bias),
            ambientLight: type_float(light.ambient_light)
        };

        const shadow_uniforms = {
            shadowMatrix: type_mat4(light_mat)
        };
        
        loader.packBuffer(loader.uniformBuffer, loader.uniformBufferSize, uniforms);
        loader.packBuffer(loader.shadowUniformBuffer, loader.shadowUniformBufferSize, shadow_uniforms);

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
