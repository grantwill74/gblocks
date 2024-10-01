"use strict";
const BLOCK_TEX = [
    1, 1, 1, 1, 1, 1, 1, 1,
    3, 2, 2, 2, 2, 2, 2, 1,
    3, 2, 2, 2, 2, 2, 2, 1,
    3, 2, 2, 2, 2, 2, 2, 1,
    3, 2, 2, 2, 2, 2, 2, 1,
    3, 2, 2, 2, 2, 2, 2, 1,
    3, 2, 2, 2, 2, 2, 2, 1,
    3, 3, 3, 3, 3, 3, 3, 3,
];
/// Palettized texture. Treated as a grayscale texture.
class Texture {
    constructor(gl, width, height, values) {
        assertGlClear(gl.getError());
        const tex = gl.createTexture();
        const err = gl.getError();
        if (!tex || err) {
            throw new FrogError(FrogErrorKind.CreateTexture);
        }
        this.id = tex;
        const data = new Uint8Array(values);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, width, height, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
        assertGlClear(gl.getError());
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    bind(gl) {
        assertGlClear(gl.getError());
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.id);
        assertGlClear(gl.getError());
    }
    bindToSampler(gl, prog, uniformName) {
        assertGlClear(gl.getError());
        const loc = gl.getUniformLocation(prog, uniformName);
        const err = gl.getError();
        if (!loc || err) {
            throw new FrogError(FrogErrorKind.BindUniform, "unable to bind texture to sampler '" + uniformName + "'." +
                "gl error: " + err);
        }
        this.bind(gl);
        gl.uniform1i(loc, 0);
        assertGlClear(gl.getError());
    }
}
