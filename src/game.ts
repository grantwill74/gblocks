const GUTTER_ROWS = 4;
const FIELD_ROWS = 16;
const FIELD_COLS = 10;
const LINECLEAR_DELAY = 1000;
const PREVIEW_PIECES = 3;


/// color pallette index
type ColorPal = number;

class InGameState {
    field: number[] = Array <number> (FIELD_ROWS * FIELD_COLS).fill(0);

    active_piece: ActivePieceState | null = null;

    previews: PieceState[] = new Array <PieceState>;

    paused: boolean = false;
    fastfall: boolean = false;
    lineclear_start: number | null = null;

    commands: GameCommand = GameCommand.Nop;
    events: GameEvent = GameEvent.None;

    score: number = 0;
}

class ActivePieceState {
    row: number;
    col: number;
    state: PieceState;

    constructor (row: number, col: number, shape: number, rotation: number) {
        this.row = row;
        this.col = col;
        this.state = new PieceState (shape, rotation);
    }
}

class PieceState {
    shape: number;
    rotation: number;

    constructor (shape: number, rotation: number) {
        this.shape = shape;
        this.rotation = rotation;
    }
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
