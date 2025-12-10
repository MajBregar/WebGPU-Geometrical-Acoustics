
import { lookAt, perspective, ortographic, matMul, normalize3 } from "./matrix_helpers.js";
import { mat4, vec3 } from "./glm.js"

function type_mat4(v)  { return { kind:"mat4",  value:v }; }
function type_vec2(v)  { return { kind:"vec2",  value:v }; }
function type_vec3(v)  { return { kind:"vec3",  value:v }; }
function type_float(v) { return { kind:"float", value: [v] }; }
function type_u32(v) { return { kind:"u32", value: [v] }; }
function type_uvec3(v)  { return { kind:"uvec3",  value:v }; }



export class Renderer {

    constructor(canvas, device, loader, controller, sound_processor, settings) {
        this.canvas = canvas;
        this.device = device;
        this.loader = loader;
        this.controller = controller;
        this.sound_processor = sound_processor;
        this.settings = settings;

        this.context = null;
        this.format = null;
        this.initialized = false;
        this.reload = false;

        this.depthView = null;
        this.depthWidth = 0;
        this.depthHeight = 0;

        this.listenerEnergy = [];

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

        const up = [0, 1, 0];
        const target = [
            dims[0] * 0.5,
            dims[1] * 0.5,
            dims[2] * 0.5
        ];
        const camera_pos = [
            target[0] + Math.cos(pitch) * Math.cos(yaw) * dist,
            target[1] + Math.sin(pitch) * dist,
            target[2] + Math.cos(pitch) * Math.sin(yaw) * dist
        ];

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

        const sim = settings.SIMULATION;
        const ray_uniforms = {
            room_dims : type_uvec3(sim.room_dimensions),
            max_steps : type_u32(sim.max_ray_steps),

            ray_origin : type_vec3(sim.emitter_position),
            voxel_size_meters : type_float(sim.voxel_scale_meters),

            ray_count : type_u32(sim.ray_count),
            energy_bands : type_u32(sim.energy_bands),
            energy_cutoff : type_float(sim.ray_energy_min),
            face_count : type_u32(loader.faceCount),

            listener_pos: type_vec3(sim.listener_position),
            listener_radius : type_float(sim.listener_radius),

            precision_adj: type_float(sim.unit_precision_adjustment)
        }

        loader.packBuffer(loader.rayComputeUniformBuffer, loader.rayComputeUniformBufferSize, ray_uniforms);
    }


    rgba_to_u32([r, g, b, a]) {
        return ((r & 0xFF) << 24) |
            ((g & 0xFF) << 16) |
            ((b & 0xFF) <<  8) |
            ((a & 0xFF) <<  0);
    }

    updateColors(face_data) {
        const loader = this.loader;
        const settings = this.settings;
        const hidden_walls = loader.hiddenWallFlags_CPU;

        const defaultRGB = [120, 120, 120];
        const faceCount = loader.faceCount;
        const rayCount = settings.SIMULATION.ray_count;
        const vis_coef = settings.SIMULATION.heatmap_sensitivity;
        const unit_precision_adjustment = settings.SIMULATION.unit_precision_adjustment;
        
        var starting_energy = 0.0;
        for (let i = 0; i < loader.energyBands_CPU.length; i++){
            starting_energy += loader.energyBands_CPU[i];
        }
        starting_energy = starting_energy * unit_precision_adjustment;
        

        for (let faceID = 0; faceID < faceCount; faceID++) {
            const face = face_data[faceID];

            const hide_alpha = hidden_walls[faceID] ? 0 : 255;

            const enery_absorbed = face.absorbedEnergy;

            const energy_color = (enery_absorbed / starting_energy) * Math.pow(10, vis_coef) * 255;

            const bounces = face.bounceCount;
            const bounce_color = (bounces / 10) * 255;
            
            
            loader.faceColors_CPU_Write[faceID] = this.rgba_to_u32([
                energy_color >= 255 ? 255 : energy_color,
                defaultRGB[1],
                defaultRGB[2],
                hide_alpha
            ]);
        }

        loader.updateFaceColorBuffer();
    }

    updateSpherePositions(){
        const sim = this.settings.SIMULATION;
        const loader = this.loader;
        const emitter_pos = sim.emitter_position;
        const listener_pos = sim.listener_position;
        const instance_buffer_cpu = this.loader.sphereInstanceBuffer_CPU_Write;

        instance_buffer_cpu[12] = emitter_pos[0];
        instance_buffer_cpu[13] = emitter_pos[1];
        instance_buffer_cpu[14] = emitter_pos[2];

        instance_buffer_cpu[29] = listener_pos[0];
        instance_buffer_cpu[30] = listener_pos[1];
        instance_buffer_cpu[31] = listener_pos[2];
        
        this.device.queue.writeBuffer(loader.sphereInstanceBuffer_GPU_Buffer, 0, instance_buffer_cpu);
    }


