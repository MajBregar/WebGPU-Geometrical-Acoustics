import { mat4, vec3 } from "./glm.js"

export function perspective(fov, aspect, near, far) {
    const out = mat4.create()
    mat4.perspectiveZO(out, fov, aspect, near, far); 
    return out;
}

export function ortographic(half, near, far) {
    const out = mat4.create()
    mat4.orthoZO(out, -half, half, -half, half, near, far);
    return out;
}

export function lookAt(eye, target, up) {
    const out = mat4.create()
    mat4.lookAt(out, eye, target, up) 
    return out;
}

export function matMul(a, b){
    return mat4.multiply(mat4.create(), a, b);
}

export function normalize3(v){
    return vec3.normalize(vec3.create(), v);
}