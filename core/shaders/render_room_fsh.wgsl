
struct Uniforms {
    viewProj      : mat4x4<f32>,
    invViewProj   : mat4x4<f32>,
    screenSize    : vec2<f32>,
};

@group(0) @binding(0)
var<uniform> uni : Uniforms;

struct FSInput {
    @location(0) color : vec3<f32>
};

@fragment
fn fs_main(input : FSInput) -> @location(0) vec4<f32> {
    // For now: simple unlit color pass-through
    return vec4<f32>(input.color, 1.0);
}
