
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
    @location(0) position : vec3<f32>,
    @location(1) normal   : vec3<f32>,
    @location(2) faceID   : u32,

    @location(3) inst0 : vec4<f32>,
    @location(4) inst1 : vec4<f32>,
    @location(5) inst2 : vec4<f32>,
    @location(6) inst3 : vec4<f32>,
    @location(7) sphereID : u32,
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

const EMITTER_COLOR = vec3<f32>(1.0, 0.3, 0.3);
const LISTENER_COLOR = vec3<f32>(0.3, 0.5, 1.0);


@vertex
fn vs_main(input : VSInput) -> VSOutput {
    var out : VSOutput;

    let isSphere = (input.sphereID < 2u);

    var worldPos : vec4<f32>;
    var worldNormal : vec3<f32>;
    var finalColor : vec3<f32>;

    if (isSphere) {
        let modelMat = mat4x4<f32>(
            input.inst0,
            input.inst1,
            input.inst2,
            input.inst3
        );

        worldPos = modelMat * vec4<f32>(input.position, 1.0);
        worldNormal = (modelMat * vec4<f32>(input.normal, 0.0)).xyz;
        finalColor = select(LISTENER_COLOR, EMITTER_COLOR, input.sphereID == 0u);

    } else {
        let color4 = decode_color(faceColor[input.faceID]);

        if (color4.a <= 0.0) {
            out.position = vec4<f32>(1e9, 1e9, 1e9, 1.0);
            return out;
        }

        worldPos = vec4<f32>(input.position, 1.0);
        worldNormal = input.normal;
        finalColor = color4.xyz;
    }

    out.position = uni.viewProj * worldPos;
    out.normal = worldNormal;
    out.color = finalColor;

    let shadowWorldPos = worldPos + vec4<f32>(worldNormal * uni.shadowNormalBias, 0.0);
    out.shadowPos = uni.shadowMatrix * shadowWorldPos;

    return out;
}
