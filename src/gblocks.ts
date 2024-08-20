
function getCanvasOrThrow(): HTMLCanvasElement {
    const maybeCanvas = document.querySelector("canvas");

    if (!maybeCanvas) {
        throw new FrogError (FrogErrorKind.CanvasInit);
    }

    return maybeCanvas;
}

function getWebgl2ContextOrThrow(canvas: HTMLCanvasElement)
    : WebGL2RenderingContext 
{
    const maybeContext = canvas.getContext ('webgl2');

    if (!maybeContext) {
        throw new FrogError (FrogErrorKind.ContextInit);
    }

    return maybeContext;
}

// technically constants, but we can pretend
let SCREEN_W: number;
let SCREEN_H: number;

// ndcs per pixel
let NDC_PER_PIX_X: number;
let NDC_PER_PIX_Y: number;

// tile dimensions in normalized device coordinates
let TILE_W_NDC: number;
let TILE_H_NDC: number;

async function run(): Promise<void> {
    try {
        const canvas = getCanvasOrThrow();
        const gl = getWebgl2ContextOrThrow (canvas);

        SCREEN_W = canvas.width;
        SCREEN_H = canvas.height;

        NDC_PER_PIX_X = 2 / SCREEN_W;
        NDC_PER_PIX_Y = 2 / SCREEN_H;

        TILE_W_NDC = TILE_W_PX * NDC_PER_PIX_X;
        TILE_H_NDC = TILE_H_PX * NDC_PER_PIX_Y;

        // add 2 columns and 1 row for the fringe
        const field_w_px = TILE_W_PX * (FIELD_COLS + 2);
        const field_h_px = TILE_H_PX * (FIELD_ROWS + 1);

        const field_x_px = SCREEN_W / 2 - field_w_px / 2;
        const field_y_px = SCREEN_H / 2 - field_h_px / 2;

        const field_x_ndc = field_x_px * NDC_PER_PIX_X - 1;
        const field_y_ndc = -field_y_px * NDC_PER_PIX_Y + 1;

        console.log (field_x_px, field_y_px, field_x_ndc, field_y_ndc);

        const renderer = new InGameRenderer (
            gl, 
            FIELD_ROWS, FIELD_COLS,
            field_x_ndc, field_y_ndc
        )

        gl.clearColor (0, 0, 0, 1);
        gl.clear (gl.COLOR_BUFFER_BIT);

        const random_colors: number[] = [];
        for (let row = 0; row < FIELD_ROWS; row++) {
            for (let col = 0; col < FIELD_COLS; col++) {
                random_colors.push ( Math.floor (Math.random() * 9) );
            }
        }

        renderer.updateField (gl, random_colors);
        renderer.renderField (gl);
        
        /*
        const vshader = Webgl2Shader.vertex (gl, V_SHADER);
        const fshader = Webgl2Shader.fragment (gl, F_SHADER);
        const gridProgram = new Webgl2Program (gl, vshader, fshader);
        gl.useProgram (gridProgram.handle);

        assertGlClear (gl.getError());

        // load fixed palette
        const palletLoc = gridProgram.getUniformLoc ("color_palette");
        gl.uniform3fv (palletLoc, new Float32Array (PALETTE));
        assertNoGlError (gl.getError(), FrogErrorKind.LoadingColorPalette);

        console.assert (!gl.getError());

        const piece = new GridMesh (gl, 4, 4, gridProgram);
        piece.updateColors (gl, [1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8]);
        

        const tl_loc = [-0.0, 0.0];
        const tile_dims = [TILE_W_NDC, TILE_H_NDC];
        gl.useProgram (gridProgram.handle);
        const ul_tl_loc = gridProgram.getUniformLoc ("tl_loc");
        const ul_tile_dims = gridProgram.getUniformLoc ("tile_dims");
        gl.uniform2fv (ul_tl_loc, new Float32Array (tl_loc));
        gl.uniform2fv (ul_tile_dims, new Float32Array (tile_dims));
        gl.bindVertexArray (piece.vao);
        gl.drawElements (gl.TRIANGLE_STRIP, piece.nElems, gl.UNSIGNED_SHORT, 0);
        */
    }
    catch (err: unknown) {
        if (err instanceof FrogError) {
            if (err.isFatal) {
                alert (err.msg);
                console.error (err.msg);
            }
            else {
                console.warn (err.msg);
            }
        }
        else {
            console.error (err);
        }
    }
}