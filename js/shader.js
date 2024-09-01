"use strict";
class Webgl2Shader {
    constructor(gl, kind, src) {
        assertGlClear(gl.getError());
        const maybeShader = gl.createShader(kind);
        let error = gl.getError();
        if (!maybeShader || error) {
            const msg = "Error returned by gl.createShader(). Kind enum: "
                + kind;
            assertNoGlError(error, FrogErrorKind.CreateShader, msg);
        }
        const shader = maybeShader;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        const compileSucceeded = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (!compileSucceeded) {
            let shaderKind = "Shader";
            if (kind == gl.VERTEX_SHADER) {
                shaderKind = "Vertex Shader";
            }
            else if (kind == gl.FRAGMENT_SHADER) {
                shaderKind = "Fragment Shader";
            }
            const infoLog = gl.getShaderInfoLog(shader);
            const error = shaderKind + " failed to compile. Error: " + infoLog;
            throw new FrogError(FrogErrorKind.CreateShader, error);
        }
        assertNoGlError(gl.getError(), FrogErrorKind.CreateShader);
        this.handle = shader;
    }
    static vertex(gl, src) {
        return new Webgl2Shader(gl, gl.VERTEX_SHADER, src);
    }
    static fragment(gl, src) {
        return new Webgl2Shader(gl, gl.FRAGMENT_SHADER, src);
    }
}
class Webgl2Program {
    constructor(gl, vert, frag) {
        assertGlClear(gl.getError());
        this.gl = gl;
        const program = gl.createProgram();
        if (!program) {
            const error = "Unable to create program. " +
                "gl error code: " + gl.getError();
            throw new FrogError(FrogErrorKind.CreateShader, error);
        }
        gl.attachShader(program, vert.handle);
        assertNoGlError(gl.getError(), FrogErrorKind.CreateShader, "Error when attaching vertex shader.");
        gl.attachShader(program, frag.handle);
        assertNoGlError(gl.getError(), FrogErrorKind.CreateShader, "Error when attaching fragment shader.");
        gl.linkProgram(program);
        const link = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (!link) {
            const error = "Unable to link program. Error: " +
                gl.getProgramInfoLog(program);
            throw new FrogError(FrogErrorKind.CreateShader, error);
        }
        assertNoGlError(gl.getError(), FrogErrorKind.CreateShader, "Error after linking shader program.");
        this.handle = program;
    }
    get nUniforms() {
        assertGlClear(this.gl.getError());
        const nUniforms = this.gl.getProgramParameter(this.handle, this.gl.ACTIVE_UNIFORMS);
        assertNoGlError(this.gl.getError(), FrogErrorKind.EnumShader, "Error enumerating uniforms.");
        return nUniforms;
    }
    get nAttributes() {
        assertGlClear(this.gl.getError());
        const nAttributes = this.gl.getProgramParameter(this.handle, this.gl.ACTIVE_UNIFORMS);
        assertNoGlError(this.gl.getError(), FrogErrorKind.EnumShader, "Error enumerating attributes.");
        return nAttributes;
    }
    getActiveUniform(index) {
        assertGlClear(this.gl.getError());
        const info = this.gl.getActiveUniform(this.handle, index);
        if (!info) {
            return null;
        }
        assertNoGlError(this.gl.getError(), FrogErrorKind.GetActiveElem, "Error getting uniform info.");
        return info;
    }
    getActiveAttribute(index) {
        assertGlClear(this.gl.getError());
        const info = this.gl.getActiveAttrib(this.handle, index);
        if (!info) {
            return null;
        }
        assertNoGlError(this.gl.getError(), FrogErrorKind.GetActiveElem, "Error getting uniform info.");
        return info;
    }
    getUniformLoc(name) {
        assertGlClear(this.gl.getError());
        const loc = this.gl.getUniformLocation(this.handle, name);
        assertNoGlError(this.gl.getError(), FrogErrorKind.EnumShader, "Error getting uniform location.");
        return loc;
    }
    getAttribLoc(name) {
        assertGlClear(this.gl.getError());
        const loc = this.gl.getAttribLocation(this.handle, name);
        assertNoGlError(this.gl.getError(), FrogErrorKind.EnumShader, "Error getting attribute location for " + name);
        return loc;
    }
}
const V_SHADER = `#version 300 es
    precision mediump float;

    uniform vec2 tl_loc;        // top left location
    uniform vec2 tile_dims;     // tile dimensions in NDCs

    in vec2 coords;
    in uint palette_index;
    
    flat out uint v_palette_index;

    void main() {
        v_palette_index = palette_index;
        vec2 coord = tl_loc + tile_dims * coords;

        gl_Position = vec4 (coord, 0.0, 1.0);
    }
`;
const F_SHADER = `#version 300 es
    precision mediump float;

    uniform vec3 color_palette[16];

    flat in uint v_palette_index;

    out vec4 fragcolor;

    void main() {
        if (v_palette_index == uint (0)) {
            discard;
        }
        
        fragcolor = vec4 (color_palette[v_palette_index], 1.0);
    }
`;
const F_SHADER_PALETTE_SIZE = 16;
