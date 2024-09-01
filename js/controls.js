"use strict";
class Keyboard {
    clearButtons() {
        this.buttonsPressed.clear();
    }
    wasJustPressed(name) {
        return this.buttonsPressed.has(name);
    }
    clearPressed(name) {
        this.buttonsPressed.delete(name);
    }
    getPressedAndClear(name) {
        const pressed = this.wasJustPressed(name);
        this.clearPressed(name);
        return pressed;
    }
    isKeyDown(name) {
        return this.keysDown.has(name);
    }
    isKeyUp(name) {
        return !this.keysDown.has(name);
    }
    handleKeydown(event) {
        this.keysDown.add(event.code);
    }
    handleKeyup(event) {
        this.keysDown.delete(event.code);
    }
    constructor() {
        this.keysDown = new Set();
        this.buttonsPressed = new Set();
        const boundKeyDown = this.handleKeydown.bind(this);
        const boundKeyUp = this.handleKeyup.bind(this);
        document.addEventListener('keydown', boundKeyDown);
        document.addEventListener('keyup', boundKeyUp);
    }
}
