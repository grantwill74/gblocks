"use strict";
var FrogErrorKind;
(function (FrogErrorKind) {
    FrogErrorKind[FrogErrorKind["Unknown"] = 0] = "Unknown";
    FrogErrorKind[FrogErrorKind["CanvasInit"] = 1] = "CanvasInit";
    FrogErrorKind[FrogErrorKind["ContextInit"] = 2] = "ContextInit";
    FrogErrorKind[FrogErrorKind["CreateShader"] = 3] = "CreateShader";
    FrogErrorKind[FrogErrorKind["CreateMesh"] = 4] = "CreateMesh";
    FrogErrorKind[FrogErrorKind["CreateBuffer"] = 5] = "CreateBuffer";
    FrogErrorKind[FrogErrorKind["CreateTexture"] = 6] = "CreateTexture";
    FrogErrorKind[FrogErrorKind["BindMesh"] = 7] = "BindMesh";
    FrogErrorKind[FrogErrorKind["BindUniform"] = 8] = "BindUniform";
    FrogErrorKind[FrogErrorKind["EnumShader"] = 9] = "EnumShader";
    FrogErrorKind[FrogErrorKind["GetActiveElem"] = 10] = "GetActiveElem";
    FrogErrorKind[FrogErrorKind["TooManyVertices"] = 11] = "TooManyVertices";
    FrogErrorKind[FrogErrorKind["LoadingColorPalette"] = 12] = "LoadingColorPalette";
})(FrogErrorKind || (FrogErrorKind = {}));
function unreachable() {
    throw new Error("Unreachable code was reached.");
}
function errorText(kind) {
    switch (kind) {
        case FrogErrorKind.Unknown:
            return "An error occurred in a previous step. Add more asserts.";
        case FrogErrorKind.CanvasInit:
            return "Unable to initialize graphics because a properly named " +
                "canvas element is missing from the webpage.";
        case FrogErrorKind.ContextInit:
            return "Unable to initialize a graphics context. This can happen " +
                "if your browser does not support WebGL2";
        case FrogErrorKind.CreateShader:
            return "Error when creating a shader.";
        case FrogErrorKind.CreateMesh:
            return "Error when creating a mesh.";
        case FrogErrorKind.CreateBuffer:
            return "Error when creating a buffer.";
        case FrogErrorKind.CreateTexture:
            return "Error when creating a texture.";
        case FrogErrorKind.BindMesh:
            return "Error when binding a vertex array.";
        case FrogErrorKind.BindUniform:
            return "Error binding a uniform to a shader.";
        case FrogErrorKind.EnumShader:
            return "Error when enumerating shader info.";
        case FrogErrorKind.GetActiveElem:
            return "Error obtaining an active program element.";
        case FrogErrorKind.TooManyVertices:
            return "Too many vertices in mesh (max 65535)";
        case FrogErrorKind.LoadingColorPalette:
            return "Unable to load color palette.";
    }
}
class FrogError {
    constructor(kind, msg = null) {
        this.kind = kind;
        if (!msg) {
            this.msg = errorText(kind);
        }
        else {
            this.msg = msg;
        }
    }
    // currently, all errors are fatal except unknown
    get isFatal() {
        return this.kind != FrogErrorKind.Unknown;
    }
}
function assertGlClear(error) {
    if (!error) {
        return;
    }
    const msg = "An error was present before a GL operation. That means an " +
        "error state was missed after a previous operation. Current error: " +
        error;
    throw new FrogError(FrogErrorKind.Unknown, msg);
}
function assertNoGlError(glError, errorKind, extraText = '') {
    if (!glError)
        return;
    const msgParts = [errorText(errorKind)];
    if (extraText != '') {
        msgParts.push(extraText);
    }
    msgParts.push('gl error code: ' + glError);
    throw new FrogError(errorKind, msgParts.join(' '));
}
