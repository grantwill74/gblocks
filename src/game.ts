const GUTTER_ROWS = 4;
const FIELD_ROWS = 16;
const FIELD_COLS = 10;
const PREVIEW_PIECES = 3;
const N_PREVIEWS = 1;
const TICKS_PER_SEC = 60;
const SECS_PER_TICK = 1 / TICKS_PER_SEC;
const N_COLORS = 8; // 1 thru 8
const AFTERSHOCK_TICKS = Math.ceil (TICKS_PER_SEC * 0.25);
const CLEARLINE_TICKS = Math.ceil (TICKS_PER_SEC * 1.0);
const FAST_FALL_SPEED_MULT = 16;
const HORIZ_MOVE_SPEED_BLOCKS_PER_SEC = 12;
const HORIZ_MOVE_SPEED_TICKS_PER_BLOCK = 
    1 / HORIZ_MOVE_SPEED_BLOCKS_PER_SEC / SECS_PER_TICK;

const LINECLEAR_N_FLASHES = 4;
const LINECLEAR_TICKS_PER_FLASH = CLEARLINE_TICKS / LINECLEAR_N_FLASHES;
const LINECLEAR_TICKS_PER_FLASH_PHASE = LINECLEAR_TICKS_PER_FLASH / 2;
const LINECLEAR_LO_COLOR = 10;
const LINECLEAR_HI_COLOR = 1;

/// color pallette index
type ColorPal = number;

class InGameState {
    field: number[] = Array <number> (FIELD_ROWS * FIELD_COLS).fill (0);

    previews: PieceState[] = new Array <PieceState>;

    state: GameState_Paused | 
        GameState_Running | 
        GameState_AfterShock;

    events: GameEvent = GameEvent.None;

    score: number = 0;
    drops: number = 0;
    tick_no: number = 0;

    speed_rows_per_sec: number = 2;

    get secs_per_row(): number {
        return 1 / this.speed_rows_per_sec;
    }

    get ticks_per_row(): number {
        return TICKS_PER_SEC * this.secs_per_row;
    }

    clearField(): void {
        this.field = new Array <number> (FIELD_ROWS * FIELD_COLS).fill (0);
    }

    newPreview(): void {
        const piece = PieceState.random();
        this.previews.push (piece);
    }

    nextPiece(): PieceState {
        let next_piece = this.previews.shift();

        if (next_piece == undefined) {
            next_piece = PieceState.random();
        }

        this.newPreview();

        return next_piece;
    }

    static createActivePieceState(piece: PieceState): ActivePieceState {
        const pattern = piece.pattern;
        const new_row = - piece_height (pattern);
        const new_col = 
            Math.floor (FIELD_COLS / 2) - Math.ceil (piece_width (pattern) / 2);
        
        return new ActivePieceState (new_row, new_col, piece);
    }

    constructor() {
        for (let i = 0; i < N_PREVIEWS; i++) {
            this.newPreview();
        }

        const active_piece = 
            InGameState.createActivePieceState (PieceState.random());
        this.state = new GameState_Running (active_piece, 0);
    }

