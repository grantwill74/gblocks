const RESTART_INDEX: number = 0xFFFF;

class AttribDesc {
    name: string;
    size: 1 | 2 | 3 | 4;
    kind: GLenum;
    normalized: boolean;
    stride: number;
    offset: number;
    
    constructor (name: string, size: 1 | 2 | 3 | 4, kind: GLenum, 
        normalized: boolean, stride: number, offset: number
    ) {
        this.name = name;
        this.size = size;
        this.kind = kind;
        this.normalized = normalized;
        this.stride = stride;
        this.offset = offset;
    }
}

function createVaoOrThrow(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
    const vao = gl.createVertexArray();
        
    if (!vao) {
        throw new FrogError (FrogErrorKind.CreateMesh,
            "unable to create a vertex array object. gl error: " + 
            gl.getError());
    }

    return vao;
}

function createWebGlBufferOrThrow(gl: WebGL2RenderingContext): WebGLBuffer {
    console.assert (!gl.getError());

    const buf = gl.createBuffer();
    let err = gl.getError();

    if (!buf || err) {
        throw new FrogError (FrogErrorKind.CreateBuffer,
            "gl.createBuffer() failed. gl error: " + 
            gl.getError());
    }

    return buf;
}

class GridMesh {
    vao: WebGLVertexArrayObject;
    nElems: number;
    program: Webgl2Program;

    rows: number;
    cols: number;

    // we're storing palette indices in a separate buffer so we can easily
    // update them as the board or grid state changes.
    paletteEntryBuffer: WebGLBuffer;

    tex: Texture;

    constructor(
        gl: WebGL2RenderingContext, 
        rows: number,
        cols: number,
        program: Webgl2Program,
        texture: Texture,
    ) {
        if (rows * cols * 4 >= 0xFFFF) {
            throw new FrogError (FrogErrorKind.TooManyVertices,
                "rows, cols = " + rows + ", " + cols);
        }

        this.rows = rows;
        this.cols = cols;

        this.vao = createVaoOrThrow (gl);
        gl.bindVertexArray (this.vao);

        const verts = createWebGlBufferOrThrow (gl);
        this.paletteEntryBuffer = createWebGlBufferOrThrow (gl);
        const ib = createWebGlBufferOrThrow (gl);

        const floatdata: number[] = [];
        const colors: number[] = new Array <number> (rows * cols);
        const indis: number[] = [];
        let i = 0;

        
        for (let row = 0; row > -rows; row--) {
            for (let col = 0; col < cols; col++) {
                floatdata.push (
                    col, row, 0, 0,         // top left
                    col, row - 1, 1, 0,     // bottom left
                    col + 1, row, 0, 1,     // top right
                    col + 1, row - 1, 1, 1, // bottom right
                );

                colors.push (0, 0, 0, 0);
                
                indis.push (i++, i++, i++, i++);
                indis.push (RESTART_INDEX);
            }
        }

        const FLOAT_STRIDE = 16;

        gl.bindBuffer (gl.ARRAY_BUFFER, verts);
        gl.bufferData (gl.ARRAY_BUFFER, new Float32Array (floatdata), gl.STATIC_DRAW);
        gl.vertexAttribPointer (0, 2, gl.FLOAT, false, FLOAT_STRIDE, 0);
        gl.vertexAttribPointer (1, 2, gl.FLOAT, false, FLOAT_STRIDE, 8);
        gl.enableVertexAttribArray (0);
        gl.enableVertexAttribArray (1);

        gl.bindBuffer (gl.ARRAY_BUFFER, this.paletteEntryBuffer);
        gl.bufferData (gl.ARRAY_BUFFER, new Uint8Array (colors), gl.DYNAMIC_DRAW);
        gl.vertexAttribIPointer (2, 1, gl.UNSIGNED_BYTE, 0, 0);
        gl.enableVertexAttribArray (2);

        
        gl.bindBuffer (gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData (gl.ELEMENT_ARRAY_BUFFER, new Uint16Array (indis), gl.STATIC_DRAW);

        assertNoGlError (gl.getError(), FrogErrorKind.CreateBuffer,
            "unable to bind vertex or index buffers or upload vertex/index data.");

        this.nElems = indis.length;
        this.program = program;

        gl.bindVertexArray (null);
        gl.bindBuffer (gl.ARRAY_BUFFER, null);
        gl.bindBuffer (gl.ELEMENT_ARRAY_BUFFER, null);

        this.tex = texture;

        assertGlClear (gl.getError());
    }

    /// given a list of tile colors, update the palette color vertex attributes
    updateColors (gl: WebGL2RenderingContext, colors: number[]): void {
        assertGlClear (gl.getError());
        const attribs: number[] = [];

        // there are 4 vertices per tile.
        for (let i = 0; i < colors.length * 4; i++) {
            attribs[i] = colors[i >> 2];
        }

        gl.bindBuffer (gl.ARRAY_BUFFER, this.paletteEntryBuffer);
        gl.bufferData (gl.ARRAY_BUFFER, new Uint8Array (attribs), gl.DYNAMIC_DRAW);
        gl.bindBuffer (gl.ARRAY_BUFFER, null);

        assertGlClear (gl.getError());
    }

    updateColorsFromBits (
        gl: WebGL2RenderingContext, 
        bits: number, color: number): void
    {
        const colors: number[] = [];
        const box = collision_box_from_bits (bits);

        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const c = box [row][col] * color;
                colors.push (c);
            }
        }

        this.updateColors (gl, colors);
    } 
}
