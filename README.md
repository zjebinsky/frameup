# capture

**capture** is a command-line tool that opens any website in a real browser and saves it as high-resolution screenshots or a smooth scroll-through video — desktop and mobile sizes at once, straight to your Downloads folder.

https://github.com/zjebinsky/capture

---

## What you get

**Screenshots** — two high-res PNGs, one desktop and one mobile, captured after the page has fully loaded and animations have finished.

**Videos** — two MP4s showing the full page scrolling from top to bottom, one desktop and one mobile.

---

## One-time setup

You'll need three free tools installed. Open **Terminal** (press `Cmd + Space`, type Terminal, hit Enter) and run each block below.

**1. Install Homebrew** (a package manager for macOS):
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**2. Install Bun** (runs the script):
```bash
curl -fsSL https://bun.sh/install | bash
```

**3. Install ffmpeg** (converts videos to MP4):
```bash
brew install ffmpeg
```

**4. Download capture and set it up:**
```bash
git clone https://github.com/zjebinsky/capture.git ~/Developer/capture
cd ~/Developer/capture
bun install
bunx playwright install chromium
```

That's it. You only ever do this once.

---

## Every day use

Open Terminal, then run:

```bash
cd ~/Developer/capture
bun run capture.ts https://yourwebsite.com images
```

Or for a scroll video:

```bash
bun run capture.ts https://yourwebsite.com video
```

Your files will appear in **~/Downloads** within about 30 seconds.

---

## Output

| Mode | Files | Format |
|---|---|---|
| `images` | Desktop (1500×900) + Mobile (393×852) | PNG, @3x resolution |
| `video` | Desktop (1500×900) + Mobile (393×852) | MP4 |

Files are named automatically: `sitename_date_size.png` / `.mp4`

---

## Tweaking timing

If animations haven't finished before the screenshot fires, or the scroll feels too fast, open `capture.ts` in any text editor and adjust these numbers near the top:

| Setting | Default | What it does |
|---|---|---|
| `WAIT_MS` | `6000` | Milliseconds to wait before capturing (6s). Increase if animations are still running. |
| `SCROLL_DURATION_MS` | `8000` | How long the scroll takes in video mode (8s). Increase for slower, more cinematic scrolls. |
| `HOLD_MS` | `1500` | How long to pause at the bottom before the video ends (1.5s). |

1000 = 1 second.