    tick (commands: number): void {
        this.tick_no++;
        this.events = 0;

        // ignoring lineclear, fastfall, pausing, and commands
        if (this.state instanceof GameState_AfterShock) {
            const state = this.state;

            // transition back to piece fall
            if (this.tick_no >= state.end_tick) {
                const piece = this.nextPiece();
                const active = InGameState.createActivePieceState (piece);
                this.state = new GameState_Running (active, this.tick_no);
            }
        }
        else if (this.state instanceof GameState_Clearing) {
            const state = this.state;
            const done = this.tick_no >= state.end_tick;

            const tick_in_flash = this.tick_no % LINECLEAR_TICKS_PER_FLASH;
            const color = 
                tick_in_flash <  LINECLEAR_TICKS_PER_FLASH_PHASE ?
                LINECLEAR_LO_COLOR :
                LINECLEAR_HI_COLOR;
                
            for (let line of state.lines) {
                for (let col = 0; col < FIELD_COLS; col++) {
                    this.field [line * FIELD_COLS + col] = color;
                }
            }

            if (done) {
                this.shiftLines (state.lines);

                const piece = this.nextPiece();
                const active = InGameState.createActivePieceState (piece);
                this.state = new GameState_Running (active, this.tick_no);
            }
        }
        else if (this.state instanceof GameState_Running) {
            const state = this.state;
            const piece = state.active_piece;
            const shape = piece.state;

            const rotate_left = !! (commands & GameCommand.PieceRotateL);
            const rotate_right = !! (commands & GameCommand.PieceRotateR);
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

                const potential_shape = 
                    new PieceState (shape.shape, which_rotation, shape.color);
                const box = potential_shape.collisionBox();
                
                const hits_block = this.hitsBlock (
                    box, piece.row, piece.col, 
                    potential_shape.width, 
                    potential_shape.height
                );

                const hits_wall = this.hitsWall (
                    shape.pattern, 
                    piece.col, 
                    potential_shape.width
                );

                const hits_floor = this.hitsFloor (
                    potential_shape.pattern, 
                    piece.row, 
                    potential_shape.height
                );
                
                if (!hits_block && !hits_wall && !hits_floor) {
                    piece.state.rotation = which_rotation;
                }

                state.already_rotated = true;
            }

            state.waiting_to_move ||= !! (commands & GameCommand.MoveLeft);
            state.waiting_to_move ||= !! (commands & GameCommand.MoveRight);
            const time_since_last_horiz_move = this.tick_no - state.last_horiz_move;
            
            const box = shape.collisionBox ();

            // handle horizontal moves
            if (state.waiting_to_move && 
               (time_since_last_horiz_move >= HORIZ_MOVE_SPEED_TICKS_PER_BLOCK)
            ) {
                const move_left = (commands & GameCommand.MoveLeft) ? -1 : 0;
                const move_right = (commands & GameCommand.MoveRight) ? 1 : 0;
                const move_vec = move_left + move_right;
                const potential_col = state.active_piece.col + move_vec;


                const hits_wall = this.hitsWall (
                    shape.pattern, potential_col, shape.width);
                const hits_field = this.hitsBlock (
                    box, piece.row, potential_col, shape.width, shape.height);

                if (!hits_wall && !hits_field) {
                    piece.col = potential_col;
                }

                state.last_horiz_move = this.tick_no;
                state.waiting_to_move = false;
            }


            const fast_fall = !! (commands & GameCommand.FastFall);
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
            const hits_floor = this.hitsFloor (
                shape.pattern, potential_row, shape.height);
            const hits_block = this.hitsBlock (
                box, potential_row, piece.col, shape.width, shape.height)

            if (hits_floor || hits_block) {
                this.events |= GameEvent.PieceCollision;

                // copy the blocks over
                for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 4; c++) {
                    if (box [r][c]) {
                        const block_index = 
                            (piece.row + r) * FIELD_COLS + (piece.col + c);
                        this.field [block_index] = shape.color;
                    }
                } }

                const cleared = this.linesClear (piece.row);

                if (cleared.length > 0) {
                    this.state = new GameState_Clearing (
                        this.tick_no, this.tick_no + CLEARLINE_TICKS, cleared);
                }
                else {
                    this.state = new GameState_AfterShock (
                        this.tick_no, this.tick_no + AFTERSHOCK_TICKS);
                }
            }
            else {
                piece.row++;
            }
        }
    }

    shiftLines (cleared: number[]): void {
        const skip = new Set(cleared);
        let row_offset = 0;

        for (let row of skip) {
            this.field.fill (0, row * FIELD_COLS, (row + 1) * FIELD_COLS);
        }
        
        for (let row = FIELD_ROWS - 1; row >= 0; row--) {
            if (skip.has (row)) {
                row_offset++;
                continue;
            }

            for (let col = 0; col < FIELD_COLS; col++) {
                this.field [(row + row_offset) * FIELD_COLS + col] =
                    this.field [row * FIELD_COLS + col];
            }
        }
    }

    linesClear (start_row: number): number[] {
        let lines = [];
        const end_row = Math.min (start_row + 4, FIELD_ROWS);

        for (let row = start_row; row < end_row; row++) {
            let row_full = true;

            for (let col = 0; col < FIELD_COLS; col++) {
                if (!this.field[row * FIELD_COLS + col]) {
                    row_full = false;
                    break;
                }
            }

            if (row_full) {
                lines.push (row);
            }
        }

        return lines;
    }


    /// determines if the piece will overlap the wall in either direction.
    hitsWall (pattern: number, col: number, width: number): boolean {
        return col < 0 || col + width > FIELD_COLS;
    }

    /// determines if the piece will overlap the floor.
    hitsFloor (pattern: number, row: number, height: number): boolean {
        return row + height > FIELD_ROWS;
    }

    /// determine if a piece will collide with blocks in the field if it
    /// reaches the given row and column. 
    /// assumes that the piece is not out of bounds or else it will crash.
    hitsBlock (
        collisionBox: number[][], 
        row: number, col: number, 
        piece_width: number, 
        piece_height: number
    ): boolean 
    {
        const box = collisionBox;
        
        for (let r = 0; r < piece_height; r++) {
        for (let c = 0; c < piece_width; c++) {
            if (box[r][c] && this.field[(row + r) * FIELD_COLS + (col + c)]) {
                return true;
            }
        } }

        return false;
    }
}

