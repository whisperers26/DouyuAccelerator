# How Douyu video plays, and what the script relies on

Back to [AGENTS.md](../../AGENTS.md). Everything here was measured on 2026-11-19 from the
owner's PC (outside China) in Chrome 157. Re-check it when the script stops helping.

## Stream URL

The player POSTs to `https://v.douyu.com/wgapi/vodnc/front/stream/getStreamUrlWeb`. The body
is `v=...&did=...&tt=...&sign=...&vid=<hash_id>`, produced by `window.ub98484234(point_id, did, ts)`,
a function Douyu ships per video page (it fails with `error 7 权限不足` for any other video).
The answer lists one HLS playlist per quality (`normal` 480P, `high` 720P, `super` 1080P, plus
60 fps and 2K variants for logged-in users on live replays), all on one host:

- uploads: `play-hw-ugcpub.douyucdn2.cn/live/<quality>_<id>-upload-<x>/playlist.m3u8?...`
- live replays: `play-hw-recpub.douyucdn2.cn/live/1080p60_live-<room>...--<date>/playlist.m3u8?...`

`"cdn":"hw"` (Huawei, CNAME `*.cdnhwcoem01.com`). Adding `cdn=tx|ali|ws|...` to the request
changes nothing. `play-tx-ugcpub.douyucdn2.cn` exists (Tencent) but answers 403 to the Huawei
signature, and no other `play-<cdn>-` host resolves. `"p2pmeta":{"p2p":0}`: no P2P on video.
So there is no line to switch to, unlike Bilibili's interchangeable `upos-*` mirrors.

## Playlist and segments

- Plain HLS v3, `#EXT-X-ENDLIST`, no encryption, no variant playlists. The first ~10 segments
  are 2 s, the rest 6 s. Segment URIs are relative (`playlist_<n>.ts?<same query>`).
- The player loads the playlist with XHR and every segment with `fetch`, one at a time, and
  keeps up to ~60–70 s buffered when segments arrive fast.
- `<video>` sits in shadow DOM; its `currentTime` is the playlist timeline (0 = start of
  segment 0), so the playing segment can be found by summing `#EXTINF` durations.
- Segment responses allow CORS from `v.douyu.com`, so the page can fetch them too. They do not
  send `Timing-Allow-Origin`, so performance entries show URL and duration but not sizes.

## Why it stutters

| Segment state on the CDN edge | Throughput (one request) |
|---|---|
| not cached (first viewer in the region) | 4.6–5 Mbps |
| cached | 100–340 Mbps |

1080p60 segments are 5–12 MB per 6 s (7–15 Mbps). Sequential cold fetches take 9–20 s per 6 s
segment, so the player keeps hitting `waiting`. Measured: 3 stalls in 20 s, 15 s played. The
edge caches a segment after one complete download (`X-CCDN-CacheTTL: 2592000`), and cold
requests run in parallel without slowing each other: 6 at once gave 21 Mbps aggregate, 2.4x
what 1080p60 needs.

## What the script does with that

It finds the playlist URL from `PerformanceObserver` resource entries (`.m3u8` on a
`douyucdn` host), fetches and parses it, and every second compares `video.currentTime` with
the segment list. It keeps up to `concurrency` downloads of the segments between the end of
the player's buffer and `aheadSec` seconds past the playhead, reads each one to the end and
throws the bytes away: the point is the edge cache, not a local copy. The player's own later
request then comes from a warm edge. A new playlist URL (quality change, next video) resets
everything; a seek aborts downloads that fell outside the new window.

The cost is roughly double the bandwidth of the video itself. Nothing is kept in memory.
