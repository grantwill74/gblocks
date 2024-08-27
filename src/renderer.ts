const PALETTE: number[] = [
    0, 0, 0,          // black
    0.8, 0.2, 0.2,    // red
    0.2, 0.8, 0.2,    // green
    0.2, 0.2, 0.8,    // blue
    0.9, 0.5, 0.2,    // orange
    0.8, 0.8, 0.2,    // yellow
    0.25, 0.7, 0.5,    // mint
    0.5, 0.8, 0.1,    // lime
    0.25, 0.15, 0.4,   // indigo?

    // fringe colors
    0.25, 0.25, 0.25,   // gray
    0.3, 0.2, 0.15,     // bottom (scratch that)
];

const FRINGE_COLOR = 9;
const BOTTOM_COLOR = 9;

const TILE_W_PX = 32;
const TILE_H_PX = 32;


class InGameRenderer {
    field: GridMesh;
    piece: GridMesh;

    fringe: GridMesh;
    b_fringe: GridMesh; // bottom fringe

    field_x_ndc: number;
    field_y_ndc: number;

    field_rows: number;
    field_cols: number;

    tile_w_ndc: number;
    tile_h_ndc: number;

    fieldProgram: Webgl2Program;

    constructor (
        gl: WebGL2RenderingContext, 
        rows: number, cols: number,
        field_x_ndc: number, field_y_ndc: number,
    ) {
        this.field_rows = rows;
        this.field_cols = cols;

        const vshader = Webgl2Shader.vertex (gl, V_SHADER);
        const fshader = Webgl2Shader.fragment (gl, F_SHADER);
        this.fieldProgram = new Webgl2Program (gl, vshader, fshader);
        gl.useProgram (this.fieldProgram.handle);

        assertGlClear (gl.getError());
        
        // load fixed palette
        const palletLoc = this.fieldProgram.getUniformLoc ("color_palette");
        gl.uniform3fv (palletLoc, new Float32Array (PALETTE));
        assertNoGlError (gl.getError(), FrogErrorKind.LoadingColorPalette);

        this.field = new GridMesh (gl, rows, cols, this.fieldProgram);

        this.field_x_ndc = field_x_ndc;
        this.field_y_ndc = field_y_ndc;

        this.tile_w_ndc = TILE_W_NDC;
        this.tile_h_ndc = TILE_H_NDC;

        // create fringe with all grays
        this.fringe = new GridMesh (gl, rows + 1, 1, this.fieldProgram);
        const fringeColors: number[] = [];
        for (let row = 0; row < rows + 1; row++) {
            fringeColors.push (FRINGE_COLOR);
        }
        this.fringe.updateColors (gl, fringeColors);

        this.b_fringe = new GridMesh (gl, 1, cols, this.fieldProgram);
        const bFringeColors: number[] = [];
        for (let col = 0; col < cols; col++) {
            bFringeColors.push (BOTTOM_COLOR);
        }
        this.b_fringe.updateColors (gl, bFringeColors);

        this.piece = new GridMesh (gl, 4, 4, this.fieldProgram);
        this.piece.updateColorsFromBits (gl, 0, 0);
    }

    renderField (gl: WebGL2RenderingContext, colors: number[]): void {
        this.field.updateColors (gl, colors);

        gl.useProgram (this.fieldProgram.handle);
        const ul_tl_loc = this.fieldProgram.getUniformLoc ("tl_loc");
        const ul_tile_dims = this.fieldProgram.getUniformLoc ("tile_dims");
        const tile_dims = [this.tile_w_ndc, this.tile_h_ndc];
        
        // fringe
        let tl_loc = [this.field_x_ndc, this.field_y_ndc];
        gl.uniform2fv (ul_tl_loc, new Float32Array (tl_loc));
        gl.uniform2fv (ul_tile_dims, new Float32Array (tile_dims));
        gl.bindVertexArray (this.fringe.vao);
        gl.drawElements (gl.TRIANGLE_STRIP, this.fringe.nElems, gl.UNSIGNED_SHORT, 0);

        tl_loc = [
            this.field_x_ndc + (this.field_cols + 1) * this.tile_w_ndc, 
            this.field_y_ndc]
        gl.uniform2fv (ul_tl_loc, new Float32Array (tl_loc));
        gl.bindVertexArray (this.fringe.vao);
        gl.drawElements (gl.TRIANGLE_STRIP, this.fringe.nElems, gl.UNSIGNED_SHORT, 0);
    
        // field
        tl_loc = [this.field_x_ndc + this.tile_w_ndc, this.field_y_ndc];
        gl.uniform2fv (ul_tl_loc, new Float32Array (tl_loc));
        gl.bindVertexArray (this.field.vao);
        gl.drawElements (gl.TRIANGLE_STRIP, this.field.nElems, gl.UNSIGNED_SHORT, 0);
    
        // bottom fringe
        tl_loc = [
            this.field_x_ndc + this.tile_w_ndc, 
            this.field_y_ndc - this.field_rows * this.tile_h_ndc]
        gl.uniform2fv (ul_tl_loc, new Float32Array (tl_loc));
        gl.bindVertexArray (this.b_fringe.vao);
        gl.drawElements (gl.TRIANGLE_STRIP, this.b_fringe.nElems, gl.UNSIGNED_SHORT, 0);
    }

    changePiece (
        gl: WebGL2RenderingContext, 
        pattern: number, color: number
    ): void {
        this.piece.updateColorsFromBits (gl, pattern, color);
    }

    renderPiece (
        gl: WebGL2RenderingContext, 
        row: number, col: number,
        pattern: number, color: number
    ): void {
        const tl_loc = [
            this.field_x_ndc + this.tile_w_ndc + this.tile_w_ndc * col, 
            this.field_y_ndc - this.tile_h_ndc * row
        ];

        const tile_dims = [this.tile_w_ndc, this.tile_h_ndc];

        this.piece.updateColorsFromBits (gl, pattern, color);

        gl.useProgram (this.fieldProgram.handle);
        const ul_tl_loc = this.fieldProgram.getUniformLoc ("tl_loc");
        const ul_tile_dims = this.fieldProgram.getUniformLoc ("tile_dims");
        gl.uniform2fv (ul_tl_loc, new Float32Array (tl_loc));
        gl.uniform2fv (ul_tile_dims, new Float32Array (tile_dims));

        gl.bindVertexArray (this.piece.vao);
        gl.drawElements (gl.TRIANGLE_STRIP, this.piece.nElems, gl.UNSIGNED_SHORT, 0);
    }
}