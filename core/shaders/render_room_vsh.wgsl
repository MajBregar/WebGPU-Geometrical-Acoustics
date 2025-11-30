
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

@group(0) @binding(3)
var<storage, read> faceColor : array<u32>;



struct VSInput {
    @location(0) position      : vec3<f32>, 
    @location(1) normal   : vec3<f32>,
    @location(2) faceID   : u32
};

struct VSOutput {
    @builtin(position) position : vec4<f32>,

    @location(0) normal     : vec3<f32>,
    @location(1) color      : vec3<f32>,
    @location(2) shadowPos  : vec4<f32>
};

fn decode_color(c: u32) -> vec4<f32> {
    let r = f32((c >> 24) & 0xFFu) / 255.0;
    let g = f32((c >> 16) & 0xFFu) / 255.0;
    let b = f32((c >>  8) & 0xFFu) / 255.0;
    let a = f32( c        & 0xFFu) / 255.0;
    return vec4<f32>(r, g, b, a);
}


@vertex
fn vs_main(input : VSInput) -> VSOutput {
    var out : VSOutput;

    let color = decode_color(faceColor[input.faceID]);


    if (color.a <= 0.0) {
        out.position = vec4<f32>(1e9, 1e9, 1e9, 1.0);
        return out;
    }

    let worldPos = vec4<f32>(input.position, 1.0);

    out.position = uni.viewProj * worldPos;
    out.normal = input.normal;
    out.color = color.xyz;

    let shadowWorldPos = vec4<f32>(input.position + input.normal * uni.shadowNormalBias, 1.0);
    out.shadowPos = uni.shadowMatrix * shadowWorldPos;
    
    return out;
}
