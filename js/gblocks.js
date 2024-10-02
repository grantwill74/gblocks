"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
function getCanvasOrThrow() {
    const maybeCanvas = document.querySelector("canvas");
    if (!maybeCanvas) {
        throw new FrogError(FrogErrorKind.CanvasInit);
    }
    return maybeCanvas;
}
function getWebgl2ContextOrThrow(canvas) {
    const maybeContext = canvas.getContext('webgl2');
    if (!maybeContext) {
        throw new FrogError(FrogErrorKind.ContextInit);
    }
    return maybeContext;
}
// technically constants, but we can pretend
let SCREEN_W;
let SCREEN_H;
// ndcs per pixel
let NDC_PER_PIX_X;
let NDC_PER_PIX_Y;
// tile dimensions in normalized device coordinates
let TILE_W_NDC;
let TILE_H_NDC;
let renderer;
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const sound_prom = SoundSys.create();
            const canvas = getCanvasOrThrow();
            const gl = getWebgl2ContextOrThrow(canvas);
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
            const game = new InGameState();
            const renderer = new InGameRenderer(gl, FIELD_ROWS, FIELD_COLS, field_x_ndc, field_y_ndc);
            const keys = new Keyboard();
            const sound = yield sound_prom;
            const song = slavonicDances();
            sound.music[ChannelId.Pulse2] = new SoundProcess(song, 160);
            sound.music[ChannelId.Pulse2].loops = true;
            sound.music[ChannelId.Pulse2].start(sound.context.currentTime);
            function tick(_now) {
                setTimeout(tick, SECS_PER_TICK * 1000);
                if (game.events & GameEvent.PieceCollision) {
                    sound.crash();
                }
                if (game.events & GameEvent.LineClear) {
                    sound.clear1();
                }
                if (game.events & GameEvent.PieceMove) {
                    sound.moveBeep();
                }
                let commands = 0;
                if (keys.isKeyDown('ArrowDown')) {
                    commands |= GameCommand.FastFall;
                }
                if (keys.isKeyDown('ArrowLeft')) {
                    commands |= GameCommand.MoveLeft;
                }
                if (keys.isKeyDown('ArrowRight')) {
                    commands |= GameCommand.MoveRight;
                }
                if (keys.isKeyDown('KeyZ') || keys.isKeyDown('ArrowUp')) {
                    commands |= GameCommand.PieceRotateL;
                }
                if (keys.isKeyDown('KeyX')) {
                    commands |= GameCommand.PieceRotateR;
                }
                game.tick(commands);
                sound.tick(sound.context.currentTime);
            }
            function render(_now) {
                requestAnimationFrame(render);
                gl.clearColor(0, 0, 0, 1);
                gl.clear(gl.COLOR_BUFFER_BIT);
                renderer.renderField(gl, game.field);
                if (game.state instanceof GameState_Running) {
                    const state = game.state;
                    renderer.renderPiece(gl, state.active_piece.row, state.active_piece.col, state.active_piece.state.pattern, state.active_piece.state.color);
                }
            }
            tick(performance.now());
            render(performance.now());
        }
        catch (err) {
            if (err instanceof FrogError) {
                if (err.isFatal) {
                    alert(err.msg);
                    console.error(err.msg);
                }
                else {
                    console.warn(err.msg);
                }
            }
            else {
                console.error(err);
            }
        }
    });
}
function render() {
}
