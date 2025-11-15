
export function vec3(x = 0, y = 0, z = 0) {
    return new Float32Array([x, y, z]);
}

export function add3(a, b) {
    return new Float32Array([
        a[0] + b[0],
        a[1] + b[1],
        a[2] + b[2]
    ]);
}

export function sub3(a, b) {
    return new Float32Array([
        a[0] - b[0],
        a[1] - b[1],
        a[2] - b[2]
    ]);
}

export function dot3(a, b) {
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
}

export function cross3(a, b) {
    return new Float32Array([
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0]
    ]);
}

export function length3(a) {
    return Math.hypot(a[0], a[1], a[2]);
}

export function normalize3(a) {
    const l = length3(a) || 1;
    return new Float32Array([a[0]/l, a[1]/l, a[2]/l]);
}


export function mat4() {
    return new Float32Array(16);
}

export function mulMat4(a, b) {
    const out = new Float32Array(16);

    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            out[col*4 + row] =
                a[0*4 + row] * b[col*4 + 0] +
                a[1*4 + row] * b[col*4 + 1] +
                a[2*4 + row] * b[col*4 + 2] +
                a[3*4 + row] * b[col*4 + 3];
        }
    }

    return out;
}



export function invertMat4(m) {
    const out = new Float32Array(16);
    const inv = new Float32Array(16);

    inv[0]  = m[5]*m[10] - m[6]*m[9];
    inv[4]  = m[2]*m[9]  - m[1]*m[10];
    inv[8]  = m[1]*m[6]  - m[2]*m[5];

    inv[1]  = m[6]*m[8]  - m[4]*m[10];
    inv[5]  = m[0]*m[10] - m[2]*m[8];
    inv[9]  = m[2]*m[4]  - m[0]*m[6];

    inv[2]  = m[4]*m[9]  - m[5]*m[8];
    inv[6]  = m[1]*m[8]  - m[0]*m[9];
    inv[10] = m[0]*m[5]  - m[1]*m[4];

    const det = m[0]*inv[0] + m[1]*inv[4] + m[2]*inv[8];
    const invDet = 1.0 / det;

    for (let i = 0; i < 16; i++) {
        out[i] = inv[i] * invDet;
    }
    out[15] = 1;

    return out;
}
