const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePlaylist, segmentIndexAt, isPlaylistUrl, redactUrl } = require('../douyu-accelerator.user.js');

const BASE = 'https://play-hw-recpub.douyucdn2.cn/live/1080p60_live-1--20261118/playlist.m3u8?cdn=hw&sign=abc';

const PLAYLIST = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-TARGETDURATION:7',
  '#EXT-X-MEDIA-SEQUENCE:0',
  '#EXTINF:2.000000,',
  'playlist_0.ts?cdn=hw&sign=abc',
  '#EXTINF:2.000000,',
  'playlist_1.ts?cdn=hw&sign=abc',
  '#EXTINF:6.000000,',
  'playlist_2.ts?cdn=hw&sign=abc',
  '#EXTINF:5.500000,',
  'playlist_3.ts?cdn=hw&sign=abc',
  '#EXT-X-ENDLIST',
  '',
].join('\n');

test('parses segments with absolute URLs and running start times', () => {
  const segs = parsePlaylist(PLAYLIST, BASE);
  assert.equal(segs.length, 4);
  assert.deepEqual(segs.map((s) => s.start), [0, 2, 4, 10]);
  assert.deepEqual(segs.map((s) => s.duration), [2, 2, 6, 5.5]);
  assert.equal(segs[2].index, 2);
  assert.equal(
    segs[2].url,
    'https://play-hw-recpub.douyucdn2.cn/live/1080p60_live-1--20261118/playlist_2.ts?cdn=hw&sign=abc',
  );
});

test('accepts CRLF line endings', () => {
  assert.equal(parsePlaylist(PLAYLIST.replace(/\n/g, '\r\n'), BASE).length, 4);
});

test('returns nothing for text that is not a playlist', () => {
  assert.deepEqual(parsePlaylist('<html>403 Forbidden</html>', BASE), []);
  assert.deepEqual(parsePlaylist('', BASE), []);
});

test('ignores a variant playlist (no segments of its own)', () => {
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nhigh.m3u8\n';
  assert.deepEqual(parsePlaylist(master, BASE), []);
});

test('segmentIndexAt finds the segment that holds a time', () => {
  const segs = parsePlaylist(PLAYLIST, BASE);
  assert.equal(segmentIndexAt(segs, 0), 0);
  assert.equal(segmentIndexAt(segs, 1.99), 0);
  assert.equal(segmentIndexAt(segs, 2), 1);
  assert.equal(segmentIndexAt(segs, 9.9), 2);
  assert.equal(segmentIndexAt(segs, 10), 3);
});

test('segmentIndexAt clamps times outside the playlist', () => {
  const segs = parsePlaylist(PLAYLIST, BASE);
  assert.equal(segmentIndexAt(segs, -5), 0);
  assert.equal(segmentIndexAt(segs, 15.5), 3);
  assert.equal(segmentIndexAt(segs, 1000), 3);
  assert.equal(segmentIndexAt([], 3), -1);
});

test('isPlaylistUrl matches Douyu CDN playlists only', () => {
  assert.ok(isPlaylistUrl(BASE));
  assert.ok(isPlaylistUrl('https://play-hw-ugcpub.douyucdn2.cn/live/high_1-upload-x/playlist.m3u8'));
  assert.ok(!isPlaylistUrl('https://play-hw-ugcpub.douyucdn2.cn/live/high_1/playlist_3.ts?a=1'));
  assert.ok(!isPlaylistUrl('https://evil.example.com/douyucdn2.cn/playlist.m3u8'));
  assert.ok(!isPlaylistUrl('not a url'));
});

test('redactUrl drops the signed query string', () => {
  assert.equal(
    redactUrl(BASE),
    'https://play-hw-recpub.douyucdn2.cn/live/1080p60_live-1--20261118/playlist.m3u8',
  );
  assert.equal(redactUrl('garbage?sign=1'), 'garbage');
});
