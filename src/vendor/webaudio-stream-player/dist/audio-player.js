var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { AudioDecoder } from "./audio-decoder.js";
import { AudioRenderer, } from "./audio-renderer.js";
const emptyProgress = {
    decoder: {
        decodeFrames: 0,
        decodeSpeed: 0,
        isDecoding: false,
    },
    renderer: {
        elapsedFrame: 0,
        elapsedTime: 0,
        currentFrame: 0,
        currentTime: 0,
        bufferedFrames: 0,
        bufferedTime: 0,
        isFulFilled: false,
    },
};
export class AudioPlayer {
    constructor(args) {
        var _a;
        this._decoderWorkerFactory = null;
        this._addRendererWorklet = null;
        this._decoder = null;
        this._eventDispatcher = new EventTarget();
        this._renderer = null;
        this._audioContext = null;
        this._destination = null;
        this._state = "initial";
        this._progress = emptyProgress;
        this._onRendererStateChange = ((ev) => {
            this._state = ev.detail;
            this.dispatchEvent(this._createCustomEvent("statechange", { detail: ev.detail }));
        });
        this._onRendererProgress = ((ev) => {
            (this._progress = Object.assign(Object.assign({}, this._progress), { renderer: ev.detail })),
                this.dispatchEvent(this._createCustomEvent("progress", { detail: this._progress }));
        });
        this._onDecoderProgress = ((ev) => {
            (this._progress = Object.assign(Object.assign({}, this._progress), { decoder: ev.detail })),
                this.dispatchEvent(this._createCustomEvent("progress", { detail: this._progress }));
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this._onDecoderMessage = ((ev) => {
            this.dispatchEvent(this._createCustomEvent("decodermessage", { detail: ev.detail }));
        });
        this._rendererType = args.rendererType;
        this._decoderWorkerUrl = args.decoderWorkerUrl;
        this._decoderWorkerFactory = args.decoderWorkerFactory;
        this._rendererWorkletUrl = args.rendererWorkletUrl;
        this._rendererWorkletName = args.rendererWorkletName;
        this._addRendererWorklet = args.addRendererWorklet;
        this._recycleDecoder = (_a = args.recycleDecoder) !== null && _a !== void 0 ? _a : false;
        this._numberOfChannels = args.numberOfChannels;
    }
    get numberOfChannels() {
        return this._numberOfChannels;
    }
    changeRendererType(type) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._rendererType != type) {
                yield this.dispose();
                this._rendererType = type;
            }
        });
    }
    get audioContext() {
        return this._audioContext;
    }
    get outputLatency() {
        var _a;
        if (this._audioContext instanceof AudioContext) {
            return (_a = this._audioContext.outputLatency) !== null && _a !== void 0 ? _a : 0.0;
        }
        return 0.0;
    }
    get state() {
        return this._state;
    }
    get progress() {
        return this._progress;
    }
    // onstatechange: ((state: AudioPlayerState) => void) | null = null;
    // onprogress: ((ev: AudioPlayerProgress) => void) | null = null;
    // ondecodermessage: ((ev: MessageEvent) => void) | null = null;
    connect(destination) {
        if (!(destination.context instanceof AudioContext)) {
            throw new Error("destination is not attached to an AudioContext.");
        }
        this._destination = destination;
    }
    disconnect() {
        this._destination = null;
        return this.dispose();
    }
    addEventListener(type, callback, options) {
        this._eventDispatcher.addEventListener(type, callback, options);
    }
    dispatchEvent(ev) {
        return this._eventDispatcher.dispatchEvent(ev);
    }
    removeEventListener(type, callback, options) {
        this._eventDispatcher.removeEventListener(type, callback, options);
    }
    _createCustomEvent(type, eventInitDict) {
        return new CustomEvent(type, eventInitDict);
    }
    _attachContext(context) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._audioContext != context) {
                if (this._audioContext != null) {
                    yield this.dispose();
                }
                this._audioContext = context;
                if (this._rendererType == "worklet") {
                    if (this._addRendererWorklet != null) {
                        this._addRendererWorklet(this._audioContext);
                    }
                    else if (this._rendererWorkletUrl != null) {
                        yield this._audioContext.audioWorklet.addModule(this._rendererWorkletUrl);
                    }
                    else {
                        throw new Error("Either addRendererWorklet or rendererWorkletUrl is required.");
                    }
                }
            }
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    play(args) {
        return __awaiter(this, void 0, void 0, function* () {
            this._progress = emptyProgress;
            const mch = new MessageChannel();
            if (this._destination == null) {
                throw new Error('Missing destination');
            }
            yield this._attachContext(this._destination.context);
            if (this._audioContext == null) {
                throw new Error('Missing AudioContext');
            }
            if (this._audioContext.state == "suspended") {
                throw new Error("AudioContext is suspended. `await AudioContext.resume()` in advance within the call stack of a UI event handler.");
            }
            if (this._decoder == null) {
                if (this._decoderWorkerFactory != null) {
                    this._decoder = new AudioDecoder(this._decoderWorkerFactory());
                }
                else if (this._decoderWorkerUrl != null) {
                    this._decoder = new AudioDecoder(new Worker(this._decoderWorkerUrl));
                }
                else {
                    throw new Error("Either decoderWorkerFactoty or decoderWorkerUrl is required.");
                }
                yield this._decoder.init(this._audioContext.sampleRate, this._numberOfChannels);
                this._decoder.addEventListener("decodermessage", this._onDecoderMessage);
            }
            else {
                yield this._decoder.abort();
            }
            this._decoder.addEventListener("progress", this._onDecoderProgress);
            yield this._decoder.start(mch.port2, args);
            if (this._renderer == null) {
                this._renderer = AudioRenderer.create(this._rendererType, this._audioContext, this._numberOfChannels, this._rendererWorkletName);
                this._renderer.addEventListener("statechange", this._onRendererStateChange);
            }
            this._renderer.connect(this._destination);
            this._renderer.addEventListener("progress", this._onRendererProgress);
            yield this._renderer.play(mch.port1);
        });
    }
    seekInFrame(frame, relative = false) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (this._state != "initial" && this._state != "aborted") {
                yield ((_a = this._renderer) === null || _a === void 0 ? void 0 : _a.seek(frame, relative));
            }
        });
    }
    seekInTime(time, relative = false) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (this._state != "initial" && this._state != "aborted") {
                const pos = Math.floor((this._audioContext.sampleRate / 1000) * time);
                yield ((_a = this._renderer) === null || _a === void 0 ? void 0 : _a.seek(pos, relative));
            }
        });
    }
    togglePause() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._state == "playing") {
                return this.pause();
            }
            if (this._state == "paused") {
                return this.resume();
            }
        });
    }
    pause() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            yield ((_a = this._renderer) === null || _a === void 0 ? void 0 : _a.pause());
        });
    }
    resume() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            yield ((_a = this._renderer) === null || _a === void 0 ? void 0 : _a.resume());
        });
    }
    /// kill hung-up decoder
    emergencyReset() {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            (_a = this._decoder) === null || _a === void 0 ? void 0 : _a.removeEventListener("message", this._onDecoderMessage);
            (_b = this._decoder) === null || _b === void 0 ? void 0 : _b.terminate();
            this._decoder = null;
            if (this._renderer != null) {
                this._renderer.disconnect();
                this._renderer.removeEventListener("progress", this._onRendererProgress);
                yield this._renderer.abort();
            }
            this._progress = emptyProgress;
            this.dispatchEvent(this._createCustomEvent("progress", { detail: this._progress }));
        });
    }
    abort() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._decoder != null) {
                yield this._decoder.abort();
                this._decoder.removeEventListener("progress", this._onDecoderProgress);
                if (!this._recycleDecoder) {
                    this._decoder.terminate();
                    this._decoder.removeEventListener("message", this._onDecoderMessage);
                    this._decoder = null;
                }
            }
            if (this._renderer != null) {
                this._renderer.disconnect();
                this._renderer.removeEventListener("progress", this._onRendererProgress);
                yield this._renderer.abort();
            }
            this._progress = emptyProgress;
            this.dispatchEvent(this._createCustomEvent("progress", { detail: this._progress }));
        });
    }
    dispose() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (this._decoder != null) {
                yield ((_a = this._decoder) === null || _a === void 0 ? void 0 : _a.abort());
                this._decoder.removeEventListener("progress", this._onDecoderProgress);
                this._decoder.removeEventListener("message", this._onDecoderMessage);
                this._decoder.terminate();
                this._decoder = null;
            }
            if (this._renderer != null) {
                this._renderer.disconnect();
                this._renderer.removeEventListener("progress", this._onRendererProgress);
                this._renderer.removeEventListener("statechange", this._onRendererStateChange);
                yield this._renderer.dispose();
                this._renderer = null;
            }
            this._audioContext = null;
        });
    }
}
