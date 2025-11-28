

import {mat4} from "./glm.js"



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