class ActivePieceState {
    row: number;
    col: number;
    state: PieceState;

    constructor (row: number, col: number, state: PieceState) {
        this.row = row;
        this.col = col;
        this.state = state;
    }
}

class PieceState {
    shape: number;
    rotation: number;
    color: number;
    
    get pattern(): number {
        return PIECE_SHAPES[this.shape][this.rotation];
    }

    get width(): number {
        return piece_width (this.pattern);
    }

    get height(): number {
        return piece_height (this.pattern);
    }

    constructor (shape: number, rotation: number, color: number) {
        this.shape = shape;
        this.rotation = rotation;
        this.color = color;
    }

    static random(): PieceState {
        const which_piece = Math.floor (Math.random() * PIECE_SHAPES.length);
        const n_rotations = PIECE_SHAPES[which_piece].length;
        const which_rotation = Math.floor (Math.random() * n_rotations);
        const which_color = Math.floor (Math.random() * 8) + 1;

        return new PieceState (which_piece, which_rotation, which_color);
    }

    collisionBox(): number[][] {
        return collision_box_from_bits (this.pattern);
    }
}

function collision_box_from_bits (bits: number): number[][] {
    const box: number[][] = [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
    ];

    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            const which_bit = ((3 - row ) * 4 + (3 - col));
            const bit = (bits & (1 << which_bit)) ? 1 : 0;
            box [row][col] = bit;
        }
    }

    return box;
}

enum GameCommand {
    Nop = 0,
    PieceRotateR = 1,
    PieceRotateL = 2,
    FastFall = 4,
    Pause = 8,
    Unpause = 0x10,
    MoveLeft = 0x20,
    MoveRight = 0x40,
}

enum GameEvent {
    None = 0,
    PieceFall = 1,
    PieceCollision = 2,
    PieceRotation = 4,
    LineClear = 8,
    NextPiece = 0x10,
}

enum GameState {
    Paused = 0,
    Running,
    AfterShock,
    Clearing,
    WaitingForPiece,
}

class GameState_Paused {
    tag: GameState = GameState.Paused;
    prev_state: GameState_Running;

    constructor (prev: GameState_Running) {
        this.prev_state = prev;
    }
}
class GameState_Clearing {
    tag: GameState = GameState.Clearing;
    start_tick: number;
    end_tick: number;
    lines: number[];

    constructor (start: number, end: number, lines: number[]) {
        this.start_tick = start;
        this.end_tick = end;
        this.lines = lines;
    }
}
class GameState_AfterShock {
    tag: GameState = GameState.AfterShock;
    start_tick: number;
    end_tick: number;

    constructor (start: number, end: number) {
        this.start_tick = start;
        this.end_tick = end;
    }
}
class GameState_Running { 
    tag: GameState = GameState.Running;
    active_piece: ActivePieceState;
    last_drop: number;
    last_horiz_move: number;

    // if the player presses left or right once, even for a single tick, 
    // we want to be guaranteed to move. 
    waiting_to_move: boolean = false; 

    // once the player has rotated, wait until they press again.
    // cleared when the tick command does not include a rotation.
    already_rotated: boolean = false;

    constructor (
        piece: ActivePieceState, 
        start_ticks: number,
    ) {
        this.active_piece = piece;
        this.last_drop = start_ticks;
        this.last_horiz_move = start_ticks;
    }
}

// encode blocks as 16-bit bitmaps
const PIECE_SHAPES: number[][] = [
    // I blocks
    [ 
        0x8888, // vertical
        0xF000, // horizontal
    ],

    // T blocks
    [
        0xE400, // point down (actual T)
        0x8C80, // point right
        0x4E00, // point up
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
]

function piece_height (pattern: number): number {
    if (pattern & 0x000F) return 4;
    if (pattern & 0x00F0) return 3;
    if (pattern & 0x0F00) return 2;
    if (pattern & 0xF000) return 1;

    console.assert (false, "piece_height of empty piece? pattern = ", pattern)
    throw new Error ('give me a stack trace');
}

function piece_width (pattern: number): number {
    if (pattern & 0x1111) return 4;
    if (pattern & 0x2222) return 3;
    if (pattern & 0x4444) return 2;
    if (pattern & 0x8888) return 1;

    console.assert (false, "piece_width of empty piece? pattern = ", pattern)
    throw new Error ('give me a stack trace');
}