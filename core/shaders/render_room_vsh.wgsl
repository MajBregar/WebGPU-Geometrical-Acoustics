
struct Uniforms {
    viewProj        : mat4x4<f32>,
    invViewProj     : mat4x4<f32>,
    screenSize      : vec2<f32>,
    lightDir        : vec3<f32>,
    lightColor      : vec3<f32>,
    lightIntensity  : f32,
    shadowMatrix    : mat4x4<f32>,
    shadowBias      : f32,
    shadowNormalBias: f32,
    ambientLight    : f32,
};

@group(0) @binding(0)
var<uniform> uni : Uniforms;

@group(0) @binding(1)
var shadowMap : texture_depth_2d;

@group(0) @binding(2)
var shadowSampler : sampler_comparison;


struct VSInput {
    @location(0) position : vec3<f32>,
    @location(1) normal    : vec3<f32>,
    @location(2) color    : vec3<f32>
};

struct VSOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) normal : vec3<f32>,
    @location(1) color  : vec3<f32>,
    @location(2) shadowPos : vec4<f32>
};

@vertex
fn vs_main(input : VSInput) -> VSOutput {
    var out : VSOutput;

    let worldPos = vec4<f32>(input.position, 1.0);

    out.position = uni.viewProj * worldPos;
    out.normal = input.normal;
    out.color = input.color;

    let shadowWorldPos = vec4<f32>(input.position + input.normal * uni.shadowNormalBias, 1.0);
    out.shadowPos = uni.shadowMatrix * shadowWorldPos;
    
    return out;
}
