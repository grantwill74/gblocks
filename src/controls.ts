
class Keyboard {
    keysDown: Set <string> = new Set();
    buttonsPressed: Set <string> = new Set();

    clearButtons(): void {
        this.buttonsPressed.clear();
    }

    wasJustPressed (name: string): boolean {
        return this.buttonsPressed.has (name);
    }

    clearPressed (name: string): void {
        this.buttonsPressed.delete (name);
    }

    getPressedAndClear (name: string): boolean {
        const pressed = this.wasJustPressed (name);
        this.clearPressed (name);
        return pressed;
    }

    isKeyDown (name: string): boolean {
        return this.keysDown.has (name);
    }

    isKeyUp (name: string): boolean {
        return !this.keysDown.has (name);
    }

    handleKeydown (event: KeyboardEvent): void {
        this.keysDown.add (event.code);
    }

    handleKeyup (event: KeyboardEvent): void {
        this.keysDown.delete (event.code);
    }

    constructor () {
        const boundKeyDown = this.handleKeydown.bind (this);
        const boundKeyUp = this.handleKeyup.bind (this);
        document.addEventListener ('keydown', boundKeyDown);
        document.addEventListener ('keyup', boundKeyUp);
    }
}