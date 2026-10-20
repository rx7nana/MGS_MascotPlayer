import { mergeRanges } from "./pcm-ranges-v022.js";
function mergeGeneratedRanges(ranges, start, count) {
  if (!Number.isInteger(start) || !Number.isInteger(count) || start < 0 || count <= 0) return ranges;
  return mergeRanges(ranges, start, start + count);
}
function installV020Presentation(audio, getConfig) {
  const seek = document.querySelector("#seek");
  const area = document.createElement("div");
  area.id = "seek-area";
  seek.replaceWith(area);
  const track = document.createElement("div");
  track.id = "pcm-cache-track";
  track.setAttribute("aria-hidden", "true");
  const wait = document.createElement("output");
  wait.id = "seek-wait";
  wait.hidden = true;
  wait.setAttribute("aria-live", "off");
  area.append(track, seek, wait);
  const style = document.createElement("style");
  style.textContent = `
    #seek-area{flex:1;min-width:0;position:relative;height:18px;display:flex;align-items:center}
    #pcm-cache-track{position:absolute;left:0;right:0;height:4px;border-radius:3px;background:color-mix(in srgb,var(--ui-text) 22%,transparent);overflow:hidden;pointer-events:none}
    #pcm-cache-track span{position:absolute;top:0;height:100%;background:color-mix(in srgb,var(--ui-accent) 72%,transparent)}
    #seek-area #seek{position:relative;width:100%;margin:0;height:18px;appearance:none;background:transparent;z-index:1;touch-action:none}
    #seek-area #seek::-webkit-slider-runnable-track{height:4px;background:transparent}
    #seek-area #seek::-webkit-slider-thumb{appearance:none;width:8px;height:8px;margin-top:-2px;border-radius:50%;background:var(--ui-accent);border:1px solid var(--ui-text)}
    #seek-wait{position:absolute;bottom:24px;transform:translateX(-50%);padding:2px 5px;border-radius:4px;background:var(--ui-base);color:var(--ui-text);white-space:nowrap;pointer-events:none;font-variant-numeric:tabular-nums}
    #seek-wait[hidden]{display:none}
  `;
  document.head.append(style);
  let ranges = [], song = null, waiting = null, signature = "", sequence = 0;
  function gain() {
    const value = getConfig().gain ?? 1, metadata = audio.song?.metadata;
    if (metadata && metadata.origin?.gain !== "MML" && metadata.values.gain !== value) {
      metadata.values.gain = value;
      metadata.origin.gain = "player";
      audio.setVolume(audio.volume);
    }
  }
  const receive = audio.receive;
  audio.receive = function(message) {
    if (message.tag !== this.request) return receive.call(this, message);
    if (message.info) {
      ranges = [];
      signature = "";
    }
    const chunk = message.part ? [message.part.offset, message.part.pcm.length] : null;
    const result = receive.call(this, message);
    song = this.song;
    if (chunk) ranges = mergeGeneratedRanges(ranges, ...chunk);
    if (message.error) ranges = [];
    gain();
    update();
    return result;
  };
  const seekOriginal = audio.seek;
  audio.seek = function(seconds) {
    const current = { id: ++sequence, started: performance.now(), target: Number(seconds), version: this.seekVersion + 1, request: this.request };
    waiting = current;
    let result;
    try {
      result = seekOriginal.call(this, seconds);
    } catch (error) {
      clear(current);
      throw error;
    }
    Promise.resolve(result).finally(() => clear(current)).catch(() => {
    });
    return result;
  };
  const waitOriginal = audio.waitBuffered;
  audio.waitBuffered = async function(sample, version) {
    const current = waiting?.version === version ? waiting : null;
    try {
      return await waitOriginal.call(this, sample, version);
    } finally {
      if (current) clear(current);
    }
  };
  function clear(current) {
    if (waiting === current) {
      waiting = null;
      wait.hidden = true;
    }
  }
  for (const name of ["stop", "cancel", "release"]) {
    const original = audio[name];
    audio[name] = function(...args) {
      waiting = null;
      wait.hidden = true;
      return original.apply(this, args);
    };
  }
  function update() {
    if (song !== audio.song) {
      song = audio.song;
      ranges = [];
      signature = "";
    }
    if (!song || audio.mode === "error") ranges = [];
    gain();
    const frames = song?.frames || 0;
    const visible = ranges.map(([a, b]) => [Math.min(a, frames), Math.min(b, frames)]).filter(([a, b]) => b > a);
    const next = JSON.stringify([frames, visible]);
    if (next !== signature) {
      signature = next;
      track.replaceChildren();
      for (const [a, b] of visible) {
        const span = document.createElement("span");
        span.style.left = `${a / frames * 100}%`;
        span.style.width = `${(b - a) / frames * 100}%`;
        track.append(span);
      }
      seek.setAttribute("aria-description", frames ? `PCM生成済み ${visible.map(([a, b]) => `${(a / 48e3).toFixed(2)}〜${(b / 48e3).toFixed(2)}秒`).join("、")}` : "PCM未生成");
    }
    if (waiting && (audio.seekVersion !== waiting.version || audio.request !== waiting.request || audio.error)) {
      waiting = null;
    }
    const elapsed = waiting ? (performance.now() - waiting.started) / 1e3 : 0;
    wait.hidden = !waiting || elapsed < 0.3;
    if (!wait.hidden) {
      wait.textContent = `${elapsed.toFixed(2)} s`;
      wait.style.left = `${Math.max(4, Math.min(96, waiting.target / (song?.seconds || getConfig().duration) * 100))}%`;
    }
  }
  const timer = setInterval(update, 100);
  addEventListener("pagehide", () => clearInterval(timer), { once: true });
  const api = {
    config() {
      gain();
      update();
    },
    snapshot() {
      return { ranges: ranges.map((x) => [...x]), waitVisible: !wait.hidden, waitText: wait.textContent, elapsed: waiting ? (performance.now() - waiting.started) / 1e3 : null, effectiveGain: audio.song?.metadata?.values.gain, gainOrigin: audio.song?.metadata?.origin?.gain, frames: audio.song?.frames || 0, generated: audio.generated };
    },
    update
  };
  audio.presentationV020 = api;
  update();
  return api;
}
export {
  installV020Presentation,
  mergeGeneratedRanges
};
