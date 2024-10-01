"use strict";
const GUTTER_ROWS = 4;
const FIELD_ROWS = 16;
const FIELD_COLS = 10;
const PREVIEW_PIECES = 3;
const N_PREVIEWS = 1;
const TICKS_PER_SEC = 60;
const SECS_PER_TICK = 1 / TICKS_PER_SEC;
const N_COLORS = 8; // 1 thru 8
const AFTERSHOCK_TICKS = Math.ceil(TICKS_PER_SEC * 0.25);
const CLEARLINE_TICKS = Math.ceil(TICKS_PER_SEC * 0.75);
const FAST_FALL_SPEED_MULT = 16;
const HORIZ_MOVE_SPEED_BLOCKS_PER_SEC = 12;
const HORIZ_MOVE_SPEED_TICKS_PER_BLOCK = 1 / HORIZ_MOVE_SPEED_BLOCKS_PER_SEC / SECS_PER_TICK;
const LINECLEAR_N_FLASHES = 3;
const LINECLEAR_TICKS_PER_FLASH = CLEARLINE_TICKS / LINECLEAR_N_FLASHES;
const LINECLEAR_TICKS_PER_FLASH_PHASE = LINECLEAR_TICKS_PER_FLASH / 2;
const LINECLEAR_LO_COLOR = 10;
const LINECLEAR_HI_COLOR = 1;
class InGameState {
    get secs_per_row() {
        return 1 / this.speed_rows_per_sec;
    }
    get ticks_per_row() {
        return TICKS_PER_SEC * this.secs_per_row;
    }
    clearField() {
        this.field = new Array(FIELD_ROWS * FIELD_COLS).fill(0);
    }
    newPreview() {
        const piece = PieceState.random();
        this.previews.push(piece);
    }
    nextPiece() {
        let next_piece = this.previews.shift();
        if (next_piece == undefined) {
            next_piece = PieceState.random();
        }
        this.newPreview();
        return next_piece;
    }
    static createActivePieceState(piece) {
        const pattern = piece.pattern;
        const new_row = -piece_height(pattern);
        const new_col = Math.floor(FIELD_COLS / 2) - Math.ceil(piece_width(pattern) / 2);
        return new ActivePieceState(new_row, new_col, piece);
    }
    constructor() {
        this.field = Array(FIELD_ROWS * FIELD_COLS).fill(0);
        this.previews = new Array;
        this.events = GameEvent.None;
        this.score = 0;
        this.drops = 0;
        this.tick_no = 0;
        this.speed_rows_per_sec = 2;
        for (let i = 0; i < N_PREVIEWS; i++) {
            this.newPreview();
        }
        const active_piece = InGameState.createActivePieceState(PieceState.random());
        this.state = new GameState_Running(active_piece, 0);
    }
    tick(commands) {
        this.tick_no++;
        this.events = 0;
        // ignoring lineclear, fastfall, pausing, and commands
        if (this.state instanceof GameState_AfterShock) {
            const state = this.state;
            // transition back to piece fall
            if (this.tick_no >= state.end_tick) {
                const piece = this.nextPiece();
                const active = InGameState.createActivePieceState(piece);
                this.state = new GameState_Running(active, this.tick_no);
            }
        }
        else if (this.state instanceof GameState_Clearing) {
            const state = this.state;
            const done = this.tick_no >= state.end_tick;
            const tick_in_flash = this.tick_no % LINECLEAR_TICKS_PER_FLASH;
            const color = tick_in_flash < LINECLEAR_TICKS_PER_FLASH_PHASE ?
                LINECLEAR_LO_COLOR :
                LINECLEAR_HI_COLOR;
            for (let line of state.lines) {
                for (let col = 0; col < FIELD_COLS; col++) {
                    this.field[line * FIELD_COLS + col] = color;
                }
            }
            if (done) {
                this.shiftLines(state.lines);
                const piece = this.nextPiece();
                const active = InGameState.createActivePieceState(piece);
                this.state = new GameState_Running(active, this.tick_no);
            }
        }
        else if (this.state instanceof GameState_Running) {
            const state = this.state;
            const piece = state.active_piece;
            const shape = piece.state;
            const rotate_left = !!(commands & GameCommand.PieceRotateL);
            const rotate_right = !!(commands & GameCommand.PieceRotateR);
            let rotate_command = rotate_left || rotate_right;
            if (!rotate_command) {
                state.already_rotated = false;
            }
            // handle rotations
            else if (rotate_left != rotate_right && !state.already_rotated) {
                const n_rotations = PIECE_SHAPES[shape.shape].length;
                let which_rotation = shape.rotation;
                if (rotate_right) {
                    which_rotation =
                        (which_rotation + (n_rotations - 1)) % n_rotations;
                }
                else {
                    which_rotation = (which_rotation + 1) % n_rotations;
                }
                const potential_shape = new PieceState(shape.shape, which_rotation, shape.color);
                const box = potential_shape.collisionBox();
                const hits_block = this.hitsBlock(box, piece.row, piece.col, potential_shape.width, potential_shape.height);
                const hits_wall = this.hitsWall(shape.pattern, piece.col, potential_shape.width);
                const hits_floor = this.hitsFloor(potential_shape.pattern, piece.row, potential_shape.height);
                if (!hits_block && !hits_wall && !hits_floor) {
                    piece.state.rotation = which_rotation;
                }
                state.already_rotated = true;
            }
            state.waiting_to_move || (state.waiting_to_move = !!(commands & GameCommand.MoveLeft));
            state.waiting_to_move || (state.waiting_to_move = !!(commands & GameCommand.MoveRight));
            const time_since_last_horiz_move = this.tick_no - state.last_horiz_move;
            const box = shape.collisionBox();
            const move_left = (commands & GameCommand.MoveLeft) ? -1 : 0;
            const move_right = (commands & GameCommand.MoveRight) ? 1 : 0;
            const move_vec = move_left + move_right;
            // handle horizontal moves
            if (state.waiting_to_move && move_vec != 0 &&
                (time_since_last_horiz_move >= HORIZ_MOVE_SPEED_TICKS_PER_BLOCK)) {
                const potential_col = state.active_piece.col + move_vec;
                const hits_wall = this.hitsWall(shape.pattern, potential_col, shape.width);
                const hits_field = this.hitsBlock(box, piece.row, potential_col, shape.width, shape.height);
                if (!hits_wall && !hits_field) {
                    piece.col = potential_col;
                    this.events |= GameEvent.PieceMove;
                }
                state.last_horiz_move = this.tick_no;
                state.waiting_to_move = false;
            }
            const fast_fall = !!(commands & GameCommand.FastFall);
            const drop_speed_factor = (fast_fall ? FAST_FALL_SPEED_MULT : 1);
            const delay = this.ticks_per_row / drop_speed_factor;
            // no need for a drop (or to do anything else)
            if (this.tick_no - state.last_drop < delay) {
                return;
            }
            // handle vertical moves
            this.events |= GameEvent.PieceFall;
            state.last_drop = this.tick_no;
            const potential_row = piece.row + 1;
            const hits_floor = this.hitsFloor(shape.pattern, potential_row, shape.height);
            const hits_block = this.hitsBlock(box, potential_row, piece.col, shape.width, shape.height);
            if (hits_floor || hits_block) {
                // copy the blocks over
                for (let r = 0; r < 4; r++) {
                    for (let c = 0; c < 4; c++) {
                        if (box[r][c]) {
                            const block_index = (piece.row + r) * FIELD_COLS + (piece.col + c);
                            this.field[block_index] = shape.color;
                        }
                    }
                }
                const cleared = this.linesClear(piece.row);
                if (cleared.length > 0) {
                    this.events |= GameEvent.LineClear;
                    this.state = new GameState_Clearing(this.tick_no, this.tick_no + CLEARLINE_TICKS, cleared);
                }
                else {
                    this.events |= GameEvent.PieceCollision;
                    this.state = new GameState_AfterShock(this.tick_no, this.tick_no + AFTERSHOCK_TICKS);
                }
            }
            else {
                piece.row++;
            }
        }
    }
    shiftLines(cleared) {
        const skip = new Set(cleared);
        let row_offset = 0;
        for (let row of skip) {
            this.field.fill(0, row * FIELD_COLS, (row + 1) * FIELD_COLS);
        }
        for (let row = FIELD_ROWS - 1; row >= 0; row--) {
            if (skip.has(row)) {
                row_offset++;
                continue;
            }
            for (let col = 0; col < FIELD_COLS; col++) {
                this.field[(row + row_offset) * FIELD_COLS + col] =
                    this.field[row * FIELD_COLS + col];
            }
        }
    }
    linesClear(start_row) {
        let lines = [];
        const end_row = Math.min(start_row + 4, FIELD_ROWS);
        for (let row = start_row; row < end_row; row++) {
            let row_full = true;
            for (let col = 0; col < FIELD_COLS; col++) {
                if (!this.field[row * FIELD_COLS + col]) {
                    row_full = false;
                    break;
                }
            }
            if (row_full) {
                lines.push(row);
            }
        }
        return lines;
    }
    /// determines if the piece will overlap the wall in either direction.
    hitsWall(pattern, col, width) {
        return col < 0 || col + width > FIELD_COLS;
    }
    /// determines if the piece will overlap the floor.
    hitsFloor(pattern, row, height) {
        return row + height > FIELD_ROWS;
    }
    /// determine if a piece will collide with blocks in the field if it
    /// reaches the given row and column. 
    /// assumes that the piece is not out of bounds or else it will crash.
    hitsBlock(collisionBox, row, col, piece_width, piece_height) {
        const box = collisionBox;
        for (let r = 0; r < piece_height; r++) {
            for (let c = 0; c < piece_width; c++) {
                if (box[r][c] && this.field[(row + r) * FIELD_COLS + (col + c)]) {
                    return true;
                }
            }
        }
        return false;
    }
}
class ActivePieceState {
    constructor(row, col, state) {
        this.row = row;
        this.col = col;
        this.state = state;
    }
}
class PieceState {
    get pattern() {
        return PIECE_SHAPES[this.shape][this.rotation];
    }
    get width() {
        return piece_width(this.pattern);
    }
    get height() {
        return piece_height(this.pattern);
    }
    constructor(shape, rotation, color) {
        this.shape = shape;
        this.rotation = rotation;
        this.color = color;
    }
    static random() {
        const which_piece = Math.floor(Math.random() * PIECE_SHAPES.length);
        const n_rotations = PIECE_SHAPES[which_piece].length;
        const which_rotation = Math.floor(Math.random() * n_rotations);
        const which_color = which_piece + 1;
        return new PieceState(which_piece, which_rotation, which_color);
    }
    collisionBox() {
        return collision_box_from_bits(this.pattern);
    }
}
function collision_box_from_bits(bits) {
    const box = [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
    ];
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            const which_bit = ((3 - row) * 4 + (3 - col));
            const bit = (bits & (1 << which_bit)) ? 1 : 0;
            box[row][col] = bit;
        }
    }
    return box;
}
var GameCommand;
(function (GameCommand) {
    GameCommand[GameCommand["Nop"] = 0] = "Nop";
    GameCommand[GameCommand["PieceRotateR"] = 1] = "PieceRotateR";
    GameCommand[GameCommand["PieceRotateL"] = 2] = "PieceRotateL";
    GameCommand[GameCommand["FastFall"] = 4] = "FastFall";
    GameCommand[GameCommand["Pause"] = 8] = "Pause";
    GameCommand[GameCommand["Unpause"] = 16] = "Unpause";
    GameCommand[GameCommand["MoveLeft"] = 32] = "MoveLeft";
    GameCommand[GameCommand["MoveRight"] = 64] = "MoveRight";
})(GameCommand || (GameCommand = {}));
var GameEvent;
(function (GameEvent) {
    GameEvent[GameEvent["None"] = 0] = "None";
    GameEvent[GameEvent["PieceMove"] = 1] = "PieceMove";
    GameEvent[GameEvent["PieceFall"] = 2] = "PieceFall";
    GameEvent[GameEvent["PieceCollision"] = 4] = "PieceCollision";
    GameEvent[GameEvent["PieceRotation"] = 8] = "PieceRotation";
    GameEvent[GameEvent["LineClear"] = 16] = "LineClear";
    GameEvent[GameEvent["NextPiece"] = 32] = "NextPiece";
})(GameEvent || (GameEvent = {}));
var GameState;
(function (GameState) {
    GameState[GameState["Paused"] = 0] = "Paused";
    GameState[GameState["Running"] = 1] = "Running";
    GameState[GameState["AfterShock"] = 2] = "AfterShock";
    GameState[GameState["Clearing"] = 3] = "Clearing";
    GameState[GameState["WaitingForPiece"] = 4] = "WaitingForPiece";
})(GameState || (GameState = {}));
class GameState_Paused {
    constructor(prev) {
        this.tag = GameState.Paused;
        this.prev_state = prev;
    }
}
class GameState_Clearing {
    constructor(start, end, lines) {
        this.tag = GameState.Clearing;
        this.start_tick = start;
        this.end_tick = end;
        this.lines = lines;
    }
}
class GameState_AfterShock {
    constructor(start, end) {
        this.tag = GameState.AfterShock;
        this.start_tick = start;
        this.end_tick = end;
    }
}
class GameState_Running {
    constructor(piece, start_ticks) {
        this.tag = GameState.Running;
        // if the player presses left or right once, even for a single tick, 
        // we want to be guaranteed to move. 
        this.waiting_to_move = false;
        // once the player has rotated, wait until they press again.
        // cleared when the tick command does not include a rotation.
        this.already_rotated = false;
        this.active_piece = piece;
        this.last_drop = start_ticks;
        this.last_horiz_move = start_ticks;
    }
}
// encode blocks as 16-bit bitmaps
const PIECE_SHAPES = [
    // I blocks
    [
        0x8888,
        0xF000, // horizontal
    ],
    // T blocks
    [
        0xE400,
        0x8C80,
        0x4E00,
        0x4C40, // point left
    ],
    // the one O block
    [
        0xCC00,
    ],
    // L blocks 
    [
        0x88C0,
        0x2E00,
        0xC440,
        0xE800,
    ],
    // J blocks
    [
        0x44C0,
        0xE200,
        0xC880,
        0x8E00,
    ],
    // S blocks
    [
        0x6C00,
        0x8C40,
    ],
    // Z blocks
    [
        0xC600,
        0x4C80,
    ],
];
function piece_height(pattern) {
    if (pattern & 0x000F)
        return 4;
    if (pattern & 0x00F0)
        return 3;
    if (pattern & 0x0F00)
        return 2;
    if (pattern & 0xF000)
        return 1;
    console.assert(false, "piece_height of empty piece? pattern = ", pattern);
    throw new Error('give me a stack trace');
}
function piece_width(pattern) {
    if (pattern & 0x1111)
        return 4;
    if (pattern & 0x2222)
        return 3;
    if (pattern & 0x4444)
        return 2;
    if (pattern & 0x8888)
        return 1;
    console.assert(false, "piece_width of empty piece? pattern = ", pattern);
    throw new Error('give me a stack trace');
}
