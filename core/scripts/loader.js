import { VoxelMeshBuilder } from "./voxel_mesh_builder.js";
import { generateRoom, hideWalls, RoomBlock, MATERIAL_COEFFICIENTS } from "./room_generation.js";

export class Loader {

    constructor(device, settings) {
        this.device = device;
        this.settings = settings;
        this.initialized = false;

        //geometry setup
        this.room_dimensions = settings.SIMULATION.room_dimensions;
        this.room_voxel_data = null;
        this.room_voxel_coefs = null;

        //voxelized ray tracing pipeline
        this.rayTracingComputeShaderURL = "./core/shaders/ray_compute.wgsl";
        this.rayPipeline = null;
        this.rayBindGroup = null
        this.voxelCoefBuffer = null;
        this.voxelToSolidIDBuffer = null;
        this.statsBuffer = null;
        this.statsReadbackBuffer = null;
        this.emptyStatsCPU = null;
        this.rayComputeUniformBuffer = null;
        this.rayComputeUniformBufferSize = 32 * 4;
        this.energyBandBuffer = null;
        this.energyBandCount = settings.SIMULATION.energy_bands;
        this.energyBandSizeBytes = 4;
        this.faceStats_u32 = null;
        this.faceStats_i32 = null;
        this.faceStats = null;

        //raster-vis geometry setup
        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.indexCount = 0;

        //raster-vis shadow pass
        this.shadowVertexShaderURL = "./core/shaders/shadow_vsh.wgsl";
        this.shadowPipeline = null;
        this.shadowBindGroup = null;
        this.shadowUniformBuffer = null;
        this.shadowUniformBufferSize = 16 * 4;
        this.shadowMap = null;
        this.shadowMapView = null;
        this.shadowSampler = null;
        this.shadowMapFormat = "depth32float";

        //raster-vis main pass
        this.vertexShaderURL = "./core/shaders/render_room_vsh.wgsl";
        this.fragmentShaderURL = "./core/shaders/render_room_fsh.wgsl";
        this.pipeline = null;
        this.bindGroup = null;
        this.uniformBuffer = null;
        this.uniformBufferSize = 64 * 4;
        this.depthTexture = null;
        this.depthFormat = "depth32float";
    }

    async init() {
        const ray_csh = await this.loadShader(this.rayTracingComputeShaderURL);
        const shadow_vsh = await this.loadShader(this.shadowVertexShaderURL);
        const main_vsh = await this.loadShader(this.vertexShaderURL);
        const main_fsh = await this.loadShader(this.fragmentShaderURL);
        
        this.createUniformBuffer();
        this.createShadowUniformBuffer();
        this.createRayComputeUniformBuffer();

        this.createEnergyBandBuffer();
        this.createShadowMap();

        this.room_voxel_data = generateRoom(this.room_dimensions);
        this.room_voxel_coefs = this.getVoxelCoefs(this.room_voxel_data);
        this.createVoxelCoefBuffer();
        this.createWritebackBuffers();

        const mesh = this.makeVisualizationMesh();
        this.createMeshBuffers(mesh);

        this.createRayComputePipeline(ray_csh);
        this.createShadowPipeline(shadow_vsh);
        this.createMainPipeline(main_vsh, main_fsh);

        this.initialized = true;
    }

    reload(){
        const mesh = this.makeVisualizationMesh();
        this.createMeshBuffers(mesh);
    }


    async readFaceStats() {
        const buf = this.statsReadbackBuffer;
        await buf.mapAsync(GPUMapMode.READ);

        const mapped = buf.getMappedRange();
        const u32 = new Uint32Array(mapped);

        const arr = this.faceStats;
        const faceCount = this.solidCount * 6;

        for (let f = 0; f < faceCount; f++) {
            arr[f].bounceCount    = u32[f * 2 + 0];
            arr[f].absorbedEnergy = u32[f * 2 + 1];
        }

        buf.unmap();
        return arr;
    }




    async loadShader(url) {
        const res = await fetch(url);
        return await res.text();
    }

    validPipelines() {
        if (!this.initialized) return false;
        if (!this.room_dimensions) return false;
        if (!this.room_voxel_data) return false;
        if (!this.room_voxel_coefs) return false;

        // Ray tracing pipeline
        if (!this.rayPipeline) return false;
        if (!this.rayBindGroup) return false;

        if (!this.voxelCoefBuffer) return false;
        if (!this.voxelToSolidIDBuffer) return false;

        if (!this.statsBuffer) return false;
        if (!this.statsReadbackBuffer) return false;
        if (!this.emptyStatsCPU) return false;

        if (!this.rayComputeUniformBuffer) return false;
        if (!this.energyBandBuffer) return false;
        if (this.energyBandCount <= 0) return false;
        if (this.energyBandSizeBytes <= 0) return false;

        // Raster-vis geometry
        if (!this.vertexBuffer) return false;
        if (!this.indexBuffer) return false;
        if (this.indexCount === 0) return false;

        // Shadow pipeline
        if (!this.shadowPipeline) return false;
        if (!this.shadowBindGroup) return false;
        if (!this.shadowUniformBuffer) return false;

        if (!this.shadowMap) return false;
        if (!this.shadowMapView) return false;
        if (!this.shadowSampler) return false;

        // Main pipeline
        if (!this.pipeline) return false;
        if (!this.bindGroup) return false;
        if (!this.uniformBuffer) return false;

        if (!this.depthTexture) return false;

        return true;
    }


