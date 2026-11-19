const test = require('node:test');
const assert = require('node:assert/strict');
const { planDownloads } = require('../douyu-accelerator.user.js');

// 20 segments of 6 s each: segment n covers [6n, 6n + 6).
const SEGMENTS = Array.from({ length: 20 }, (_, i) => ({ index: i, start: i * 6, duration: 6, url: `u${i}` }));

function plan(over) {
  return planDownloads({
    segments: SEGMENTS,
    currentTime: 0,
    bufferedEnd: 0,
    aheadSec: 30,
    concurrency: 3,
    done: new Set(),
    inflight: new Set(),
    failures: new Map(),
    maxAttempts: 3,
    ...over,
  });
}

test('starts after the segment the player is fetching, up to the concurrency limit', () => {
  // Nothing buffered at 0 s: the player is fetching segment 0 itself.
  assert.deepEqual(plan({}), { start: [1, 2, 3], abort: [] });
});

test('starts after the end of the player buffer', () => {
  // Playing 13 s (segment 2), buffered to 25 s (segment 4): the player fetches 4 next.
  assert.deepEqual(plan({ currentTime: 13, bufferedEnd: 25 }).start, [5, 6, 7]);
});

test('skips segments already done or in flight and fills free slots only', () => {
  const r = plan({ done: new Set([1, 2]), inflight: new Set([3]) });
  assert.deepEqual(r, { start: [4, 5], abort: [] });
});

test('never goes past aheadSec beyond the playhead', () => {
  // Window ends at segment holding 0 + 30 s = segment 5.
  const r = plan({ concurrency: 10 });
  assert.deepEqual(r.start, [1, 2, 3, 4, 5]);
});

test('stops at the last segment', () => {
  const r = plan({ currentTime: 110, bufferedEnd: 110, concurrency: 10 });
  assert.deepEqual(r.start, [19]);
});

test('after a seek, aborts downloads outside the new window and starts the new one', () => {
  const r = plan({ currentTime: 60, bufferedEnd: 60, inflight: new Set([1, 2, 11]) });
  assert.deepEqual(r.abort, [1, 2]);
  assert.deepEqual(r.start, [12, 13]);
});

test('gives up on a segment after maxAttempts failures', () => {
  const r = plan({ failures: new Map([[1, 3], [2, 1]]) });
  assert.deepEqual(r.start, [2, 3, 4]);
});

test('does nothing without segments', () => {
  assert.deepEqual(plan({ segments: [] }), { start: [], abort: [] });
});
