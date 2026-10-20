var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { WaveBuffer } from "../wave-buffer.js";
export class AudioRendererWorkletProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(options) {
        super(options);
        this._inputPort = null;
        this._state = "initial";
        this.port.onmessage = (ev) => __awaiter(this, void 0, void 0, function* () {
            let res;
            const req = ev.data;
            try {
                const data = yield this._onCommand(req);
                res = { seq: req.seq, type: req.type, data: data };
            }
            catch (e) {
                res = { seq: req.seq, type: req.type, error: e };
            }
            this.port.postMessage(res);
        });
        this._buffer = new WaveBuffer(sampleRate, options.outputChannelCount);
    }
    _reset() {
        var _a;
        (_a = this._buffer) === null || _a === void 0 ? void 0 : _a.clear();
        if (this._inputPort != null) {
            this._inputPort.onmessage = null;
            this._inputPort.close();
            this._inputPort = null;
        }
    }
    _setState(state) {
        this._state = state;
        this.port.postMessage({ type: "state", state });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _onCommand(cmd) {
        return __awaiter(this, void 0, void 0, function* () {
            switch (cmd.type) {
                case "play":
                    if (this._state != "disposed") {
                        this._reset();
                        if (cmd.inputPort != null) {
                            this._inputPort = cmd.inputPort;
                            this._inputPort.onmessage = (ev) => this._buffer.write(ev.data);
                        }
                        this._setState("playing");
                    }
                    else {
                        console.error("This object has already been disposed.");
                    }
                    return;
                case "pause":
                    if (this._state == "playing") {
                        this._setState("paused");
                    }
                    return;
                case "seek":
                    if (cmd.seekPos != null) {
                        this._buffer.seekTo(cmd.seekPos, cmd.relative);
                        if (this._state == "stopped") {
                            this._setState("playing");
                        }
                    }
                    return;
                case "resume":
                    if (this._state == "paused") {
                        this._setState("playing");
                    }
                    return;
                case "abort":
                    this._reset();
                    this._setState("aborted");
                    return;
                case "dispose":
                    this._reset();
                    this.port.onmessage = null;
                    this._setState("disposed");
                    return;
            }
        });
    }
    process(inputs, outputs) {
        if (this._state == "disposed") {
            return false;
        }
        // In "stopped" (stream fulfilled and drained) idle silently: don't advance
        // the read position or post progress. Still return true — returning false
        // would end this processor's active lifetime for good, and the node must
        // stay revivable for a later seek/play command.
        if (this._state == "playing") {
            const res = this._buffer.onAudioWorkletProcess(inputs, outputs);
            this.port.postMessage({
                type: "progress",
                stat: this._buffer.stat,
            });
            if (!res) {
                this._setState("stopped");
            }
        }
        return true;
    }
}
export function runAudioWorklet(name, ctor) {
    registerProcessor(name, ctor);
}
