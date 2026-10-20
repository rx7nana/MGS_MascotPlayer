export function createSameTypeBuffer(prot, length) {
    if (prot instanceof Float32Array) {
        return new Float32Array(length);
    }
    else if (prot instanceof Int32Array) {
        return new Int32Array(length);
    }
    else if (prot instanceof Int16Array) {
        return new Int16Array(length);
    }
    else if (prot instanceof Int8Array) {
        return new Int8Array(length);
    }
    else if (prot instanceof Uint8Array) {
        return new Uint8Array(length);
    }
    else {
        throw new Error(`Unsupported array type ${typeof prot}`);
    }
}
export class MonoWaveBuffer {
    constructor(initialLength) {
        this._wave = null;
        this.rp = 0;
        this.wp = 0;
        this._initialLength = initialLength;
    }
    get wave() {
        return this._wave;
    }
    get byteLength() {
        if (this._wave != null) {
            return this.wp * this._wave.BYTES_PER_ELEMENT;
        }
        return 0;
    }
    seekTo(frame, relative) {
        if (relative) {
            this.rp += frame;
        }
        else {
            this.rp = frame;
        }
        this.rp = Math.min(Math.max(0, this.rp), this.wp);
    }
    clear() {
        this._wave = null;
        this.wp = 0;
        this.rp = 0;
    }
    write(data) {
        if (this._wave == null) {
            this._wave = createSameTypeBuffer(data, this._initialLength);
        }
        if (typeof data != typeof this._wave) {
            throw new Error(`The type of wave sample has changed during playing from ${typeof this
                ._wave} to ${typeof data}.`);
        }
        if (this.wp + data.length > this._wave.length) {
            const newWave = createSameTypeBuffer(this._wave, this._wave.length * 2);
            newWave.set(this._wave);
            this._wave = newWave;
        }
        this._wave.set(data, this.wp);
        this.wp += data.length;
    }
    process(output) {
        if (this._wave instanceof Float32Array) {
            for (let i = 0; i < output.length; i++) {
                if (this.rp < this.wp) {
                    output[i] = this._wave[this.rp];
                }
                else {
                    output[i] = 0;
                }
                this.rp++;
            }
        }
        else if (this._wave instanceof Int32Array) {
            for (let i = 0; i < output.length; i++) {
                if (this.rp < this.wp) {
                    output[i] = this._wave[this.rp] / (1 << 31);
                }
                else {
                    output[i] = 0;
                }
                this.rp++;
            }
        }
        else if (this._wave instanceof Int16Array) {
            for (let i = 0; i < output.length; i++) {
                if (this.rp < this.wp) {
                    output[i] = this._wave[this.rp] / (1 << 15);
                }
                else {
                    output[i] = 0;
                }
                this.rp++;
            }
        }
        else if (this._wave instanceof Int8Array) {
            for (let i = 0; i < output.length; i++) {
                if (this.rp < this.wp) {
                    output[i] = this._wave[this.rp] / (1 << 7);
                }
                else {
                    output[i] = 0;
                }
                this.rp++;
            }
        }
        else if (this._wave instanceof Uint8Array) {
            for (let i = 0; i < output.length; i++) {
                if (this.rp < this.wp) {
                    output[i] = (this._wave[this.rp] - 128) / (1 << 7);
                }
                else {
                    output[i] = 0;
                }
                this.rp++;
            }
        }
        else {
            // do nothing
        }
    }
}
export class WaveBuffer {
    constructor(sampleRate, numberOfChannels, prerollFrames = Math.floor(sampleRate * 0.15)) {
        this._isFulFilled = false;
        this._primed = false;
        this._sampleRate = sampleRate;
        this._prerollFrames = Math.max(0, prerollFrames);
        this._waves = Array();
        for (let i = 0; i < numberOfChannels; i++) {
            this._waves.push(new MonoWaveBuffer(sampleRate * 60));
        }
    }
    get sampleRate() {
        return this._sampleRate;
    }
    get isFulFilled() {
        return this._isFulFilled;
    }
    seekTo(frame, relative) {
        for (const wave of this._waves) {
            wave.seekTo(frame, relative);
        }
    }
    clear() {
        for (const wave of this._waves) {
            wave.clear();
        }
        this._isFulFilled = false;
        this._primed = false;
    }
    get stat() {
        const currentFrame = this._waves[0].rp;
        const bufferedFrames = this._waves[0].wp;
        return {
            currentFrame,
            currentTime: Math.floor((currentFrame / this._sampleRate) * 1000),
            bufferedFrames,
            bufferedTime: Math.floor((bufferedFrames / this._sampleRate) * 1000),
            isFulFilled: this._isFulFilled,
        };
    }
    write(inputs) {
        if (inputs == null || inputs.length == 0 || inputs[0] == null) {
            this._isFulFilled = true;
            console.debug(`buffered: ${(this._waves[0].byteLength / 1024 / 1024).toFixed(2)}MB`);
        }
        else {
            const k = Math.min(inputs.length, this._waves.length);
            for (let i = 0; i < k; i++) {
                this._waves[i].write(inputs[i]);
            }
        }
    }
    _processImpl(channels) {
        // Pre-roll: after a (re)start, output silence without advancing the read
        // pointer until enough is buffered (or the stream is complete), so playback
        // doesn't begin into an underrun on a slow decoder.
        if (!this._primed) {
            const buffered = this._waves[0].wp - this._waves[0].rp;
            if (!this._isFulFilled && buffered < this._prerollFrames) {
                for (const ch of channels)
                    ch.fill(0);
                return true;
            }
            this._primed = true;
        }
        const k = Math.min(channels.length, this._waves.length);
        for (let i = 0; i < k; i++) {
            this._waves[i].process(channels[i]);
        }
        if (this._isFulFilled && this._waves[0].rp >= this._waves[0].wp) {
            return false;
        }
        return true;
    }
    onAudioProcess(ev) {
        const channels = [];
        for (let i = 0; i < ev.outputBuffer.numberOfChannels; i++) {
            channels.push(ev.outputBuffer.getChannelData(i));
        }
        return this._processImpl(channels);
    }
    onAudioWorkletProcess(inputs, outputs) {
        const channels = outputs[0];
        return this._processImpl(channels);
    }
}
