
class Webgl2Shader {
    handle: WebGLShader;

    private constructor(
        gl: WebGL2RenderingContext, kind: GLenum, src: string) 
    {
        assertGlClear (gl.getError());

        const maybeShader = gl.createShader (kind);
        let error = gl.getError();

        if (!maybeShader || error) {
            const msg = "Error returned by gl.createShader(). Kind enum: " 
                + kind;
            assertNoGlError (error, FrogErrorKind.CreateShader, msg);
        }

        const shader = maybeShader as Webgl2Shader;

        gl.shaderSource (shader, src);
        gl.compileShader (shader);
        
        const compileSucceeded = 
            gl.getShaderParameter (shader, gl.COMPILE_STATUS);

        if (!compileSucceeded) {
            let shaderKind = "Shader";

            if (kind == gl.VERTEX_SHADER) {
                shaderKind = "Vertex Shader";
            }
            else if (kind == gl.FRAGMENT_SHADER) {
                shaderKind = "Fragment Shader";
            }

            const infoLog = gl.getShaderInfoLog (shader);
            const error = shaderKind + " failed to compile. Error: " + infoLog;

            throw new FrogError (FrogErrorKind.CreateShader, error);
        }

        assertNoGlError (gl.getError(), FrogErrorKind.CreateShader);

        this.handle = shader;
    }

    static vertex (gl: WebGL2RenderingContext, src: string): Webgl2Shader {
        return new Webgl2Shader (gl, gl.VERTEX_SHADER, src);
    }

    static fragment (gl: WebGL2RenderingContext, src: string): Webgl2Shader {
        return new Webgl2Shader (gl, gl.FRAGMENT_SHADER, src);
    }
}

class Webgl2Program {
    gl: WebGL2RenderingContext;
    handle: WebGLProgram;

    public constructor (
        gl: WebGL2RenderingContext, vert: Webgl2Shader, frag: Webgl2Shader) 
    {
        assertGlClear(gl.getError());

        this.gl = gl;

        const program = gl.createProgram();

        if (!program) {
            const error = "Unable to create program. " + 
                "gl error code: " + gl.getError();
            throw new FrogError (FrogErrorKind.CreateShader, error);
        }

        gl.attachShader (program, vert.handle);

        assertNoGlError (gl.getError(), FrogErrorKind.CreateShader, 
            "Error when attaching vertex shader.");

        gl.attachShader (program, frag.handle);
        
        assertNoGlError (gl.getError(), FrogErrorKind.CreateShader, 
            "Error when attaching fragment shader.");

        gl.linkProgram (program);

        const link = gl.getProgramParameter (program, gl.LINK_STATUS);
        if (!link) {
            const error = "Unable to link program. Error: " +
                gl.getProgramInfoLog (program);
            throw new FrogError (FrogErrorKind.CreateShader, error);
        }

        assertNoGlError (gl.getError(), FrogErrorKind.CreateShader, 
            "Error after linking shader program.");

        this.handle = program;
    }

    get nUniforms(): number {
        assertGlClear (this.gl.getError());
        const nUniforms = this.gl.getProgramParameter (
            this.handle, this.gl.ACTIVE_UNIFORMS);
        assertNoGlError (this.gl.getError(), FrogErrorKind.EnumShader, 
            "Error enumerating uniforms.");
        return nUniforms;
    }

    get nAttributes(): number {
        assertGlClear (this.gl.getError());
        const nAttributes = this.gl.getProgramParameter (
            this.handle, this.gl.ACTIVE_UNIFORMS);
        assertNoGlError (this.gl.getError(), FrogErrorKind.EnumShader, 
            "Error enumerating attributes.");
        return nAttributes;
    }

    getActiveUniform (index: number): WebGLActiveInfo | null {
        assertGlClear (this.gl.getError());
        const info = this.gl.getActiveUniform(this.handle, index);

        if (!info) { return null; }

        assertNoGlError (this.gl.getError(), FrogErrorKind.GetActiveElem, 
            "Error getting uniform info.");

        return info;
    }

    getActiveAttribute (index: number): WebGLActiveInfo | null {
        assertGlClear (this.gl.getError());
        const info = this.gl.getActiveAttrib(this.handle, index);

        if (!info) { return null; }

        assertNoGlError (this.gl.getError(), FrogErrorKind.GetActiveElem, 
            "Error getting uniform info.");

        return info;
    }

    getUniformLoc (name: string): WebGLUniformLocation | null {
        assertGlClear(this.gl.getError());
        const loc = this.gl.getUniformLocation (this.handle, name);
        assertNoGlError (this.gl.getError(), FrogErrorKind.EnumShader, 
            "Error getting uniform location.");

        return loc;
    }

    getAttribLoc (name: string): number | null {
        assertGlClear(this.gl.getError());
        const loc = this.gl.getAttribLocation (this.handle, name);
        assertNoGlError (this.gl.getError(), FrogErrorKind.EnumShader, 
            "Error getting attribute location for " + name);

        return loc;
    }
}

const V_SHADER = 
    `#version 300 es
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

const F_SHADER = 
    `#version 300 es
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

const V_SHADER_TEX =
    `#version 300 es
    precision mediump float;

    uniform vec2 tl_loc;        // top left location
    uniform vec2 tile_dims;     // tile dimensions in NDCs

    in vec2 coords;
    in vec2 uvs;
    in uint palette_index;

    flat out uint v_palette_index;
    out vec2 v_uvs;

    void main() {
        v_palette_index = palette_index;
        vec2 coord = tl_loc + tile_dims * coords;

        gl_Position = vec4 (coord, 0.0, 1.0);
        v_uvs = uvs;
    }
    `;

const F_SHADER_TEX =
    `#version 300 es
    precision mediump float;
    precision mediump usampler2D;

    uniform vec3 color_palette[16];
    uniform usampler2D tex;

    flat in uint v_palette_index;
    in vec2 v_uvs;

    out vec4 fragcolor;

    void main() {
        if (v_palette_index == uint (0)) {
            discard;
        }

        // sample the texture. there are only 4 brightness levels:
        // 0: invisible
        // 1: dim
        // 2: normal
        // 3: highlight
        float samp = float (texture (tex, v_uvs).r) / 3.0;

        fragcolor = vec4 (color_palette[v_palette_index], 1.0) * samp;
    }
`;


const F_SHADER_PALETTE_SIZE = 16;