    createDepthTexture(width, height) {
        this.depthTexture = this.device.createTexture({
            size: [width, height, 1],
            format: this.depthFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
    }

    createShadowMap() {
        const res = this.settings.LIGHTING.shadow_map.map_resolution;

        this.shadowMap = this.device.createTexture({
            size: [res, res, 1],
            format: this.shadowMapFormat,
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_SRC
        });


        this.shadowMapView = this.shadowMap.createView();

        this.shadowSampler = this.device.createSampler({
            compare: "less",
            magFilter: "linear",
            minFilter: "linear",
            type: "comparison"
        });
    }

    createEnergyBandBuffer() {
        this.energyBandBuffer = this.device.createBuffer({
            size: this.energyBandCount * this.energyBandSizeBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
    }


    getVoxelCoefs(voxelRGBA) {
        const sx = this.room_dimensions[0];
        const sy = this.room_dimensions[1];
        const sz = this.room_dimensions[2];

        const voxelCount = sx * sy * sz;
        const coefBuffer = new Float32Array(voxelCount);

        function blockTypeFromRGBA(r, g, b, a) {
            if (a === 0) return "AIR";

            if (r === RoomBlock.WALL.rgba[0] &&
                g === RoomBlock.WALL.rgba[1] &&
                b === RoomBlock.WALL.rgba[2]) {
                return "WALL";
            }

            if (r === RoomBlock.SOURCE.rgba[0] &&
                g === RoomBlock.SOURCE.rgba[1] &&
                b === RoomBlock.SOURCE.rgba[2]) {
                return "SOURCE";
            }

            return "AIR";
        }

        let v = 0;
        for (let z = 0; z < sz; z++)
        for (let y = 0; y < sy; y++)
        for (let x = 0; x < sx; x++) {
            const id = (z * sy * sx + y * sx + x) * 4;

            const r = voxelRGBA[id + 0];
            const g = voxelRGBA[id + 1];
            const b = voxelRGBA[id + 2];
            const a = voxelRGBA[id + 3];

            const type = blockTypeFromRGBA(r, g, b, a);
            coefBuffer[v++] = MATERIAL_COEFFICIENTS[type];
        }

        return coefBuffer;
    }

    createWritebackBuffers() {
        const sx = this.room_dimensions[0];
        const sy = this.room_dimensions[1];
        const sz = this.room_dimensions[2];

        const voxelRGBA = this.room_voxel_data;
        const voxelCount = sx * sy * sz;

        const voxelToSolidID = new Uint32Array(voxelCount);
        let solidID = 0;

        function isSolid(r, g, b, a) {
            if (a === 0) return false;
            return (
                r === RoomBlock.WALL.rgba[0] &&
                g === RoomBlock.WALL.rgba[1] &&
                b === RoomBlock.WALL.rgba[2]
            );
        }

        for (let i = 0; i < voxelCount; i++) {
            const base = i * 4;
            const r = voxelRGBA[base + 0];
            const g = voxelRGBA[base + 1];
            const b = voxelRGBA[base + 2];
            const a = voxelRGBA[base + 3];

            if (isSolid(r, g, b, a)) {
                voxelToSolidID[i] = solidID++;
            } else {
                voxelToSolidID[i] = 0xFFFFFFFF;
            }
        }

        const solidCount = solidID;
        const faceCount = solidCount * 6;

        const statsByteSize = faceCount * 8;
        const emptyStatsCPU = new ArrayBuffer(statsByteSize);

        this.voxelToSolidID_CPU = voxelToSolidID;
        this.solidCount = solidCount;
        this.statsByteSize = statsByteSize;

        //translation buffer
        this.voxelToSolidIDBuffer = this.device.createBuffer({
            size: voxelToSolidID.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(
            this.voxelToSolidIDBuffer,
            0,
            voxelToSolidID.buffer,
            voxelToSolidID.byteOffset,
            voxelToSolidID.byteLength
        );


        this.statsBuffer = this.device.createBuffer({
            size: statsByteSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        });

        //readback buffer
        this.statsReadbackBuffer = this.device.createBuffer({
            size: statsByteSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        this.emptyStatsCPU = emptyStatsCPU;

        //read back preallocation
        this.faceStats = new Array(faceCount);
        for (let i = 0; i < faceCount; i++) {
            this.faceStats[i] = {
                bounceCount: 0,
                absorbedEnergy: 0
            };
        }

    }



    packBuffer(gpuBuffer, byteSize, struct) {
        const buffer = new ArrayBuffer(byteSize);
        const f32buffer = new Float32Array(buffer);
        const u32buffer = new Uint32Array(buffer);

        const alignment = 4;
        const sizes = {
            float: 1,
            vec2: 2,
            vec3: 3,
            mat4: 16,
            u32 : 1,
            uvec3 : 3
        };

        let insert_pos = 0;
        let next_align = alignment;

        function set_buffer(type, val, pos) {
            if (type === "u32" || type === "uvec3") {
                u32buffer.set(val, pos)
            } else {
                f32buffer.set(val, pos);
            }
        }

        function insert_value(type, value){
            const s = sizes[type];
            //console.log("INS POS:", insert_pos, "NEXT ALIGN:", next_align, "TYPE:", type, "SIZE:", s, "VALUE: ", value);

            if (insert_pos + s <= next_align) {
                //console.log("insert_pos + s <= next_align: INSERTING AT", insert_pos);
                set_buffer(type, value, insert_pos);
                insert_pos += s;
                if (insert_pos == next_align) next_align += alignment;
            } else {
                //console.log("insert_pos + s > next_align");
                insert_pos = insert_pos + ((alignment - (insert_pos % alignment)) % alignment)
                //console.log("inserting at", insert_pos);
                set_buffer(type, value, insert_pos);
                insert_pos += s;
                next_align = insert_pos + ((alignment - (insert_pos % alignment)) % alignment)

            }
        }


        for (const key of Object.keys(struct)) {
            const field = struct[key];
            const type = field.kind;
            const val = field.value;
            insert_value(type, val);
        }

        //console.log("OUTPUT", buffer);
        this.device.queue.writeBuffer(gpuBuffer, 0, buffer);
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
            size: this.uniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    createShadowUniformBuffer() {
        this.shadowUniformBuffer = this.device.createBuffer({
            size: this.shadowUniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    createRayComputeUniformBuffer() {
        this.rayComputeUniformBuffer = this.device.createBuffer({
            size: this.rayComputeUniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    createVoxelCoefBuffer() {
        this.voxelCoefBuffer = this.device.createBuffer({
            size: this.room_voxel_coefs.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.device.queue.writeBuffer(
            this.voxelCoefBuffer,
            0,
            this.room_voxel_coefs.buffer,
            this.room_voxel_coefs.byteOffset,
            this.room_voxel_coefs.byteLength
        );
    }



    createMainPipeline(vsh, fsh) {
        const device = this.device;
        const vModule = device.createShaderModule({ code: vsh });
        const fModule = device.createShaderModule({ code: fsh });

        const bindGroupLayout = device.createBindGroupLayout({
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
            bindGroupLayouts: [bindGroupLayout]
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
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: this.shadowMapView },
                { binding: 2, resource: this.shadowSampler }
            ]
        });
    }

    createShadowPipeline(vsh) {
        const device = this.device;
        const vModule = device.createShaderModule({ code: vsh });

        const shadowBindGroupLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                }
            ]
        });

        const pipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [shadowBindGroupLayout]
        });

        this.shadowPipeline = device.createRenderPipeline({
            layout: pipelineLayout,

            vertex: {
                module: vModule,
                entryPoint: "vs_shadow_main",
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

            primitive: {
                topology: "triangle-list",
                cullMode: "none"
            },

            depthStencil: {
                format: this.shadowMapFormat,
                depthWriteEnabled: true,
                depthCompare: "less"
            }
        });

        this.shadowBindGroup = device.createBindGroup({
            layout: shadowBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.shadowUniformBuffer } }
            ]
        });
    }

    createRayComputePipeline(computeShaderCode) {
        const device = this.device;
        const cModule = device.createShaderModule({code: computeShaderCode});

        const rayBindGroupLayout = device.createBindGroupLayout({
            entries: [
                // 0: Uniforms (ray config, room dims, etc.)
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },

                // 1: Voxel absorption coefficients
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },

                // 2: Voxel->SolidID mapping table
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },

                // 3: Stats buffer (write-only / read-write on GPU)
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },

                // 4: energy bands
                {
                    binding: 4,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        const pipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [rayBindGroupLayout]
        });

        this.rayPipeline = device.createComputePipeline({
            layout: pipelineLayout,
            compute: {
                module: cModule,
                entryPoint: "cs_main"
            }
        });

        this.rayBindGroup = this.device.createBindGroup({
            layout: rayBindGroupLayout,
            entries: [
                // 0 - compute uniforms
                {
                    binding: 0,
                    resource: { buffer: this.rayComputeUniformBuffer }
                },

                // 1 - voxel absorption coefficients
                {
                    binding: 1,
                    resource: { buffer: this.voxelCoefBuffer }
                },

                // 2 - voxel -> solid ID table
                {
                    binding: 2,
                    resource: { buffer: this.voxelToSolidIDBuffer }
                },

                // 3 - face stats (accumulation output)
                {
                    binding: 3,
                    resource: { buffer: this.statsBuffer }
                },

                // 4 - energy bands
                {
                    binding: 4,
                    resource: { buffer: this.energyBandBuffer }
                }
            ]
        });
    }
}

