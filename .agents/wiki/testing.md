# Testing

Back to [AGENTS.md](../../AGENTS.md).

## Unit tests

`npm test` runs `node --test "tests/*.test.js"` (Node 22 does not accept a bare directory). The userscript exports its pure parts (playlist parser,
download planner, config) through `module.exports` when it is loaded by Node, so the tests
`require('../douyu-accelerator.user.js')` directly. Nothing in the tests touches the network.

## Live check in Chrome

Use the owner's Chrome (Claude in Chrome), where they are logged in to Douyu: 60 fps and 2K
qualities need a login. A long live replay that few people watched gives cold segments, e.g.
`https://v.douyu.com/show/a4Jj7lxQLxq7Dk01` (2 h, 1080p60).

1. Open the video and seek to a position nobody has watched yet: pick a fresh one each run,
   because each run warms the segments it touches for everybody for 30 days.
2. Without the script: seek, play muted for 40 s and count `waiting` events and seconds played
   (`video.getVideoPlaybackQuality()` for dropped frames).
3. With the script: either install it (below) and reload, or load the pushed branch's raw file
   into the page with `fetch` + indirect `eval` (it runs fine late: it scans existing
   performance entries). Seek to another fresh position and measure the same way.
   `window.__douyuAccelerator.status()` shows the window, downloads in flight and done.

`javascript_tool` calls time out after 45 s and a cold seek can take 20 s to start playing,
so start the measurement without awaiting it, store the result on `window`, and read it in a
later call.

Results on 2026-11-19 (that video, 1080p60, 40 s from a cold position, 0 dropped frames both):

| | Stalls | Played |
|---|---|---|
| without, from 3300 s | 5 | 18.3 s |
| with v0.1.0, from 5000 s | 1 (just after the seek) | 39.1 s, 88 s buffered ahead at the end |

2K has not been measured yet.

The `<video>` element is inside shadow DOM; find it by walking `shadowRoot`s.

## Installing into Tampermonkey

The script's `@downloadURL` / `@updateURL` point at `main`'s raw file, so install from there:
open `https://raw.githubusercontent.com/whisperers26/DouyuAccelerator/main/douyu-accelerator.user.js`
in Chrome; Tampermonkey shows its install page; press **Install**. Chrome needs
**Allow User Scripts** turned on for Tampermonkey (`chrome://extensions` → Tampermonkey →
Details) or no userscript runs at all.
