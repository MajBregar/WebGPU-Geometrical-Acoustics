import { VoxelMeshBuilder } from "./voxel_mesh_builder.js";
import { generateRoom, hideWalls } from "./room_generation.js";

export class Loader {

    constructor(device, settings) {
        this.device = device;
        this.settings = settings;

        this.pipeline = null;
        this.bindGroup = null;
        this.uniformBuffer = null;

        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.indexCount = 0;

        this.room_dimensions = settings.SIMULATION.room_dimensions;
        this.room_voxel_data = null;

        this.vertexShaderURL = "./core/shaders/render_room_vsh.wgsl";
        this.fragmentShaderURL = "./core/shaders/render_room_fsh.wgsl";

        this.depthTexture = null;
        this.depthFormat = "depth24plus";

        this.shadowMap = null;
        this.shadowMapView = null;
        this.shadowSampler = null;
        this.shadowMapFormat = "depth32float";

    }

    async init() {
        const vsh = await this.loadShader(this.vertexShaderURL);
        const fsh = await this.loadShader(this.fragmentShaderURL);

        this.createUniformBuffer();

        const shadowRes = this.settings.LIGHTING.shadow_map.map_resolution;
        this.createShadowMap(shadowRes);

        this.room_voxel_data = generateRoom(this.room_dimensions);
        const mesh = this.makeVisualizationMesh();
        this.createMeshBuffers(mesh);

        this.createPipeline(vsh, fsh);
    }


    async loadShader(url) {
        const res = await fetch(url);
        return await res.text();
    }

    createDepthTexture(width, height) {
        this.depthTexture = this.device.createTexture({
            size: [width, height, 1],
            format: this.depthFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
    }

    createShadowMap(resolution) {
        this.shadowMap = this.device.createTexture({
            size: [resolution, resolution, 1],
            format: this.shadowMapFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });

        this.shadowMapView = this.shadowMap.createView();

        this.shadowSampler = this.device.createSampler({
            compare: "less",
            magFilter: "linear",
            minFilter: "linear"
        });
    }


     makeVisualizationMesh(){
        const raw_voxel_data = this.room_voxel_data;
        const hide_walls_flags = this.settings.SIMULATION.hide_walls;
        const dimensions = this.room_dimensions;

        const filtered_voxel_data = hideWalls(raw_voxel_data, hide_walls_flags, dimensions);

        const builder = new VoxelMeshBuilder(dimensions);
        return builder.build(filtered_voxel_data);
     }


    createMeshBuffers(mesh) {
        const device = this.device;

        this.indexCount = mesh.indexCount;

        this.vertexBuffer = device.createBuffer({
            size: mesh.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(this.vertexBuffer.getMappedRange()).set(mesh.vertices);
        this.vertexBuffer.unmap();

        this.indexBuffer = device.createBuffer({
            size: mesh.indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Uint32Array(this.indexBuffer.getMappedRange()).set(mesh.indices);
        this.indexBuffer.unmap();
    }


    createUniformBuffer() {
        this.uniformBuffer = this.device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    createPipeline(vsh, fsh) {
        const device = this.device;
        const vModule = device.createShaderModule({ code: vsh });
        const fModule = device.createShaderModule({ code: fsh });

        this.bindGroupLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: "comparison" }
                }
            ]
        });

        const pipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [this.bindGroupLayout]
        });


        this.pipeline = device.createRenderPipeline({
            layout: pipelineLayout,

            vertex: {
                module: vModule,
                entryPoint: "vs_main",
                buffers: [
                    {
                        arrayStride: 9 * 4,
                        attributes: [
                            { shaderLocation: 0, offset: 0,  format: "float32x3" },
                            { shaderLocation: 1, offset: 12, format: "float32x3" },
                            { shaderLocation: 2, offset: 24, format: "float32x3" }
                        ]
                    }
                ]
            },

            fragment: {
                module: fModule,
                entryPoint: "fs_main",
                targets: [
                    { format: navigator.gpu.getPreferredCanvasFormat() }
                ]
            },

            primitive: {
                topology: "triangle-list",
                cullMode: "none"
            },

            depthStencil: {
                format: this.depthFormat,
                depthWriteEnabled: true,
                depthCompare: "less"
            }
        });

        this.bindGroup = device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: this.shadowMapView },
                { binding: 2, resource: this.shadowSampler }
            ]
        });
    }

    reload(){
        const mesh = this.makeVisualizationMesh();
        this.createMeshBuffers(mesh);
    }

}

