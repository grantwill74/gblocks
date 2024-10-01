"use strict";
const PALETTE = [
    0, 0, 0,
    0.8, 0.2, 0.2,
    0.2, 0.8, 0.2,
    0.2, 0.2, 0.8,
    0.9, 0.5, 0.2,
    0.8, 0.8, 0.2,
    0.4, 0.8, 0.52,
    0.5, 0.8, 0.1,
    0.25, 0.15, 0.4,
    // fringe colors
    0.25, 0.25, 0.25,
    0.9, 0.9, 0.9, // white
];
const FRINGE_COLOR = 9;
const BOTTOM_COLOR = 9;
const TILE_W_PX = 32;
const TILE_H_PX = 32;
class InGameRenderer {
    constructor(gl, rows, cols, field_x_ndc, field_y_ndc) {
        this.field_rows = rows;
        this.field_cols = cols;
        this.block_tex = new Texture(gl, 8, 8, BLOCK_TEX);
        const vshader = Webgl2Shader.vertex(gl, V_SHADER_TEX);
        const fshader = Webgl2Shader.fragment(gl, F_SHADER_TEX);
        this.fieldProgram = new Webgl2Program(gl, vshader, fshader);
        gl.useProgram(this.fieldProgram.handle);
        assertGlClear(gl.getError());
        // load fixed palette
        const palletLoc = this.fieldProgram.getUniformLoc("color_palette");
        gl.uniform3fv(palletLoc, new Float32Array(PALETTE));
        assertNoGlError(gl.getError(), FrogErrorKind.LoadingColorPalette);
        this.field = new GridMesh(gl, rows, cols, this.fieldProgram, this.block_tex);
        this.field_x_ndc = field_x_ndc;
        this.field_y_ndc = field_y_ndc;
        this.tile_w_ndc = TILE_W_NDC;
        this.tile_h_ndc = TILE_H_NDC;
        // create fringe with all grays
        this.fringe = new GridMesh(gl, rows + 1, 1, this.fieldProgram, this.block_tex);
        const fringeColors = [];
        for (let row = 0; row < rows + 1; row++) {
            fringeColors.push(FRINGE_COLOR);
        }
        this.fringe.updateColors(gl, fringeColors);
        this.b_fringe = new GridMesh(gl, 1, cols, this.fieldProgram, this.block_tex);
        const bFringeColors = [];
        for (let col = 0; col < cols; col++) {
            bFringeColors.push(BOTTOM_COLOR);
        }
        this.b_fringe.updateColors(gl, bFringeColors);
        this.piece = new GridMesh(gl, 4, 4, this.fieldProgram, this.block_tex);
        this.piece.updateColorsFromBits(gl, 0, 0);
    }
    renderField(gl, colors) {
        this.field.updateColors(gl, colors);
        gl.useProgram(this.fieldProgram.handle);
        const ul_tl_loc = this.fieldProgram.getUniformLoc("tl_loc");
        const ul_tile_dims = this.fieldProgram.getUniformLoc("tile_dims");
        const tile_dims = [this.tile_w_ndc, this.tile_h_ndc];
        this.block_tex.bindToSampler(gl, this.fieldProgram.handle, 'tex');
        // fringe
        let tl_loc = [this.field_x_ndc, this.field_y_ndc];
        gl.uniform2fv(ul_tl_loc, new Float32Array(tl_loc));
        gl.uniform2fv(ul_tile_dims, new Float32Array(tile_dims));
        gl.bindVertexArray(this.fringe.vao);
        gl.drawElements(gl.TRIANGLE_STRIP, this.fringe.nElems, gl.UNSIGNED_SHORT, 0);
        tl_loc = [
            this.field_x_ndc + (this.field_cols + 1) * this.tile_w_ndc,
            this.field_y_ndc
        ];
        gl.uniform2fv(ul_tl_loc, new Float32Array(tl_loc));
        gl.bindVertexArray(this.fringe.vao);
        gl.drawElements(gl.TRIANGLE_STRIP, this.fringe.nElems, gl.UNSIGNED_SHORT, 0);
        // field
        tl_loc = [this.field_x_ndc + this.tile_w_ndc, this.field_y_ndc];
        gl.uniform2fv(ul_tl_loc, new Float32Array(tl_loc));
        gl.bindVertexArray(this.field.vao);
        gl.drawElements(gl.TRIANGLE_STRIP, this.field.nElems, gl.UNSIGNED_SHORT, 0);
        // bottom fringe
        tl_loc = [
            this.field_x_ndc + this.tile_w_ndc,
            this.field_y_ndc - this.field_rows * this.tile_h_ndc
        ];
        gl.uniform2fv(ul_tl_loc, new Float32Array(tl_loc));
        gl.bindVertexArray(this.b_fringe.vao);
        gl.drawElements(gl.TRIANGLE_STRIP, this.b_fringe.nElems, gl.UNSIGNED_SHORT, 0);
    }
    changePiece(gl, pattern, color) {
        this.piece.updateColorsFromBits(gl, pattern, color);
    }
    renderPiece(gl, row, col, pattern, color) {
        const tl_loc = [
            this.field_x_ndc + this.tile_w_ndc + this.tile_w_ndc * col,
            this.field_y_ndc - this.tile_h_ndc * row
        ];
        const tile_dims = [this.tile_w_ndc, this.tile_h_ndc];
        this.piece.updateColorsFromBits(gl, pattern, color);
        gl.useProgram(this.fieldProgram.handle);
        const ul_tl_loc = this.fieldProgram.getUniformLoc("tl_loc");
        const ul_tile_dims = this.fieldProgram.getUniformLoc("tile_dims");
        gl.uniform2fv(ul_tl_loc, new Float32Array(tl_loc));
        gl.uniform2fv(ul_tile_dims, new Float32Array(tile_dims));
        gl.bindVertexArray(this.piece.vao);
        this.piece.tex.bindToSampler(gl, this.fieldProgram.handle, 'tex');
        gl.drawElements(gl.TRIANGLE_STRIP, this.piece.nElems, gl.UNSIGNED_SHORT, 0);
    }
}
