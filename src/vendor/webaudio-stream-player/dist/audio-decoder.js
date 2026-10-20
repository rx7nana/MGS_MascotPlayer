var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class AudioDecoder extends EventTarget {
    constructor(worker) {
        super();
        this._seq = 0;
        this._completerMap = {};
        this._worker = worker;
        this._worker.onmessage = (ev) => this._handleMessage(ev);
    }
    get worker() {
        return this._worker;
    }
    _handleMessage(ev) {
        var _a, _b;
        if (((_a = ev.data) === null || _a === void 0 ? void 0 : _a.type) == "progress") {
            this.dispatchEvent(new CustomEvent("progress", { detail: ev.data.data }));
            return;
        }
        const seq = (_b = ev.data) === null || _b === void 0 ? void 0 : _b.seq;
        if (seq != null) {
            const completer = this._completerMap[seq];
            delete this._completerMap[seq];
            completer(ev.data);
            return;
        }
        this.dispatchEvent(new CustomEvent("decodermessage", { detail: ev.data }));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _request(req, transfer = []) {
        var _a;
        const seq = this._seq++;
        const ts = Date.now();
        (_a = this._worker) === null || _a === void 0 ? void 0 : _a.postMessage(Object.assign({ seq, ts }, req), transfer);
        // const ts2 = Date.now();
        // console.log(`DecoderController req ${req.type}@${seq} ${ts2 - ts}ms`);
        return new Promise((resolve, reject) => {
            this._completerMap[seq] = (e) => {
                // const elapsed = Date.now() - ts2;
                // console.log(`DecoderController res ${e.type}@${e.seq} ${elapsed}ms`);
                if (e.error == null) {
                    resolve(e.data);
                }
                else {
                    reject(e.error);
                }
            };
        });
    }
    init(sampleRate, numberOfChannels) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._request({ type: "init", args: { sampleRate, numberOfChannels } });
        });
    }
    start(outputPort, args) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._request({ type: "start", outputPort, args }, [outputPort]);
        });
    }
    abort() {
        return __awaiter(this, void 0, void 0, function* () {
            return this._request({ type: "abort" });
        });
    }
    terminate() {
        var _a;
        (_a = this._worker) === null || _a === void 0 ? void 0 : _a.terminate();
        this._worker = null;
    }
}
