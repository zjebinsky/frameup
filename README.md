# frameup

<img src="logo.png" width="200" />

**frameup** is a tool built for designers and developers to easily capture high-quality visuals of their work. It opens any website in a real browser and saves it as high-resolution screenshots or a smooth scroll-through video — desktop and mobile sizes at once, straight to your Downloads folder.

https://github.com/zjebinsky/frameup

---

## What you get

**Screenshots** — two high-res PNGs, one desktop and one mobile, captured after the page has fully loaded and animations have finished.

**Videos** — two MP4s showing the full page scrolling from top to bottom, one desktop and one mobile.

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

**macOS** — open Terminal:

```bash
cd ~/frameup
bun run frameup.ts https://yourwebsite.com images
```

**Windows** — open PowerShell:

```powershell
cd $HOME\frameup
bun run frameup.ts https://yourwebsite.com images
```

Or for a scroll video, replace `images` with `video`.

Your files will appear in **~/Downloads** within about 30 seconds.

---

## Options

You can customise the output by adding flags to the command:

```bash
bun run frameup.ts https://yourwebsite.com images --wait=3000 --density=2
bun run frameup.ts https://yourwebsite.com video --scroll=12000 --hold=3000
```

| Flag | Default | What it does |
|---|---|---|
| `--wait=<ms>` | `6000` | Time to wait before capturing — increase if animations are still running |
| `--scroll=<ms>` | `8000` | How long the scroll takes in video mode — increase for a slower, more cinematic feel |
| `--hold=<ms>` | `1500` | How long to pause at the bottom before the video ends |
| `--density=<n>` | `3` | Pixel density for images — `1`, `2`, or `3` |

1000 = 1 second.

Run `bun run frameup.ts --help` to see all options in the terminal.

---

## Output

| Mode | Files | Format |
|---|---|---|
| `images` | Desktop (1500×900) + Mobile (393×852) | PNG, @3x resolution |
| `video` | Desktop (1500×900) + Mobile (393×852) | MP4 |

Files are named automatically: `sitename_date_size.png` / `.mp4`

---

