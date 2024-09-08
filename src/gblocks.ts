
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

let renderer: InGameRenderer;

async function run(): Promise<void> {
    try {
        const sound_prom = SoundSys.create();
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

        const game = new InGameState (); 
        const renderer = new InGameRenderer (
            gl, 
            FIELD_ROWS, FIELD_COLS,
            field_x_ndc, field_y_ndc
        )
        const keys = new Keyboard ();
        const sound = await sound_prom;

        function tick (_now: number) {
            setTimeout (tick, SECS_PER_TICK * 1000);

            if (game.events & GameEvent.PieceCollision) {
                sound.crash ();
            }

            let commands = 0;

            if (keys.isKeyDown ('ArrowDown')) {
                commands |= GameCommand.FastFall;
            }
            if (keys.isKeyDown ('ArrowLeft')) {
                commands |= GameCommand.MoveLeft;
            }
            if (keys.isKeyDown ('ArrowRight')) {
                commands |= GameCommand.MoveRight;
            }
            if (keys.isKeyDown ('KeyZ') || keys.isKeyDown ('ArrowUp')) {
                commands |= GameCommand.PieceRotateL;
            }
            if (keys.isKeyDown ('KeyX')) {
                commands |= GameCommand.PieceRotateR;
            }

            game.tick (commands);
        }

        function render (_now: number) {
            requestAnimationFrame (render);

            gl.clearColor (0, 0, 0, 1);
            gl.clear (gl.COLOR_BUFFER_BIT);

            renderer.renderField (gl, game.field);

            if (game.state instanceof GameState_Running) {
                const state = game.state;
                renderer.renderPiece (gl, 
                    state.active_piece.row,
                    state.active_piece.col,
                    state.active_piece.state.pattern,
                    state.active_piece.state.color
                );
            }
        }

        tick (performance.now());
        render (performance.now());
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

function render() {

}