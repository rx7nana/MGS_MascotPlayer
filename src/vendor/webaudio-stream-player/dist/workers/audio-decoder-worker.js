var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class InternalProcessor {
    constructor(id, process) {
        this.aborted = false;
        this._completer = null;
        this.id = id;
        this._process = process;
    }
    abort() {
        this.aborted = true;
        return this._completer;
    }
    run() {
        this._completer = new Promise((resolve) => {
            const res = this._process(this);
            resolve(res);
        });
        return this._completer;
    }
}
export class AudioDecoderWorker {
    constructor(worker) {
        this._outputPort = null;
        this._processorId = 0;
        this._processor = null;
        this._sampleRate = 44100;
        this._numberOfChannels = 2;
        this._worker = worker;
        this._worker.onmessage = (e) => __awaiter(this, void 0, void 0, function* () {
            let res;
            const req = e.data;
            try {
                const data = yield this._onRequest(req);
                res = { seq: req.seq, type: req.type, data: data };
            }
            catch (e) {
                res = { seq: req.seq, type: req.type, error: e };
            }
            this._worker.postMessage(res);
        });
    }
    get worker() {
        return this._worker;
    }
    _detachPort() {
        if (this._outputPort != null) {
            this._outputPort.onmessage = null;
            this._outputPort.close();
            this._outputPort = null;
        }
    }
    get sampleRate() {
        return this._sampleRate;
    }
    get numberOfChannels() {
        return this._numberOfChannels;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _onRequest(req) {
        return __awaiter(this, void 0, void 0, function* () {
            switch (req.type) {
                case "init":
                    this._sampleRate = req.args.sampleRate;
                    this._numberOfChannels = req.args.numberOfChannels;
                    yield this.init(req.args);
                    break;
                case "start":
                    if (this._processor != null) {
                        throw new Error(`Already started.`);
                    }
                    if (req.outputPort == null) {
                        throw new Error("No output port specified.");
                    }
                    this._outputPort = req.outputPort;
                    yield this.start(req.args);
                    this._run();
                    return;
                case "abort":
                    yield this._abort();
                    yield this.abort();
                    this._detachPort();
                    return;
                case "dispose":
                    yield this._abort();
                    yield this.dispose();
                    this._detachPort();
                    return;
                default:
                    throw new Error(`Uknown request type: ${req.type}`);
            }
        });
    }
    _dispatchProgress(elapsed, decodeFrames, isDecoding, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status) {
        const decodeSpeed = elapsed != 0 ? ((decodeFrames / this.sampleRate) * 1000) / elapsed : 0;
        this._worker.postMessage({
            type: "progress",
            data: {
                decodeFrames,
                decodeSpeed,
                isDecoding,
                status,
            },
        });
    }
    _run() {
        return __awaiter(this, void 0, void 0, function* () {
            const start = Date.now();
            let decodeFrames = 0;
            this._processor = new InternalProcessor(this._processorId++, (parent) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b;
                while (!parent.aborted) {
                    const channels = yield this.process();
                    if (channels != null) {
                        decodeFrames += channels[0].length;
                        const transfer = channels.map((e) => e.buffer);
                        (_a = this._outputPort) === null || _a === void 0 ? void 0 : _a.postMessage(channels, transfer);
                    }
                    else {
                        (_b = this._outputPort) === null || _b === void 0 ? void 0 : _b.postMessage(null);
                        break;
                    }
                    this._dispatchProgress(Date.now() - start, decodeFrames, true, this.status());
                    yield new Promise((resolve) => setTimeout(resolve, 0));
                }
            }));
            yield this._processor.run();
            this._dispatchProgress(Date.now() - start, decodeFrames, false, this.status());
            this._processor = null;
        });
    }
    _abort() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._processor != null) {
                yield this._processor.abort();
                this._processor = null;
            }
        });
    }
    status() {
        return undefined;
    }
}
