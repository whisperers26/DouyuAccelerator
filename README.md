# Douyu Accelerator

A userscript that stops 1080p60 and 2K video replays on [Douyu video](https://v.douyu.com)
(斗鱼视频) from stuttering when you watch from outside China.

## Why Douyu video stutters

Douyu serves every replay from a single Huawei CDN line. When nobody near you has watched a
part of a video yet, the CDN edge server near you does not have it and pulls each segment from
China at about 5 Mbps. 1080p60 needs 7–15 Mbps and 2K more, and Douyu's player downloads one
segment at a time, so it keeps running out of buffer. Your own connection is not the problem:
once a segment is cached at the edge, it arrives at 100+ Mbps.

There is no faster line to switch to (Douyu offers no other CDN for video), so the script does
the other thing that works: while you watch, it downloads the next 90 seconds of segments, six
at a time, so the edge has them cached by the time the player asks. Six slow downloads at once
add up to more than enough.

Measured on a 2-hour 1080p60 replay, 40 seconds of playback from a part nobody had watched:

| | Stalls | Seconds played in 40 s |
|---|---|---|
| Without the script | 5 | 18.3 |
| With the script | 1 (right after seeking) | 39.1 |

It does not change the player. It uses about twice the bandwidth of the video you watch,
because every segment is downloaded once by the script and once by the player.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Chrome or Edge. In Chrome, turn on
   **Allow User Scripts** for it (`chrome://extensions` → Tampermonkey → Details).
2. Open
   [douyu-accelerator.user.js](https://raw.githubusercontent.com/whisperers26/DouyuAccelerator/main/douyu-accelerator.user.js)
   and press **Install**. Tampermonkey checks this address for updates.
3. Reload any open `v.douyu.com/show/...` page.

## Settings

The defaults suit 1080p60 and 2K. To change them, run this in the browser console on a
`v.douyu.com` page and reload:

```js
localStorage.douyuAccelerator = JSON.stringify({ aheadSec: 90, concurrency: 6 });
```

| Setting | Default | What it does |
|---|---|---|
| `aheadSec` | 90 (10–600) | How far past the playhead to download |
| `concurrency` | 6 (1–16) | Downloads at once |
| `enabled` | `true` | `false` turns the script off on this browser |

`window.__douyuAccelerator.status()` in the console shows what it is doing.

## Limits

- Only Douyu video replays (`v.douyu.com/show/...`), not live rooms. Live rooms have several CDN
  lines and a 线路 menu of their own.
- The first few seconds after you open a video or seek still come from a cold edge, so expect
  one short stall there.
