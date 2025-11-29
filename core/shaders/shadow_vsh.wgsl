struct ShadowUniforms {
    shadowViewProj : mat4x4<f32>
};

@group(0) @binding(0)
var<uniform> uni : ShadowUniforms;

struct VSIn {
    @location(0) pos : vec3<f32>,
    @location(1) normal : vec3<f32>,
    @location(2) color : vec3<f32>
};

struct VSOut {
    @builtin(position) position : vec4<f32>,
};

@vertex
fn vs_shadow_main(input : VSIn) -> VSOut {
    var out : VSOut;

    if (input.color.z <= 0.0) {
        out.position = vec4<f32>(1e9, 1e9, 1e9, 1.0);
        return out;
    }

    let world = vec4<f32>(input.pos, 1.0);
    out.position = uni.shadowViewProj * world;

    return out;
}
