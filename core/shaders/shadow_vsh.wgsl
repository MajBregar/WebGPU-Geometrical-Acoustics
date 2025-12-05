
struct ShadowUniforms {
    shadowViewProj : mat4x4<f32>
};

@group(0) @binding(0)
var<uniform> uni : ShadowUniforms;

@group(0) @binding(1)
var<storage, read> faceColor : array<u32>;


struct VSIn {
    @location(0) position : vec3<f32>,
    @location(1) normal   : vec3<f32>,
    @location(2) faceID   : u32,

    @location(3) inst0 : vec4<f32>,
    @location(4) inst1 : vec4<f32>,
    @location(5) inst2 : vec4<f32>,
    @location(6) inst3 : vec4<f32>,
    @location(7) sphereID : u32,
};

struct VSOut {
    @builtin(position) position : vec4<f32>,
};


fn decode_color(c: u32) -> vec4<f32> {
    let r = f32((c >> 24) & 0xFFu) / 255.0;
    let g = f32((c >> 16) & 0xFFu) / 255.0;
    let b = f32((c >>  8) & 0xFFu) / 255.0;
    let a = f32( c        & 0xFFu) / 255.0;
    return vec4<f32>(r, g, b, a);
}


@vertex
fn vs_shadow_main(input : VSIn) -> VSOut {
    var out : VSOut;

    let isSphere = (input.sphereID < 2u);
    var worldPos : vec4<f32>;

    if (isSphere) {
        let modelMat = mat4x4<f32>(
            input.inst0,
            input.inst1,
            input.inst2,
            input.inst3
        );

        worldPos = modelMat * vec4<f32>(input.position, 1.0);

    } else {
        let color = decode_color(faceColor[input.faceID]);

        if (color.a <= 0.0) {
            out.position = vec4<f32>(1e9, 1e9, 1e9, 1.0);
            return out;
        }

        worldPos = vec4<f32>(input.position, 1.0);
    }

    out.position = uni.shadowViewProj * worldPos;
    return out;
}
