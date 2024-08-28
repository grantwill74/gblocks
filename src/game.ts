const GUTTER_ROWS = 4;
const FIELD_ROWS = 16;
const FIELD_COLS = 10;
const LINECLEAR_DELAY_MS = 1000;
const PREVIEW_PIECES = 3;
const N_PREVIEWS = 1;
const TICKS_PER_SEC = 60;
const SECS_PER_TICK = 1 / TICKS_PER_SEC;
const N_COLORS = 8; // 1 thru 8
const AFTERSHOCK_TICKS = Math.ceil (TICKS_PER_SEC * 0.75);

/// color pallette index
type ColorPal = number;

class InGameState {
    field: number[] = Array <number> (FIELD_ROWS * FIELD_COLS).fill (0);

    previews: PieceState[] = new Array <PieceState>;

    state: GameState_Paused | 
        GameState_WaitingForPiece | 
        GameState_Running | 
        GameState_AfterShock;

    commands: GameCommand = GameCommand.Nop;
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

    nextPiece(): void {
        let next_piece = this.previews.shift();

        if (next_piece == undefined) {
            next_piece = PieceState.random();
        }

        this.newPreview();

        if (! (this.state instanceof GameState_Running)) {
            return;
        }

        this.state.active_piece = 
            InGameState.createActivePieceState(next_piece);
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

    tick (): void {
        this.tick_no++;
        this.events = 0;

        // ignoring lineclear, fastfall, pausing, and commands
        
        if (this.state instanceof GameState_Running) {
            const state = this.state;
            
            // no need for a drop (or to do anything)
            if (this.tick_no - state.last_drop < this.ticks_per_row) {
                return;
            }

            this.events |= GameEvent.PieceFall;
            state.last_drop = this.tick_no;

            // check for collision
            const piece = state.active_piece;
            const shape = piece.state;
            const potential_row = piece.row + 1;
            const box = shape.collisionBox ();

            if (this.hitsFloor (shape.pattern, potential_row, shape.height) ||
                this.hitsBlock (box, potential_row, piece.col, shape.width, shape.height)) 
            {
                this.events |= GameEvent.PieceCollision;

                // copy the blocks over
                for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 4; c++) {
                    if (box [r][c]) {
                        this.field [(piece.row + r) * FIELD_COLS + (piece.col + c)] = 
                            shape.color;
                    }
                } }

                this.state = new GameState_AfterShock (this.tick_no, AFTERSHOCK_TICKS);
            }
            else {
                piece.row++;
            }

            this.tick_no++;
        }

        this.commands = 0;
    }


    /// determines if the piece will overlap the wall in either direction.
    hitsWall (pattern: number, col: number, width: number): boolean {
        return col < 0 || col + width >= FIELD_COLS;
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
            if (box[r][c] && this.field[r * FIELD_COLS + c]) {
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

    width: number;
    height: number;
    
    get pattern (): number {
        return PIECE_SHAPES[this.shape][this.rotation];
    }

    constructor (shape: number, rotation: number, color: number) {
        this.shape = shape;
        this.rotation = rotation;
        this.color = color;
        this.width = piece_width (this.pattern);
        this.height = piece_height (this.pattern);
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
    FastFallStart = 4,
    FastFallStop = 8,
    Pause = 0x10,
    Unpause = 0x20,
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
    WaitingForPiece,
}

class GameState_Paused {
    tag: GameState = GameState.Paused;
    prev_state: GameState_Running;

    constructor (prev: GameState_Running) {
        this.prev_state = prev;
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
class GameState_WaitingForPiece {
    tag: GameState = GameState.WaitingForPiece;
    start_tick: number;
    end_tick: number;

    constructor (start: number, end: number) {
        this.start_tick = start;
        this.end_tick = end;
    }
}
class GameState_Running { 
    tag: GameState = GameState.Running;
    fast_fall: boolean = false;
    active_piece: ActivePieceState;
    last_drop: number;

    constructor (piece: ActivePieceState, last_drop: number) {
        this.active_piece = piece;
        this.last_drop = last_drop;
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
        0x4E00,
        0xC440,
        0xE800,
    ],

    // J blocks
    [
        0x44C0,
        0x8E00,
        0xC880,
        0xE200,
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