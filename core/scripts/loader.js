import { VoxelMeshBuilder } from "./voxel_mesh_builder.js";
import { generateRoom, RoomBlock, MATERIAL_COEFFICIENTS } from "./room_generation.js";

export class Loader {

    constructor(device, settings) {
        this.device = device;
        this.settings = settings;
        this.initialized = false;
        this.mesh_builder = null;

        //constants
        this.vertexSize4Bytes = 7;

        //shader code paths
        this.rayTracingComputeShaderURL = "./core/shaders/ray_compute.wgsl";
        this.shadowVertexShaderURL = "./core/shaders/shadow_vsh.wgsl";
        this.vertexShaderURL = "./core/shaders/render_room_vsh.wgsl";
        this.fragmentShaderURL = "./core/shaders/render_room_fsh.wgsl";

        //geometry
        this.room_dimensions = settings.SIMULATION.room_dimensions;
        this.room_voxel_data = null;
        this.room_voxel_coefs = null;
        this.faceCount = 0;
        this.indexCount = 0;
        this.vertexCount = 0;


        //CPU buffers
        this.faceColors_CPU_Write = null;
        this.vertexData_CPU = null;
        this.indexData_CPU = null;
        this.emptyFaceStats_CPU = null;
        this.faceToVoxelID_CPU = null;
        this.voxelToFaceID_CPU = null;
        this.hiddenWallFlags_CPU = null;
        this.energyBands_CPU = null;



        //GPU buffers
        this.faceColors_GPU_Buffer = null;
        this.vertexBuffer_GPU_Buffer = null;
        this.indexBuffer_GPU_Buffer = null;
        this.voxelCoefs_GPU_Buffer = null;
        this.voxelToFaceID_GPU_Buffer = null;
        this.faceStats_GPU_Buffer = null;
        this.faceStats_GPU_ReadBack = null;

        

        //pipeline bind groups
        this.rayBindGroup = null;

        //pipelines
        this.rayPipeline = null;




        this.statsByteSize = 0;
        this.faceStats = null;

        this.rayComputeUniformBuffer = null;
        this.rayComputeUniformBufferSize = 32 * 4;

        this.energyBandBuffer = null;
        this.energyBandCount = settings.SIMULATION.energy_bands;
        this.energyBandSizeBytes = 4;

        this.faceStats_u32 = null;
        this.faceStats_i32 = null;

        // Hidden walls

        // Shadow pass
        this.shadowPipeline = null;
        this.shadowBindGroup = null;
        this.shadowUniformBuffer = null;
        this.shadowUniformBufferSize = 16 * 4;
        this.shadowMap = null;
        this.shadowMapView = null;
        this.shadowSampler = null;
        this.shadowMapFormat = "depth32float";

        // Main pass

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
        
        this.mesh_builder = new VoxelMeshBuilder(this.room_dimensions);

        this.createUniformBuffer();
        this.createShadowUniformBuffer();
        this.createRayComputeUniformBuffer();

        this.createEnergyBandBuffer();
        this.createShadowMap();

        this.room_voxel_data = generateRoom(this.room_dimensions);
        this.room_voxel_coefs = this.getVoxelCoefs(this.room_voxel_data);
        this.createVoxelCoefBuffer();
        this.createWritebackBuffers();


        this.createMeshAndBuffers();
        this.createFaceColorBuffer();
        this.createSphereBuffers();
        this.createInstanceBuffer();


        this.createRayComputePipeline(ray_csh);
        this.createShadowPipeline(shadow_vsh);
        this.createMainPipeline(main_vsh, main_fsh);

        this.initialized = true;
    }

    reload(){
        const builder = this.mesh_builder;
        const face_to_voxel = this.faceToVoxelID_CPU;
        const hide_walls = this.settings.SIMULATION.hide_walls;
        this.hiddenWallFlags_CPU = builder.buildHiddenFaceMask(face_to_voxel, hide_walls);
    }

    

