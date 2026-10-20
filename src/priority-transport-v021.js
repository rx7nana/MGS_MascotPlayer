import { mergeRanges, containsRange } from "./pcm-ranges-v022.js";
import { PreparedIndex } from "./prepared-index.js";
class SortedIndex extends PreparedIndex {
  constructor() {
    super({ rate: 48e3, rows: [] });
    this.keys = /* @__PURE__ */ new Set();
  }
  append(rows) {
    if (!this.keys) this.keys = /* @__PURE__ */ new Set();
    const touched = /* @__PURE__ */ new Set();
    let beats = false;
    for (const r of rows) {
      if (r.kind !== "beat" && !r.sourceType) continue;
      const key = JSON.stringify(r);
      if (this.keys.has(key)) continue;
      this.keys.add(key);
      if (r.kind === "beat") {
        this.beats.push(r);
        beats = true;
      } else {
        const k = r.sourceType + ":" + r.channel;
        if (!this.channels.has(k)) this.channels.set(k, []);
        this.channels.get(k).push(r);
        touched.add(k);
      }
    }
    if (this.keys.size > 3e5) throw Error("演奏情報がメモリ上限を超えました。最大時間を短くしてください");
    if (beats) this.beats.sort((a, b) => a.samplePosition - b.samplePosition);
    for (const k of touched) this.channels.get(k).sort((a, b) => a.samplePosition - b.samplePosition);
  }
}
function resolveInitialBuffer(audio) {
  if (!audio.ready) return;
  audio.firstBufferMillis = performance.now() - audio.operationBegin;
  audio.ready.resolve(audio.compileResult);
  audio.ready = null;
  if (audio.mode === "generating") audio.mode = "stopped";
}
function installPriorityTransport(audio) {
  const RATE = 48e3, LEAD = 24576, PREROLL = 7200;
  audio.cacheRanges = [];
  audio.rendererRanges = [];
  audio.priorityMetrics = [];
  const originalReceive = audio.receive;
  audio.receive = function(m) {
    if (this.variant === "A") return originalReceive.call(this, m);
    if (m.tag !== this.request) return;
    if (m.error) {
      this.error = m.error;
      this.generationActive = false;
      this.ready?.reject(Error(m.error));
      this.ready = null;
      this.mode = "error";
      this.renderer?.pause();
      return;
    }
    if (m.info) {
      this.cacheRanges = [];
      this.rendererRanges = [];
      this.song = { ...m.info, pcm: new Int16Array(m.info.frames) };
      this.index = new SortedIndex();
      this.compiled = true;
      this.compileResult = { ...m.info.compile, metadata: m.info.metadata };
    }
    if (m.restoredRows) this.index?.append(m.restoredRows);
    if (m.priorityMetric) {
      this.priorityMetrics.push(m.priorityMetric);
      if (this.priorityMetrics.length > 200) this.priorityMetrics.shift();
    }
    if (m.endKnown && this.song) {
      this.song.frames = m.endKnown.frames;
      this.song.seconds = m.endKnown.frames / RATE;
      this.song.playbackEndKnown = true;
      if (this.pipeReady) this.pipe.postMessage({ endKnown: true, totalFrames: this.song.frames });
    }
    if (m.part) {
      if (!this.song) return;
      const p = m.part;
      this.song.pcm.set(p.pcm, p.offset);
      this.cacheRanges = mergeRanges(this.cacheRanges, p.offset, p.offset + p.pcm.length);
      this.generated = this.cacheRanges[0]?.[0] === 0 ? this.cacheRanges[0][1] : 0;
      this.index.append(p.rows);
      this.progress = { phase: "background", progress: this.cacheRanges.reduce((s, [a, b]) => s + b - a, 0) / this.song.frames, generatedSeconds: this.generated / RATE, cacheRanges: this.cacheRanges };
      if (this.pipeReady) this.pipe.postMessage({ offset: p.offset, pcm: p.pcm, totalFrames: this.song.frames }, [p.pcm.buffer]);
      if (this.generated >= LEAD) resolveInitialBuffer(this);
    }
    if (m.result) {
      this.generationActive = false;
      const { pcm, rows, ...summary } = m.result;
      Object.assign(this.song, summary);
      this.song.finished = true;
      this.progress = { phase: "ready", progress: 1 };
      if (this.pipeReady) this.pipe.postMessage({ finished: true, totalFrames: this.song.frames });
      this.finalGeneration = summary;
      resolveInitialBuffer(this);
    }
  };
  const originalContext = audio.ensureContext;
  audio.ensureContext = async function() {
    await originalContext.call(this);
    if (this.priorityRenderer === this.renderer) return;
    this.priorityRenderer = this.renderer;
    this.renderer.addEventListener("progress", ({ detail }) => {
      if (detail.cacheRanges) this.rendererRanges = detail.cacheRanges;
    });
  };
  audio.waitBuffered = async function(sample, version) {
    const request = this.request, end = performance.now() + 3e4;
    const cached = () => containsRange(this.cacheRanges, Math.min(sample, this.song?.frames || 0), Math.min(sample + PREROLL, this.song?.frames || 0));
    if (!cached()) await host.prepared("priority", { sample, version }, request);
    while (!cached() || this.pipeReady && !containsRange(this.rendererRanges, Math.min(sample, this.song?.frames || 0), Math.min(sample + PREROLL, this.song?.frames || 0))) {
      if (version !== this.seekVersion || request !== this.request) return false;
      if (this.error) throw Error(this.error);
      if (performance.now() > end) throw Error("シーク先の準備がタイムアウトしました");
      await new Promise((r) => setTimeout(r, 5));
    }
    return version === this.seekVersion && request === this.request;
  };
  const originalPlay = audio.play;
  audio.play = async function() {
    if (this.variant === "A") return originalPlay.call(this);
    if (this.ready) await this.readyPromise;
    while (this.seekTask) {
      const task = this.seekTask;
      await task;
      if (this.seekTask === task) break;
    }
    if (this.mode === "playing") return;
    if (this.mode === "paused" && this.pipeReady) return this.pause();
    if (!this.song && this.currentFile) {
      const r = await this.compile(this.currentFile);
      if (r.cancelled) return;
    }
    if (!this.song) throw Error("先にMMLを選択してください");
    const life = this.lifecycle, begin = performance.now();
    await this.ensureContext();
    if (life !== this.lifecycle) return;
    this.lastTelemetry = null;
    this.priorFrame = -1;
    this.underruns = this.missingSamples = 0;
    this.rendererBuffered = 0;
    this.rendererRanges = [];
    const ch = new MessageChannel();
    this.pipe = ch.port2;
    await this.renderer.play(ch.port1);
    await this.renderer.pause();
    for (const [a, b] of this.cacheRanges) for (let off = a; off < b; off += LEAD) {
      const p = this.song.pcm.slice(off, Math.min(b, off + LEAD));
      this.pipe.postMessage({ offset: off, pcm: p, totalFrames: this.song.frames }, [p.buffer]);
    }
    this.pipeReady = true;
    if (this.song.playbackEndKnown) this.pipe.postMessage({ endKnown: true, totalFrames: this.song.frames });
    if (this.song.finished) this.pipe.postMessage({ finished: true, totalFrames: this.song.frames });
    const sample = Math.floor(this.position * RATE);
    if (!await this.waitBuffered(sample, this.seekVersion)) return;
    await this.renderer.seek(sample);
    this.setVolume(this.volume);
    this.anchor = { song: this.position, context: this.ctx.currentTime };
    this.frozen = this.position;
    this.consumed = sample;
    this.mode = "playing";
    this.endedNotified = false;
    await this.renderer.resume();
    this.contextAndBufferMillis = performance.now() - begin;
    this.restore(sample);
  };
  const originalSample = audio.sample;
  audio.sample = function() {
    const result = originalSample.call(this);
    if (this.mode === "playing" && this.song?.playbackEndKnown && this.position >= this.song.seconds && !this.endedNotified) {
      this.endedNotified = true;
      this.mode = "ended";
      this.position = this.frozen = this.song.seconds;
      queueMicrotask(() => this.onEnded?.());
    }
    if (this.mode === "playing" && performance.now() - (this.priorityDemandAt || 0) > 500) {
      this.priorityDemandAt = performance.now();
      host.prepared("priority-demand", Math.round(this.position * RATE), this.request).catch(() => {
      });
    }
    return result;
  };
  const originalCancel = audio.cancel;
  audio.cancel = async function() {
    await originalCancel.call(this);
    this.cacheRanges = [];
    this.rendererRanges = [];
  };
  const originalSnapshot = audio.snapshot;
  audio.snapshot = function() {
    return { ...originalSnapshot.call(this), cacheRanges: this.cacheRanges, rendererRanges: this.rendererRanges, priorityMetrics: this.priorityMetrics };
  };
}
export {
  installPriorityTransport
};
