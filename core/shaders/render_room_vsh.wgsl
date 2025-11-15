

struct Uniforms {
    viewProj      : mat4x4<f32>,
    invViewProj   : mat4x4<f32>,
    screenSize    : vec2<f32>,
};


@group(0) @binding(0)
var<uniform> uni : Uniforms;

struct VSInput {
    @location(0) position : vec3<f32>,
    @location(1) color    : vec3<f32>,
};

struct VSOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) color : vec3<f32>,
};

@vertex
fn vs_main(input : VSInput) -> VSOutput {
    var out : VSOutput;

    let worldPos = vec4<f32>(input.position, 1.0);

    out.position = uni.viewProj * worldPos;

    out.color = input.color;
    return out;
}
