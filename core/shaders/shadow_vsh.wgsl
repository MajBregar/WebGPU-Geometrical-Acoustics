
struct ShadowUniforms {
    shadowViewProj : mat4x4<f32>
};

@group(0) @binding(0)
var<uniform> uni : ShadowUniforms;

@group(0) @binding(1)
var<storage, read> faceColor : array<u32>;


struct VSIn {
    @location(0) position    : vec3<f32>,
    @location(1) normal : vec3<f32>,
    @location(2) faceID : u32
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

    let col = decode_color(faceColor[input.faceID]);

    if (col.a <= 0.0) {
        out.position = vec4<f32>(1e9, 1e9, 1e9, 1.0);
        return out;
    }

    let world = vec4<f32>(input.position, 1.0);
    out.position = uni.shadowViewProj * world;

    return out;
}