    async readFaceStats() {
        const buf = this.faceStats_GPU_ReadBack;
        await buf.mapAsync(GPUMapMode.READ);

        const mapped = buf.getMappedRange();
        const u32 = new Uint32Array(mapped);

        const arr = this.faceStats;
        const faceCount = this.faceCount;

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
        if (!this.vertexBuffer_GPU_Buffer) return false;
        if (!this.indexBuffer_GPU_Buffer) return false;
        if (this.indexCount === 0) return false;
        if (!this.vertexData_CPU) return false;
        if (!this.indexData_CPU) return false;
        if (!this.faceColors_GPU_Buffer) return false;
        if (!this.faceColors_CPU_Write) return false;
        if (this.faceCount === 0) return false;
        if (!this.hiddenWallFlags_CPU) return false;
        if (!this.rayPipeline) return false;
        if (!this.rayBindGroup) return false;
        if (!this.voxelCoefs_GPU_Buffer) return false;
        if (!this.voxelToFaceID_GPU_Buffer) return false;
        if (!this.faceStats_GPU_Buffer) return false;
        if (!this.faceStats_GPU_ReadBack) return false;
        if (!this.emptyFaceStats_CPU) return false;
        if (!this.rayComputeUniformBuffer) return false;
        if (!this.energyBandBuffer) return false;
        if (this.energyBandCount <= 0) return false;
        if (this.energyBandSizeBytes <= 0) return false;
        if (!this.voxelToFaceID_CPU) return false;
        if (!this.faceToVoxelID_CPU) return false;
        if (!this.faceStats) return false;
        if (!this.shadowPipeline) return false;
        if (!this.shadowBindGroup) return false;
        if (!this.shadowUniformBuffer) return false;
        if (!this.shadowMap) return false;
        if (!this.shadowMapView) return false;
        if (!this.shadowSampler) return false;
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
        this.energyBands_CPU = new Float32Array(this.energyBandCount);
        
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
        const builder = this.mesh_builder;
        const geometry_data = builder.buildFaceArrayFromVoxels(this.room_voxel_data);
        const voxel_to_face = geometry_data.v2f;
        const face_to_voxel = geometry_data.f2v;

        this.hiddenWallFlags_CPU = builder.buildHiddenFaceMask(face_to_voxel, this.settings.SIMULATION.hide_walls);

        this.voxelToFaceID_CPU = voxel_to_face;
        this.faceToVoxelID_CPU = face_to_voxel;

        const faceCount = face_to_voxel.length;
        this.faceCount = faceCount;
        this.statsByteSize = face_to_voxel.length * 8;
        this.emptyFaceStats_CPU = new ArrayBuffer(this.statsByteSize);


        //translation buffer
        this.voxelToFaceID_GPU_Buffer = this.device.createBuffer({
            size: voxel_to_face.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(
            this.voxelToFaceID_GPU_Buffer,
            0,
            voxel_to_face.buffer,
            voxel_to_face.byteOffset,
            voxel_to_face.byteLength
        );

        this.faceStats_GPU_Buffer = this.device.createBuffer({
            size: this.statsByteSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        });

        //readback buffer
        this.faceStats_GPU_ReadBack = this.device.createBuffer({
            size: this.statsByteSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        //read back preallocation
        this.faceStats = new Array(faceCount);
        for (let i = 0; i < faceCount; i++) {
            this.faceStats[i] = {
                bounceCount: 0,
                absorbedEnergy: 0
            };
        }
    }


    updateFaceColorBuffer() {
        this.device.queue.writeBuffer(
            this.faceColors_GPU_Buffer,
            0,
            this.faceColors_CPU_Write
        );
    }



    createFaceColorBuffer() {
        const count = this.faceCount;        
        const bytes = count * 4;

        this.faceColors_CPU_Write = new Uint32Array(count);
        
        this.faceColors_GPU_Buffer = this.device.createBuffer({
            size: bytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
    }


    createMeshAndBuffers() {
        const device = this.device;
        const builder = this.mesh_builder;

        const face_to_voxel = this.faceToVoxelID_CPU;
        const voxel_to_face = this.voxelToFaceID_CPU;
        const mesh = builder.buildStaticMesh(face_to_voxel, voxel_to_face, this.vertexSize4Bytes);


        // Store CPU copies so we can modify vertex colors later:
        this.vertexData_CPU = mesh.vertices.slice();
        this.indexData_CPU  = mesh.indices.slice();
        
        this.vertexCount = this.vertexData_CPU.length / this.vertexSize4Bytes;

        this.vertexBuffer_GPU_Buffer = device.createBuffer({
            size: this.vertexData_CPU.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });

        device.queue.writeBuffer(
            this.vertexBuffer_GPU_Buffer,
            0,
            this.vertexData_CPU
        );

        this.indexBuffer_GPU_Buffer = device.createBuffer({
            size: this.indexData_CPU.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
        });

        device.queue.writeBuffer(
            this.indexBuffer_GPU_Buffer,
            0,
            this.indexData_CPU
        );


        this.indexCount = mesh.indexCount;
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
        this.voxelCoefs_GPU_Buffer = this.device.createBuffer({
            size: this.room_voxel_coefs.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.device.queue.writeBuffer(
            this.voxelCoefs_GPU_Buffer,
            0,
            this.room_voxel_coefs.buffer,
            this.room_voxel_coefs.byteOffset,
            this.room_voxel_coefs.byteLength
        );
    }

    createSphereBuffers() {
        const device = this.device;
        const mesh = this.mesh_builder.createSphereMesh(1.0);

        this.sphereVertexBuffer_GPU_Buffer = device.createBuffer({
            size: mesh.vertexData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(this.sphereVertexBuffer_GPU_Buffer, 0, mesh.vertexData);

        this.sphereIndexBuffer_GPU_Buffer = device.createBuffer({
            size: mesh.indexData.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(this.sphereIndexBuffer_GPU_Buffer, 0, mesh.indexData);

        this.sphereIndexCount = mesh.indexData.length;
    }

    createInstanceBuffer() {
        const sim = this.settings.SIMULATION;
        const p_em = sim.emitter_position;
        const p_li = sim.listener_position;

        const emitterMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            p_em[0], p_em[1], p_em[2], 1
        ]);


        const listenerMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            p_li[0], p_li[1], p_li[2], 1
        ]);

        const device = this.device;
        const bufferSize = 2 * 80;

        const array = new Float32Array(bufferSize / 4);

        function writeInstance(baseIndex, mat, sphereID) {
            for (let i = 0; i < 16; i++) {
                array[baseIndex + i] = mat[i];
            }
            const idOffset = baseIndex + 16;
            new Uint32Array(array.buffer)[idOffset] = sphereID;
        }

        writeInstance(0, emitterMatrix, 0);
        writeInstance(17, listenerMatrix, 1);

        this.sphereInstanceBuffer_GPU_Buffer = device.createBuffer({
            size: bufferSize,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        device.queue.writeBuffer(this.sphereInstanceBuffer_GPU_Buffer, 0, array);
        this.sphereInstanceBuffer_CPU_Write = array;

        const dummy = new Float32Array([
            1,0,0,0,
            0,1,0,0,
            0,0,1,0,
            0,0,0,1,
            99999
        ]);

        this.dummyInstanceBuffer_GPU_Buffer = device.createBuffer({
            size: dummy.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(this.dummyInstanceBuffer_GPU_Buffer, 0, dummy);

    }

    createMainPipeline(vsh, fsh) {
        const device = this.device;
        const vModule = device.createShaderModule({ code: vsh });
        const fModule = device.createShaderModule({ code: fsh });

        const bindGroupLayout = device.createBindGroupLayout({
            entries: [
                { // uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // shadow texture
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth" }
                },
                { // shadow sampler
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: "comparison" }
                },
                { // faceColorBuffer (u32)
                    binding: 3,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
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
                        arrayStride: this.vertexSize4Bytes * 4,
                        stepMode: "vertex",
                        attributes: [
                            { shaderLocation: 0, offset: 0,  format: "float32x3" },
                            { shaderLocation: 1, offset: 12, format: "float32x3" },
                            { shaderLocation: 2, offset: 24, format: "uint32" } 
                        ]
                    },
                    {
                        arrayStride: 64 + 4,
                        stepMode: "instance",
                        attributes: [
                            { shaderLocation: 3, offset: 0,  format: "float32x4" },
                            { shaderLocation: 4, offset: 16, format: "float32x4" },
                            { shaderLocation: 5, offset: 32, format: "float32x4" },
                            { shaderLocation: 6, offset: 48, format: "float32x4" },
                            { shaderLocation: 7, offset: 64, format: "uint32" }
                        ]
                    }
                ]
            },

            fragment: {
                module: fModule,
                entryPoint: "fs_main",
                targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }]
            },

            primitive: { topology: "triangle-list", cullMode: "none" },

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
                { binding: 2, resource: this.shadowSampler },
                { binding: 3, resource: { buffer: this.faceColors_GPU_Buffer } }
            ]
        });
    }


    createShadowPipeline(vsh) {
        const device = this.device;
        const vModule = device.createShaderModule({ code: vsh });

        const shadowBindGroupLayout = device.createBindGroupLayout({
            entries: [
                { // shadowViewProj
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                },
                { // faceColorBuffer
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "read-only-storage" }
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
                        arrayStride: this.vertexSize4Bytes * 4,
                        stepMode: "vertex",
                        attributes: [
                            { shaderLocation: 0, offset: 0,  format: "float32x3" },
                            { shaderLocation: 1, offset: 12, format: "float32x3" },
                            { shaderLocation: 2, offset: 24, format: "uint32" } 
                        ]
                    },
                    {
                        arrayStride: 64 + 4,
                        stepMode: "instance",
                        attributes: [
                            { shaderLocation: 3, offset: 0,  format: "float32x4" },
                            { shaderLocation: 4, offset: 16, format: "float32x4" },
                            { shaderLocation: 5, offset: 32, format: "float32x4" },
                            { shaderLocation: 6, offset: 48, format: "float32x4" },
                            { shaderLocation: 7, offset: 64, format: "uint32" }
                        ]
                    }
                ]
            },

            primitive: { topology: "triangle-list", cullMode: "none" },

            depthStencil: {
                format: this.shadowMapFormat,
                depthWriteEnabled: true,
                depthCompare: "less"
            }
        });

        this.shadowBindGroup = device.createBindGroup({
            layout: shadowBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.shadowUniformBuffer } },
                { binding: 1, resource: { buffer: this.faceColors_GPU_Buffer } }            
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
                    resource: { buffer: this.voxelCoefs_GPU_Buffer }
                },

                // 2 - voxel -> solid ID table
                {
                    binding: 2,
                    resource: { buffer: this.voxelToFaceID_GPU_Buffer }
                },

                // 3 - face stats (accumulation output)
                {
                    binding: 3,
                    resource: { buffer: this.faceStats_GPU_Buffer }
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

