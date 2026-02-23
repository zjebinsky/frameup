# frameup

<img src="logo-dark.gif" width="400" />

**frameup** is a tool built for designers and developers to easily capture high-quality visuals of their work. It opens any website in a real browser and saves it as high-resolution screenshots or a buttery smooth scroll-through video — desktop and mobile sizes at once, straight to your Downloads folder.

https://github.com/zjebinsky/frameup

---

## What you get

**Screenshots** — two high-res PNGs, one desktop and one mobile, captured after the page has fully loaded and animations have finished. Cookie banners are dismissed automatically.

**Videos** — two MP4s showing the full page scrolling from top to bottom, one desktop and one mobile. Scroll speed is calculated automatically based on page height. Videos and animations on the page play naturally during capture. Press `Ctrl+C` at any time to cancel — frameup cleans up and exits immediately.

---

## One-time setup

### macOS

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

**4. Download frameup and set it up:**
```bash
git clone https://github.com/zjebinsky/frameup.git ~/frameup
cd ~/frameup
bun install
bunx playwright install chromium
```

That's it. You only ever do this once.

### Windows

Open **PowerShell** (press `Win + S`, type PowerShell, hit Enter) and run each block below.

**1. Install Scoop** (a package manager for Windows):
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
```

**2. Install Bun** (runs the script):
```powershell
scoop install bun
```

**3. Install ffmpeg** (converts videos to MP4):
```powershell
scoop install ffmpeg
```

**4. Install Git** (if you don't have it):
```powershell
scoop install git
```

**5. Download frameup and set it up:**
```powershell
git clone https://github.com/zjebinsky/frameup.git $HOME\frameup
cd $HOME\frameup
bun install
bunx playwright install chromium
```

---

## Every day use

### macOS

1. Open **Terminal** (`Cmd + Space`, type Terminal, hit Enter)
2. Type `cd ` (with a space after it), then drag the **frameup** folder from Finder into the Terminal window — it fills in the path automatically
3. Hit **Enter**
4. Run the command:

Not sure about flags? Just run frameup with no arguments and it'll walk you through everything step by step:

```bash
bun run frameup.ts
```

Or use it directly:

```bash
bun run frameup.ts https://yourwebsite.com images
```

Or for a scroll video:

```bash
bun run frameup.ts https://yourwebsite.com video
```

You can pass multiple URLs and they'll be captured one after another:

```bash
bun run frameup.ts https://site1.com https://site2.com https://site3.com images
```

### Windows

1. Open the **frameup** folder in File Explorer
2. Click the address bar at the top of the window, type `powershell`, and hit **Enter** — this opens PowerShell directly inside that folder
3. Run the command:

Not sure about flags? Just run frameup with no arguments and it'll walk you through everything step by step:

```powershell
bun run frameup.ts
```

Or use it directly:

```powershell
bun run frameup.ts https://yourwebsite.com images
```

You can pass multiple URLs and they'll be captured one after another:

```powershell
bun run frameup.ts https://site1.com https://site2.com https://site3.com images
```

---

## Options

You can customise the output by adding flags to the command:

```bash
bun run frameup.ts https://yourwebsite.com images --wait=3000 --density=2
bun run frameup.ts https://yourwebsite.com video --scroll=12000 --hold=3000
bun run frameup.ts https://yourwebsite.com video --swipe
```

| Flag | Default | What it does |
|---|---|---|
| `--wait=<ms>` | `6000` | Time to wait before capturing — increase if animations are still running |
| `--scroll=<ms>` | auto | Scroll duration in video mode — calculated from page height by default, override with e.g. `--scroll=12000` |
| `--hold=<ms>` | `1500` | How long to pause at the bottom before the video ends |
| `--density=<n>` | `3` | Pixel density for images — `1`, `2`, or `3` |
| `--format=<fmt>` | `png` | Output format for images — `png` or `webp` |
| `--fps=<n>` | `30` | Video frame rate |
| `--selector=<css>` | — | Capture a specific section only, e.g. `--selector=".hero"` |
| `--delay-selector=<css>` | — | Wait for an element to appear before capturing, e.g. `--delay-selector=".loaded"` |
| `--clip=<x,y,w,h>` | — | Crop the output to a region in pixels, e.g. `--clip=0,0,1500,800` |
| `--watermark=<path>` | — | Overlay a PNG onto the output, bottom right, e.g. `--watermark=./logo.png` |
| `--prefix=<name>` | hostname | Custom filename prefix instead of the site hostname |
| `--out=<dir>` | `~/Downloads` | Custom output directory |
| `--urls=<path>` | — | Text file with one URL per line — processed in order |
| `--swipe` | — | Emulate human swipe gestures in video mode — scroll pulses based on page height |
| `--dark` | — | Force dark mode before capturing |
| `--no-scroll` | — | Record without scrolling in video mode |
| `--zip` | — | Bundle all output files into a single zip |
| `--open` | — | Open the output folder when done |

1000 = 1 second.

Run `bun run frameup.ts --help` to see all options in the terminal.

### Progress

In video mode, frameup shows live frame progress while capturing and encoding — `42/360  12%` — so you always know how far along it is. Press `Ctrl+C` at any point to cancel cleanly.

### Scroll speed

In video mode, frameup automatically calculates how long the scroll should take based on the page height — roughly 600px per second, clamped between 4 and 30 seconds. Override it any time with `--scroll=<ms>`.

### Swipe mode

`--swipe` makes the scroll feel like a real finger swiping through the page. The number of swipe impulses is calculated from the page height (one swipe per viewport height of content), and each swipe covers a randomly varied slice of the page for a natural, organic feel.

```bash
bun run frameup.ts https://yourwebsite.com video --swipe
```

### Capturing a specific section

Use `--selector` to target a specific part of the page instead of the whole thing. Pass any CSS selector — a class, an ID, or an element name.

**Screenshots** — crops the output tightly to that element:
```bash
bun run frameup.ts https://yourwebsite.com images --selector=".hero"
bun run frameup.ts https://yourwebsite.com images --selector="#pricing"
bun run frameup.ts https://yourwebsite.com images --selector="nav"
```

**Videos** — jumps straight to that section and scrolls through it top to bottom, ignoring the rest of the page:
```bash
bun run frameup.ts https://yourwebsite.com video --selector=".features"
bun run frameup.ts https://yourwebsite.com video --selector="#case-studies"
```

Not sure what selector to use? Right-click the element in your browser → Inspect → look for the `class` or `id` attribute. Use `.classname` or `#id`.

---

## Output

| Mode | Files | Format |
|---|---|---|
| `images` | Desktop (1500×900) + Mobile (393×852) | PNG, @3x resolution |
| `video` | Desktop (1500×900) + Mobile (393×852) | MP4 |

Files are named automatically: `sitename_date_size.png` / `.mp4`

---
