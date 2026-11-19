// ==UserScript==
// @name         Douyu Accelerator
// @namespace    https://github.com/whisperers26/DouyuAccelerator
// @version      0.1.0
// @description  Stops 1080p60/2K stutter on Douyu video replays: downloads upcoming segments in parallel so the CDN edge has them cached before the player asks.
// @author       whisperers26
// @match        https://v.douyu.com/show/*
// @run-at       document-start
// @grant        none
// @homepageURL  https://github.com/whisperers26/DouyuAccelerator
// @supportURL   https://github.com/whisperers26/DouyuAccelerator/issues
// @downloadURL  https://raw.githubusercontent.com/whisperers26/DouyuAccelerator/main/douyu-accelerator.user.js
// @updateURL    https://raw.githubusercontent.com/whisperers26/DouyuAccelerator/main/douyu-accelerator.user.js
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '[douyu-accelerator]';
  const STORAGE_KEY = 'douyuAccelerator';
  const DEFAULTS = Object.freeze({ enabled: true, aheadSec: 90, concurrency: 6 });
  const MAX_ATTEMPTS = 3;
  const TICK_MS = 1000;

  // ---- pure parts (unit-tested in tests/) ----

  function isPlaylistUrl(url) {
    let u;
    try {
      u = new URL(url);
    } catch (_) {
      return false;
    }
    return /(^|\.)douyucdn\d*\.cn$/.test(u.hostname) && /\.m3u8$/.test(u.pathname);
  }

  // Signed URLs carry the viewer's device id and a signature in the query: never log them.
  function redactUrl(url) {
    return String(url).split('?')[0];
  }

  function parsePlaylist(text, playlistUrl) {
    const lines = String(text || '').split(/\r?\n/);
    if (lines[0].trim() !== '#EXTM3U') return [];
    const segments = [];
    let pending = null;
    let start = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#EXTINF:')) {
        pending = parseFloat(line.slice(8));
        continue;
      }
      if (line.startsWith('#')) continue;
      if (pending === null || !isFinite(pending)) continue; // variant playlist entry, not a segment
      let url;
      try {
        url = new URL(line, playlistUrl).href;
      } catch (_) {
        pending = null;
        continue;
      }
      segments.push({ index: segments.length, url, start, duration: pending });
      start += pending;
      pending = null;
    }
    return segments;
  }

  function segmentIndexAt(segments, time) {
    if (!segments.length) return -1;
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segments[mid].start <= time) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  // Which segments to start downloading and which in-flight downloads to abort.
  // The window runs from just after the segment the player will fetch next (the one at the
  // end of its buffer) to the segment `aheadSec` past the playhead.
  function planDownloads(p) {
    const { segments, currentTime, bufferedEnd, aheadSec, concurrency, done, inflight, failures, maxAttempts } = p;
    if (!segments.length) return { start: [], abort: [] };
    const current = segmentIndexAt(segments, currentTime);
    const from = segmentIndexAt(segments, Math.max(currentTime, bufferedEnd)) + 1;
    const to = segmentIndexAt(segments, currentTime + aheadSec);

    const abort = [...inflight].filter((i) => i < current || i > to).sort((a, b) => a - b);
    let slots = concurrency - (inflight.size - abort.length);
    const start = [];
    for (let i = from; i <= to && slots > 0; i++) {
      if (done.has(i) || inflight.has(i)) continue;
      if ((failures.get(i) || 0) >= maxAttempts) continue;
      start.push(i);
      slots--;
    }
    return { start, abort };
  }

  function clampNumber(value, min, max, fallback) {
    return typeof value === 'number' && isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
  }

  function readConfig(stored) {
    let saved = {};
    try {
      const parsed = stored ? JSON.parse(stored) : {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
    } catch (_) {
      // fall back to the defaults
    }
    return {
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : DEFAULTS.enabled,
      aheadSec: clampNumber(saved.aheadSec, 10, 600, DEFAULTS.aheadSec),
      concurrency: clampNumber(saved.concurrency, 1, 16, DEFAULTS.concurrency),
    };
  }

  const core = { DEFAULTS, isPlaylistUrl, redactUrl, parsePlaylist, segmentIndexAt, planDownloads, readConfig };

  if (typeof module === 'object' && module && module.exports) {
    module.exports = core;
    return;
  }

  // ---- page runtime ----

  function findMainVideo(root) {
    let best = null;
    let bestArea = -1;
    (function walk(node) {
      if (!node) return;
      if (node.tagName === 'VIDEO') {
        const area = node.clientWidth * node.clientHeight;
        if (area > bestArea) {
          best = node;
          bestArea = area;
        }
      }
      if (node.shadowRoot) walk(node.shadowRoot);
      for (const child of node.children || []) walk(child);
    })(root);
    return best;
  }

  function bufferedEndAt(video, time) {
    const ranges = video.buffered;
    for (let i = 0; i < ranges.length; i++) {
      if (ranges.start(i) <= time + 0.5 && time <= ranges.end(i)) return ranges.end(i);
    }
    return time;
  }

  function start(win) {
    let config;
    try {
      config = readConfig(win.localStorage.getItem(STORAGE_KEY));
    } catch (_) {
      config = { ...DEFAULTS };
    }
    if (!config.enabled) {
      console.info(TAG, 'disabled (localStorage.' + STORAGE_KEY + ')');
      return;
    }

    const state = {
      playlistUrl: null,
      segments: [],
      generation: 0,
      done: new Set(),
      inflight: new Map(), // index -> AbortController
      failures: new Map(),
      video: null,
      stats: { completed: 0, aborted: 0, failed: 0, bytes: 0 },
    };

    function resetDownloads() {
      for (const ctl of state.inflight.values()) ctl.abort();
      state.inflight.clear();
      state.done = new Set();
      state.failures = new Map();
    }

    async function loadPlaylist(url) {
      resetDownloads();
      const generation = ++state.generation;
      state.playlistUrl = url;
      state.segments = [];
      try {
        const res = await win.fetch(url, { cache: 'no-store' });
        const segments = parsePlaylist(await res.text(), url);
        if (generation !== state.generation) return;
        state.segments = segments;
        console.info(TAG, 'playlist', redactUrl(url), segments.length + ' segments');
      } catch (err) {
        if (generation === state.generation) console.warn(TAG, 'could not load playlist', redactUrl(url), err && err.message);
      }
    }

    async function download(index) {
      const generation = state.generation;
      const segment = state.segments[index];
      const ctl = new AbortController();
      state.inflight.set(index, ctl);
      let bytes = 0;
      try {
        const res = await win.fetch(segment.url, { cache: 'no-store', signal: ctl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        // Read to the end: the edge only keeps a segment it delivered completely.
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
        }
        if (generation !== state.generation) return;
        state.done.add(index);
        state.stats.completed++;
        state.stats.bytes += bytes;
      } catch (err) {
        if (generation !== state.generation) return;
        if (ctl.signal.aborted) {
          state.stats.aborted++;
        } else {
          state.failures.set(index, (state.failures.get(index) || 0) + 1);
          state.stats.failed++;
          console.warn(TAG, 'segment ' + index + ' failed:', err && err.message);
        }
      } finally {
        if (state.inflight.get(index) === ctl) state.inflight.delete(index);
      }
    }

    function tick() {
      if (!state.segments.length) return;
      if (!state.video || !state.video.isConnected) state.video = findMainVideo(win.document.documentElement);
      const video = state.video;
      if (!video || video.readyState === 0) return;
      const currentTime = video.currentTime;
      const { start: toStart, abort } = planDownloads({
        segments: state.segments,
        currentTime,
        bufferedEnd: bufferedEndAt(video, currentTime),
        aheadSec: config.aheadSec,
        concurrency: config.concurrency,
        done: state.done,
        inflight: new Set(state.inflight.keys()),
        failures: state.failures,
        maxAttempts: MAX_ATTEMPTS,
      });
      for (const index of abort) {
        const ctl = state.inflight.get(index);
        if (ctl) ctl.abort();
        state.inflight.delete(index);
      }
      for (const index of toStart) download(index);
    }

    function onResource(name) {
      if (name === state.playlistUrl || !isPlaylistUrl(name)) return;
      loadPlaylist(name);
    }

    function safe(fn) {
      return function () {
        try {
          return fn.apply(this, arguments);
        } catch (err) {
          console.warn(TAG, err);
        }
      };
    }

    try {
      new win.PerformanceObserver(
        safe((list) => {
          for (const entry of list.getEntries()) onResource(entry.name);
        }),
      ).observe({ type: 'resource', buffered: true });
    } catch (err) {
      console.warn(TAG, 'no PerformanceObserver, not running', err);
      return;
    }
    win.setInterval(safe(tick), TICK_MS);

    win.__douyuAccelerator = {
      config,
      status() {
        const video = state.video;
        const current = video ? segmentIndexAt(state.segments, video.currentTime) : -1;
        return {
          playlist: state.playlistUrl && redactUrl(state.playlistUrl),
          segments: state.segments.length,
          playingSegment: current,
          inflight: [...state.inflight.keys()].sort((a, b) => a - b),
          warmedAhead: [...state.done].filter((i) => i > current).length,
          ...state.stats,
          megabytes: Math.round(state.stats.bytes / 1e5) / 10,
        };
      },
    };
    console.info(TAG, 'running', config);
  }

  try {
    start(window);
  } catch (err) {
    console.warn(TAG, err);
  }
})();
