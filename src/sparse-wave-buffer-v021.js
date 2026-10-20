import { mergeRanges, rangeEnd } from "./pcm-ranges-v022.js";
import { mergeRanges as mergeRanges2, rangeEnd as rangeEnd2, containsRange } from "./pcm-ranges-v022.js";
class SparseWaveBuffer {
  constructor(rate, channels) {
    this.rate = rate;
    this.channels = channels;
    this._prerollFrames = Math.floor(rate * 0.15);
    this.clear();
  }
  clear() {
    this.pcm = null;
    this.ranges = [];
    this.position = 0;
    this.frames = 0;
    this._primed = false;
    this._isFulFilled = false;
    this.endKnown = false;
    this.revision = (this.revision || 0) + 1;
  }
  get isFulFilled() {
    return this._isFulFilled || this.endKnown && rangeEnd(this.ranges, this.position) >= this.frames;
  }
  get stat() {
    const end = Math.min(this.frames, rangeEnd(this.ranges, this.position));
    return { currentFrame: this.position, currentTime: Math.floor(this.position / this.rate * 1e3), bufferedFrames: end, bufferedTime: Math.floor(end / this.rate * 1e3), isFulFilled: this.isFulFilled, cacheRanges: this.ranges.map((r) => [...r]), cacheRevision: this.revision };
  }
  seekTo(frame, relative) {
    this.position = Math.max(0, Math.min(this.frames, Math.round((relative ? this.position : 0) + frame)));
    this._primed = false;
  }
  write(message) {
    this.revision++;
    if (message === null) {
      this._isFulFilled = true;
      return;
    }
    if (!message || !Number.isInteger(message.totalFrames) || message.totalFrames < 0 || message.totalFrames > 288e5) throw Error("Invalid sparse PCM duration");
    if (!this.pcm) this.pcm = new Int16Array(message.totalFrames);
    this.frames = message.totalFrames;
    if (message.endKnown) {
      this.endKnown = true;
      return;
    }
    if (message.finished) {
      this._isFulFilled = true;
      return;
    }
    const { offset, pcm } = message;
    if (!(pcm instanceof Int16Array) || !Number.isInteger(offset) || offset < 0 || offset + pcm.length > this.pcm.length) throw Error("Invalid sparse PCM chunk");
    this.pcm.set(pcm, offset);
    this.ranges = mergeRanges(this.ranges, offset, Math.min(this.frames, offset + pcm.length));
  }
  onAudioWorkletProcess(inputs, outputs) {
    const channels = outputs[0], n = channels[0].length;
    const available = Math.min(this.frames, rangeEnd(this.ranges, this.position)) - this.position;
    if (!this._primed) {
      if (!this.isFulFilled && available < this._prerollFrames) {
        for (const c of channels) c.fill(0);
        return true;
      }
      this._primed = true;
    }
    for (const out of channels) for (let i = 0; i < n; i++) out[i] = i < available ? this.pcm[this.position + i] / 32768 : 0;
    this.position = Math.min(this.frames, this.position + n);
    return !((this._isFulFilled || this.endKnown) && this.position >= this.frames);
  }
}
export {
  SparseWaveBuffer,
  containsRange,
  mergeRanges2 as mergeRanges,
  rangeEnd2 as rangeEnd
};
