var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { isChrome } from "./utils.js";
import { WaveBuffer } from "./wave-buffer.js";
export class AudioRenderer extends EventTarget {
    constructor(delegate) {
        super();
        this._delegate = delegate;
        this._delegate.onprogress = (ev) => {
            this.dispatchEvent(new CustomEvent("progress", { detail: ev }));
        };
        this._delegate.onstatechange = (ev) => {
            this.dispatchEvent(new CustomEvent("statechange", { detail: ev }));
        };
    }
    static create(type, context, numberOfChannels, workletName) {
        if (type == "worklet") {
            if (workletName == null) {
                throw new Error(`workletName must be specified.`);
            }
            return new AudioRenderer(new WorkletRenderer(context, numberOfChannels, workletName));
        }
        else if (type == "script") {
            return new AudioRenderer(new ScriptRenderer(context, numberOfChannels));
        }
        else {
            throw new Error(`Unspported renderer type: ${type}`);
        }
    }
    get state() {
        return this._delegate.state;
    }
    connect(destination) {
        return this._delegate.connect(destination);
    }
    disconnect() {
        return this._delegate.disconnect();
    }
    play(input) {
        return this._delegate.play(input);
    }
    seek(pos, relative = false) {
        return this._delegate.seek(pos, relative);
    }
    pause() {
        return this._delegate.pause();
    }
    resume() {
        return this._delegate.resume();
    }
    abort() {
        return this._delegate.abort();
    }
    dispose() {
        return this._delegate.dispose();
    }
}
class WorkletRenderer {
    constructor(audioContext, numberOfChannels, workletName) {
        this._state = "initial";
        this._seq = 0;
        this._completerMap = {};
        this.onprogress = null;
        this.onstatechange = null;
        this._node = new AudioWorkletNode(audioContext, workletName, {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [numberOfChannels],
            // parameterData: null,
            // processorOptions: null,
        });
        this._numberOfChannels = numberOfChannels;
        this._node.port.onmessage = (ev) => this._handleMessage(ev);
    }
    get numberOfChannels() {
        return this._numberOfChannels;
    }
    setState(newState) {
        if (this._state != newState) {
            this._state = newState;
            if (this.onstatechange) {
                this.onstatechange(this._state);
            }
        }
    }
    get state() {
        return this._state;
    }
    _handleMessage(ev) {
        var _a, _b, _c;
        switch ((_a = ev.data) === null || _a === void 0 ? void 0 : _a.type) {
            case "progress":
                if (this.onprogress != null) {
                    this.onprogress(Object.assign({}, ev.data.stat));
                }
                break;
            case "state":
                this.setState((_b = ev.data) === null || _b === void 0 ? void 0 : _b.state);
                break;
        }
        const seq = (_c = ev.data) === null || _c === void 0 ? void 0 : _c.seq;
        if (seq != null) {
            const completer = this._completerMap[seq];
            delete this._completerMap[seq];
            completer(ev.data);
        }
    }
    _request(req, transfer = []) {
        const seq = this._seq++;
        this._node.port.postMessage(Object.assign({ seq }, req), transfer);
        // const start = Date.now();
        return new Promise((resolve, reject) => {
            this._completerMap[seq] = (e) => {
                // const elapsed = Date.now() - start;
                // console.log(`WorkletController[${e.seq}]:${e.type} ${elapsed}ms`);
                if (e.error == null) {
                    resolve(e.data);
                }
                else {
                    reject(e.error);
                }
            };
        });
    }
    connect(destination) {
        this._node.connect(destination);
    }
    disconnect() {
        this._node.disconnect();
    }
    play(input) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._state == "playing" || this._state == "paused") {
                yield this._request({ type: "abort" });
            }
            yield this._request({ type: "play", inputPort: input }, [input]);
            this.setState("playing");
        });
    }
    seek(pos, relative) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._request({ type: "seek", seekPos: pos, relative });
        });
    }
    pause() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._state == "playing") {
                yield this._request({ type: "pause" });
                this.setState("paused");
            }
        });
    }
    resume() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._state == "paused") {
                yield this._request({ type: "resume" });
                this.setState("playing");
            }
        });
    }
    abort() {
        return __awaiter(this, void 0, void 0, function* () {
            // "stopped" must be abortable too: the worklet keeps running (and posting
            // progress) after it drains the buffer, until it receives an abort.
            if (this._state == "playing" || this._state == "paused" || this._state == "stopped") {
                yield this._request({ type: "abort" });
                this.setState("aborted");
            }
        });
    }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._request({ type: "dispose" });
            this.setState("disposed");
            if (isChrome) {
                console.warn(`StreamerWorkletController.dispose: This operation may cause memory-leak on Chrome since Chrome will not release the AudioWorklet after the tied AudioContext is closed. See: https://bugs.chromium.org/p/chromium/issues/detail?id=1298955`);
            }
        });
    }
}
class ScriptRenderer {
    constructor(audioContext, numberOfChannels) {
        this._inputPort = null;
        this._state = "initial";
        this.onprogress = null;
        this.onstatechange = null;
        this._node = audioContext.createScriptProcessor(1024, 0, numberOfChannels);
        this._node.onaudioprocess = (ev) => this._onAudioProcess(ev);
        this._buffer = new WaveBuffer(audioContext.sampleRate, numberOfChannels);
        this._numberOfChannels = numberOfChannels;
    }
    get numberOfChannels() {
        return this._numberOfChannels;
    }
    get state() {
        return this._state;
    }
    setState(newState) {
        if (this._state != newState) {
            this._state = newState;
            if (this.onstatechange != null) {
                this.onstatechange(this._state);
            }
        }
    }
    connect(destination) {
        this._node.connect(destination);
    }
    disconnect() {
        this._node.disconnect();
    }
    play(input) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._inputPort != null) {
                this._inputPort.onmessage = null;
                this._inputPort.close();
            }
            this._inputPort = input;
            this._inputPort.onmessage = (ev) => this._buffer.write(ev.data);
            this._buffer.clear();
            this.setState("playing");
        });
    }
    seek(pos, relative) {
        return __awaiter(this, void 0, void 0, function* () {
            this._buffer.seekTo(pos, relative);
        });
    }
    pause() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._state == "playing") {
                this.setState("paused");
            }
        });
    }
    resume() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._state == "paused") {
                this.setState("playing");
            }
        });
    }
    abort() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._state == "playing" || this._state == "paused" || this._state == "stopped") {
                this._buffer.clear();
                this.setState("aborted");
            }
        });
    }
    _onAudioProcess(ev) {
        // Same policy as the worklet renderer: once "stopped", idle silently
        // instead of advancing the read position and reporting progress.
        if (this._state == "playing") {
            const res = this._buffer.onAudioProcess(ev);
            if (this.onprogress != null) {
                this.onprogress(this._buffer.stat);
            }
            if (!res) {
                this.setState("stopped");
            }
        }
    }
    dispose() {
        return __awaiter(this, void 0, void 0, function* () {
            this._buffer.clear();
            if (this._inputPort != null) {
                this._inputPort.onmessage = null;
                this._inputPort.close();
                this._inputPort = null;
            }
            this._node.onaudioprocess = null;
            this.setState("disposed");
        });
    }
}
