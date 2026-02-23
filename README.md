# capture

Captures websites as screenshots or scroll-through videos using Playwright.
Outputs files to `~/Downloads`.

## Setup

```bash
bun install
bunx playwright install chromium
```

For MP4 output (video mode), install ffmpeg:

```bash
brew install ffmpeg
```

Without ffmpeg, videos are saved as `.webm` instead.

## Usage

```bash
bun run capture.ts <url> [images|video]
```

`images` is the default if no mode is specified.

### Examples

```bash
bun run capture.ts https://example.com
bun run capture.ts https://example.com images
bun run capture.ts https://example.com video
```

## Output

### images

Two PNGs at `@3x` pixel density:

- `hostname_timestamp_1500x900.png` — desktop
- `hostname_timestamp_393x852.png` — mobile

### video

Two MP4s (or WebM if ffmpeg is not installed) recording a smooth scroll from top to bottom:

- `hostname_timestamp_1500x900.mp4` — desktop
- `hostname_timestamp_393x852.mp4` — mobile

## Configuration

Constants at the top of `capture.ts`:

| Constant | Default | Description |
|---|---|---|
| `SIZES` | 1500×900, 393×852 | Viewport presets (desktop + mobile) |
| `DENSITY` | `3` | Pixel density for images (`deviceScaleFactor`) |
| `WAIT_MS` | `6000` | Wait before capturing — lets intro animations finish |
| `SCROLL_DURATION_MS` | `8000` | How long the scroll takes in video mode |
| `HOLD_MS` | `1500` | Pause at the bottom before closing in video mode |
