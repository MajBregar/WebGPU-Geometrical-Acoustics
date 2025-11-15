import { VoxelMeshBuilder } from "./voxel_mesh_builder.js";

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
        

        this.vertexShaderURL = "./core/shaders/render_room_vsh.wgsl";
        this.fragmentShaderURL = "./core/shaders/render_room_fsh.wgsl";

        this.depthTexture = null;
        this.depthFormat = "depth24plus";
    }

    async init() {
        const vsh = await this.loadShader(this.vertexShaderURL);
        const fsh = await this.loadShader(this.fragmentShaderURL);

        const voxelData = this.createVoxelRoom();
        this.createUniformBuffer();

        const mesh = this.buildVoxelMesh(voxelData);
        this.createMeshBuffers(mesh);

        this.createPipeline(vsh, fsh);
    }


    async loadShader(url) {
        const res = await fetch(url);
        return await res.text();
    }



    createVoxelRoom() {
        const room_dimensions = this.room_dimensions;
        const voxelData = new Uint8Array(room_dimensions[0] * room_dimensions[1] * room_dimensions[2] * 4);

        for (let z = 0; z < room_dimensions[2]; z++)
        for (let y = 0; y < room_dimensions[1]; y++)
        for (let x = 0; x < room_dimensions[0]; x++) {
            //temporary random voxel initialization

            const i = (z * room_dimensions[1] * room_dimensions[0] + y * room_dimensions[0] + x) * 4;

            const isFloor = (y === 0);

            const isWall =
                (x === 0) ||
                (z === 0) ||
                (z === room_dimensions[2] - 1) ||
                (x === room_dimensions[0] - 1 ? false : false); 

            const isCeiling = (y === room_dimensions[1] - 1);

            if (isFloor) {
                voxelData[i + 0] = 150;
                voxelData[i + 1] = 150;
                voxelData[i + 2] = 150;
                voxelData[i + 3] = 255;
                continue;
            }

            if (isWall) {
                voxelData[i + 0] = 200;
                voxelData[i + 1] = 50;
                voxelData[i + 2] = 50;
                voxelData[i + 3] = 255;
                continue;
            }

            if (x === room_dimensions[0] - 1) {
                voxelData[i + 3] = 0; 
                continue;
            }

            if (isCeiling) {
                voxelData[i + 3] = 0;
                continue;
            }

            if (Math.random() < 0.003) {
                voxelData[i + 0] = 50;
                voxelData[i + 1] = 200;
                voxelData[i + 2] = 50;
                voxelData[i + 3] = 255;
            } else {
                voxelData[i + 3] = 0;
            }
        }

        return voxelData;
    }

    createDepthTexture(width, height) {
        this.depthTexture = this.device.createTexture({
            size: [width, height, 1],
            format: this.depthFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
    }


    buildVoxelMesh(voxelData) {
        const builder = new VoxelMeshBuilder(this.room_dimensions);
        return builder.build(voxelData);
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
            size: 36 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }


    createPipeline(vsh, fsh) {
        const device = this.device;

        const vModule = device.createShaderModule({ code: vsh });
        const fModule = device.createShaderModule({ code: fsh });

        this.pipeline = device.createRenderPipeline({
            layout: "auto",

            vertex: {
                module: vModule,
                entryPoint: "vs_main",
                buffers: [{
                    arrayStride: 6 * 4,
                    attributes: [
                        { shaderLocation: 0, offset: 0,  format: "float32x3" },
                        { shaderLocation: 1, offset: 12, format: "float32x3" }
                    ]
                }]
            },

            fragment: {
                module: fModule,
                entryPoint: "fs_main",
                targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }]
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
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: this.uniformBuffer }
            }]
        });
    }


}

