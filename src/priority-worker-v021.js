import { decode64 } from "./input-bytes-v022.js";
import { decodeMml } from "./mml-codec-port.js";
import { resolveMetadata } from "./metadata-port.js";
import { readMgsHeader } from "./mgs-analysis-port.js";
import { mergeRanges, containsRange } from "./pcm-ranges-v022.js";
let rpcId = 0;
const pending = /* @__PURE__ */ new Map(), contexts = /* @__PURE__ */ new Set(), history = [];
let started = false, cancelled = false, pendingPriority = null, requestSerial = 0, playbackDemandSample = 0, config, file, meta, limit, fades, endFrames;
let ranges = [], rowCount = 0, nativeCpuMillis = 0, nativeRssMax = 0, endAnnounced = false;
function native(...args) {
  return new Promise((resolve, reject) => {
    const id = ++rpcId;
    pending.set(id, { resolve, reject });
    postMessage({ native: { id, args } });
  });
}
onmessage = (e) => {
  const m = e.data;
  if (m.reply) {
    const p = pending.get(m.reply.id);
    if (p) {
      pending.delete(m.reply.id);
      m.reply.error ? p.reject(Error(m.reply.error)) : p.resolve(m.reply.result);
    }
    return;
  }
  if (m.cancel) cancelled = true;
  if (m.priority) {
    pendingPriority = { ...m.priority, serial: ++requestSerial };
    playbackDemandSample = m.priority.sample;
  }
  if (m.priorityDemand !== void 0) playbackDemandSample = m.priorityDemand;
  if (m.start && !started) {
    started = true;
    ({ file, config } = m.start);
    run(m.start).catch(fail);
  }
};
function compact(c, raw) {
  const out = [];
  for (const row of raw.split("\n").filter(Boolean).map((s) => JSON.parse(s))) {
    if (row.kind === "write" || row.kind === "advance-state") continue;
    if (row.kind === "state") {
      const key = row.sourceType + ":" + row.channel, sig = JSON.stringify([row.active, row.period, row.frequency, row.volume, row.instrument, row.waveHash, row.noise, row.hardwareEnvelope]);
      if (c.last.get(key) === sig) continue;
      c.last.set(key, sig);
    }
    out.push(row);
  }
  rowCount += out.length;
  return out;
}
async function create(encoding) {
  const c = { id: await native("new-session", config), position: 0, fadeAt: null, reason: "duration", loops: 0, done: false, last: /* @__PURE__ */ new Map(), pieces: [], rows: [], start: 0, count: 0 };
  contexts.add(c);
  c.compile = await native("compile", c.id, file, encoding);
  c.compile.message = c.compile.stderr64 ? new TextDecoder("shift-jis").decode(decode64(c.compile.stderr64)) : "";
  if (!c.compile.success) throw Error(c.compile.message);
  await native("settings", c.id, { cpu: 0, lpf: meta.values.lpf });
  const info = await native("load", c.id, 48e3);
  if (!info.tempoSupported) throw Error("このドライバでは事前拍情報に対応していません");
  return c;
}
async function destroy(c) {
  if (!c || !contexts.has(c)) return null;
  const r = await native("destroy-session", c.id);
  contexts.delete(c);
  history.push(...r.history);
  if (r.remaining.length) throw Error("Native process remains");
  return r;
}
function flush(c) {
  if (!c.count) {
    if (c.rows.length) {
      postMessage({ restoredRows: c.rows });
      c.rows = [];
    }
    return;
  }
  const pcm = new Int16Array(c.count);
  let at = 0;
  for (const p of c.pieces) {
    pcm.set(p, at);
    at += p.length;
  }
  ranges = mergeRanges(ranges, c.start, c.start + pcm.length);
  const generated = ranges[0]?.[0] === 0 ? ranges[0][1] : 0;
  postMessage({ part: { offset: c.start, generatedFrames: generated, pcm, rows: c.rows } }, [pcm.buffer]);
  c.pieces = [];
  c.rows = [];
  c.count = 0;
}
function add(c, offset, pcm, rows) {
  c.rows.push(...rows);
  const end = offset + pcm.length;
  if (containsRange(ranges, offset, end)) {
    if (c.count) flush(c);
    return;
  }
  if (c.count && c.start + c.count !== offset) flush(c);
  if (!c.count) c.start = offset;
  c.pieces.push(pcm);
  c.count += pcm.length;
  if (c.count >= 24576) flush(c);
}
function knownEnd(c) {
  const frames = Math.min(limit, c.position);
  if (frames < endFrames || !endAnnounced) {
    endFrames = frames;
    endAnnounced = true;
    postMessage({ endKnown: { frames } });
  }
}
async function step(c) {
  if (c.done) return;
  const durationFade = Math.max(0, limit - fades);
  if (c.fadeAt === null && c.position >= durationFade) {
    c.fadeAt = c.position;
    c.reason = "duration";
    if (fades) await native("fade", c.id, meta.values.fade * 1e3);
    else {
      c.done = true;
      knownEnd(c);
      flush(c);
      return;
    }
  }
  const n = Math.min(1024, limit - c.position, c.fadeAt === null && c.position < durationFade ? durationFade - c.position : 1024);
  if (n <= 0) {
    c.done = true;
    knownEnd(c);
    flush(c);
    return;
  }
  const b = await native("pcm", c.id, n), pcm = new Int16Array(decode64(b.pcm64).buffer), offset = c.position;
  c.position += n;
  c.loops = b.loops;
  nativeCpuMillis = b.nativeCpuMillis;
  nativeRssMax = Math.max(nativeRssMax, b.nativeRssKB);
  add(c, offset, pcm, compact(c, b.rawRows));
  if (b.stop) {
    if (c.fadeAt === null) c.reason = "natural-stop";
    c.done = true;
  }
  if (!c.done && c.fadeAt === null && c.loops >= meta.values.loop) {
    c.fadeAt = c.position;
    c.reason = "loop";
    if (fades) await native("fade", c.id, meta.values.fade * 1e3);
    else c.done = true;
  }
  if (c.fadeAt !== null && c.position >= c.fadeAt + fades || c.position >= limit) c.done = true;
  if (c.done) {
    knownEnd(c);
    flush(c);
  }
}
async function restore(target, encoding, bg) {
  flush(bg);
  const serial = target.serial, begin = performance.now(), c = await create(encoding);
  const durationFade = Math.max(0, limit - fades), sample = Math.min(limit, Math.max(0, target.sample));
  let offset = sample < durationFade ? Math.floor(sample / 1024) * 1024 : durationFade + Math.floor((sample - durationFade) / 1024) * 1024;
  while (c.position < offset && !cancelled && pendingPriority?.serial === serial) {
    const b = await native("advance", c.id, Math.min(479232, offset - c.position), limit, meta.values.loop, fades);
    const raw = b.rawRows.split("\n").filter(Boolean).map((x) => JSON.parse(x)), state = raw.at(-1);
    if (state?.kind !== "advance-state") throw Error("Missing priority state confirmation");
    const previous = c.position;
    c.position = state.sample;
    c.fadeAt = state.fadeAt;
    c.reason = state.reason;
    c.done = state.ended;
    c.loops = b.loops;
    if (c.fadeAt !== null && c.reason === "loop") offset = Math.floor(sample / 1024) * 1024;
    const rows = compact(c, b.rawRows);
    if (rows.length) postMessage({ restoredRows: rows });
    if (c.done) {
      knownEnd(c);
      break;
    }
    if (c.position === previous && c.position < offset) throw Error("Priority replay did not reach a canonical block boundary");
  }
  if (cancelled || pendingPriority?.serial !== serial) {
    await destroy(c);
    return null;
  }
  c.priority = target;
  c.restoreMillis = performance.now() - begin;
  c.readyBegin = performance.now();
  postMessage({ priorityMetric: { version: target.version, sample: target.sample, restoreMillis: c.restoreMillis, offset: c.position, phase: "restored" } });
  return c;
}
async function run({ encoding = "AUTO", mode = "B" }) {
  if (mode !== "B" && mode !== "C") throw Error("Invalid variant");
  const begin = performance.now();
  const input = decode64((await native("read-song", file)).bytes64), isMgs = input[0] === 77 && input[1] === 71 && input[2] === 83;
  if (isMgs) readMgsHeader(input);
  const text = isMgs ? "" : decodeMml(input, encoding);
  meta = resolveMetadata(text, config.playerDefaults);
  if (meta.specified.cpu !== void 0 && meta.values.cpu !== 0) meta.warnings.push("cpuは調査待ちのため記録のみ。エミュレーションは既定値0を使用");
  const readMillis = performance.now() - begin;
  postMessage({ progress: 0, phase: "compile", meta });
  const compileBegin = performance.now(), bg = await create(encoding), compileMillis = performance.now() - compileBegin;
  const generationBegin = performance.now(), timings = { readMillis, compileMillis, engineMillis: 0, workerToGenerationMillis: generationBegin - begin };
  limit = Math.ceil(meta.values.duration * 48e3);
  endFrames = limit;
  fades = Math.round(meta.values.fade * 48e3);
  postMessage({ info: { rate: 48e3, frames: limit, seconds: limit / 48e3, metadata: meta, compile: bg.compile, tempoSupported: true, file, timings, finished: false } });
  let priority = null, lastSerial = 0, lastProgress = 0;
  while (!bg.done) {
    if (cancelled) throw Error("Cancelled");
    if (pendingPriority && pendingPriority.serial !== lastSerial) {
      if (priority) {
        flush(priority);
        await destroy(priority);
        priority = null;
      }
      const selected = pendingPriority;
      lastSerial = selected.serial;
      if (!containsRange(ranges, Math.min(selected.sample, endFrames), Math.min(endFrames, selected.sample + 7200))) priority = await restore(selected, encoding, bg);
      continue;
    }
    const needed = priority && !priority.done && priority.position < Math.min(endFrames, Math.max(priority.priority.sample, playbackDemandSample) + 48e3 * 6);
    if (needed) {
      await step(priority);
      if (!priority.notified && containsRange(ranges, Math.min(priority.priority.sample, endFrames), Math.min(endFrames, priority.priority.sample + 7200))) {
        priority.notified = true;
        postMessage({ priorityMetric: { version: priority.priority.version, sample: priority.priority.sample, restoreMillis: priority.restoreMillis, PCMGenerationMillis: performance.now() - priority.readyBegin, phase: "ready" } });
      }
    } else await step(bg);
    if (performance.now() - lastProgress > 150) {
      lastProgress = performance.now();
      postMessage({ phase: "generate", progress: ranges.reduce((s, [a, b]) => s + b - a, 0) / endFrames, generatedSeconds: (ranges[0]?.[0] === 0 ? ranges[0][1] : 0) / 48e3, maxSeconds: meta.values.duration, loops: bg.loops });
    }
  }
  flush(bg);
  if (priority) flush(priority);
  if (!containsRange(ranges, 0, endFrames)) throw Error("Final PCM cache has a missing interval");
  const shutdown = await destroy(bg);
  for (const c of [...contexts]) await destroy(c);
  const result = { timings: { ...timings, pcmGenerationMillis: performance.now() - generationBegin }, mode, nativeShutdown: { ...shutdown, history, remaining: [] }, rate: 48e3, frames: endFrames, seconds: endFrames / 48e3, metadata: meta, compile: bg.compile, tempoSupported: true, loopCount: bg.loops, fadeStartSample: bg.fadeAt, endReason: bg.reason, generationMillis: performance.now() - begin, rssBegin: null, rssPeak: null, rssEnd: null, nativeRssMaxKB: nativeRssMax, nativeCpuMillis, pcmSHA256: shutdown.pcmSHA256, memoryBytes: endFrames * 2, rowCount, file, finished: true };
  postMessage({ audit: { summary: result } });
  postMessage({ result });
  postMessage({ done: true });
  close();
}
async function fail(e) {
  for (const c of [...contexts]) {
    try {
      await destroy(c);
    } catch {
    }
  }
  postMessage({ audit: { error: e.message, cancelled } });
  postMessage({ error: e.message, cancelled, shutdown: { history, remaining: contexts.size ? [...contexts].map((c) => c.id) : [] } });
  postMessage({ done: true });
  close();
}