    updateInputEnergyBuffer() {
        const loader = this.loader;
        const energy = loader.energyBands_CPU;
        this.device.queue.writeBuffer(loader.energyBandBuffer, 0, energy);
    }


    debug_u32_to_vec3(code, roomSize) {
        const qx =  code         & 0x3FF;
        const qy = (code >> 10) & 0x3FF;
        const qz = (code >> 20) & 0x3FF; 
        const x = (qx / 1023) * roomSize[0];
        const y = (qy / 1023) * roomSize[1];
        const z = (qz / 1023) * roomSize[2];
        return [ x, y, z ];
    }

    requestReload(){
        this.reload = true;
    }

    getListenerEnergy(){
        return this.listenerEnergy;
    }

    handleReload(){
        this.loader.reload();
        this.reload = false;
    }

    async renderFrame() {
        if (!this.initialized) return;

        if (this.reload) {
            this.handleReload();
        }

        const loader = this.loader;

        if (!loader.validPipelines()) return;

        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;

        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
            this.resizeDepthTexture();
        }

        const device = this.device;
        const settings = this.settings;

        this.updateUniforms();
        this.updateInputEnergyBuffer();

        // ----------------------------------------------------
        // PASS 0: SOUND RAY COMPUTE SHADER
        // ----------------------------------------------------
        const encoder = device.createCommandEncoder();

        device.queue.writeBuffer(
            loader.faceStats_GPU_Buffer,
            0,
            loader.emptyFaceStats_CPU
        );

        encoder.copyBufferToBuffer(
            loader.listenerClear_GPU_Buffer,
            0,
            loader.listener_GPU_Buffer,
            0,
            loader.energyBandCount * 4
        );


        const computePass = encoder.beginComputePass();
        computePass.setPipeline(loader.rayPipeline);
        computePass.setBindGroup(0, loader.rayBindGroup);

        const workgroups = Math.ceil(settings.SIMULATION.ray_count / 64);
        computePass.dispatchWorkgroups(workgroups);
        computePass.end();
        
        encoder.copyBufferToBuffer(
            loader.faceStats_GPU_Buffer,
            0,
            loader.faceStats_GPU_ReadBack,
            0,
            loader.statsByteSize
        );

        encoder.copyBufferToBuffer(
            loader.listener_GPU_Buffer,
            0,
            loader.listener_GPU_ReadBack,
            0,
            loader.energyBandCount * 4
        );

        device.queue.submit([encoder.finish()]);


        const faces = await loader.readFaceStats();
        const listenerBands = await loader.readListenerBands();
        this.listenerEnergy = this.sound_processor.process_listener_sound(listenerBands);
        
        this.updateColors(faces);
        this.updateSpherePositions();
        

        // ----------------------------------------------------
        // PASS 1: SHADOW MAP
        // ----------------------------------------------------

        const encoder2 = device.createCommandEncoder();

        const shadowPass = encoder2.beginRenderPass({
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

        shadowPass.setVertexBuffer(0, loader.vertexBuffer_GPU_Buffer);
        shadowPass.setVertexBuffer(1, loader.dummyInstanceBuffer_GPU_Buffer);
        shadowPass.setIndexBuffer(loader.indexBuffer_GPU_Buffer, "uint32");
        shadowPass.drawIndexed(loader.indexCount);

        shadowPass.setVertexBuffer(0, loader.sphereVertexBuffer_GPU_Buffer);
        shadowPass.setVertexBuffer(1, loader.sphereInstanceBuffer_GPU_Buffer);
        shadowPass.setIndexBuffer(loader.sphereIndexBuffer_GPU_Buffer, "uint32");
        shadowPass.drawIndexed(loader.sphereIndexCount, 2);

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

        const pass = encoder2.beginRenderPass({
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

        pass.setVertexBuffer(0, loader.vertexBuffer_GPU_Buffer);
        pass.setVertexBuffer(1, loader.dummyInstanceBuffer_GPU_Buffer);
        pass.setIndexBuffer(loader.indexBuffer_GPU_Buffer, "uint32");
        pass.drawIndexed(loader.indexCount);

        pass.setVertexBuffer(0, loader.sphereVertexBuffer_GPU_Buffer);
        pass.setVertexBuffer(1, loader.sphereInstanceBuffer_GPU_Buffer);
        pass.setIndexBuffer(loader.sphereIndexBuffer_GPU_Buffer, "uint32");
        pass.drawIndexed(loader.sphereIndexCount, 2);

        pass.end();


        device.queue.submit([encoder2.finish()]);
    }


}
