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
  }
})();
