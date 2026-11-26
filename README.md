# The World Today — Thursday 26 November 2026

[![make.fun · news-image-20261126](https://make.fun/badge/news-image-20261126.svg)](https://make.fun/bounty/news-image-20261126?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261126)
[![rank](https://make.fun/badge/news-image-20261126/yorstann/news-image-26nov/rank.svg)](https://make.fun/bounty/news-image-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261126)
[![reward](https://make.fun/badge/news-image-20261126/yorstann/news-image-26nov/reward.svg)](https://make.fun/bounty/news-image-20261126?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261126)

Entry for the make.fun bounty [Sum up 26 November's world news in one image](https://make.fun/bounty/news-image-20261126).

A single 1024×1024 poster, drawn entirely by code: an own rasterizer and an own
hand-drawn stroke typeface — no copied assets, no copied code.

**Design:** dark navy poster, giant masthead date, one hero (Lukashenko's offer to
fly Zelensky to Moscow — "Am I just a suitcase for him?"), two secondary cards
(88 of 112 drones down; Poland's no-fly zone), four big-number tiles (30 killed
in Giza, 25+ miners trapped in Indonesia, Nasdaq −4%, +2°C for six straight
days), and an ALSO ON THE DAY ticker. Seven stories, strict hierarchy, built to
read clearly at thumbnail size.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` writes `entry.png` (1024×1024, under 1 MiB) to `$MAKEFUN_OUTPUT_DIR`
(default `/output`). Node 22+ standard library only; the run is deterministic —
two runs produce byte-identical output.

## License

MIT — see [LICENSE](LICENSE).
