
import { mat4, normalize3, cross3, sub3, dot3 } from "./math.js";

export function perspective(fov, aspect, near, far) {
    const f = 1.0 / Math.tan(fov / 2);
    const nf = 1.0 / (near - far);

    const out = new Float32Array(16);

    out[0]  = f / aspect;
    out[1]  = 0;
    out[2]  = 0;
    out[3]  = 0;

    out[4]  = 0;
    out[5]  = f;
    out[6]  = 0;
    out[7]  = 0;

    out[8]  = 0;
    out[9]  = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;

    out[12] = 0;
    out[13] = 0;
    out[14] = (2 * far * near) * nf;
    out[15] = 0;

    return out;
}

export function lookAt(eye, target, up) {
    const z = normalize3(sub3(eye, target)); 
    const x = normalize3(cross3(up, z));
    const y = cross3(z, x);

    const out = mat4();

    out[0]  = x[0]; out[4] = x[1]; out[8]  = x[2];
    out[1]  = y[0]; out[5] = y[1]; out[9]  = y[2];
    out[2]  = z[0]; out[6] = z[1]; out[10] = z[2];

    out[12] = -dot3(x, eye);
    out[13] = -dot3(y, eye);
    out[14] = -dot3(z, eye);
    out[15] = 1;

    return out;
}