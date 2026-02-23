import { chromium } from 'playwright'
import { join, resolve } from 'path'
import { tmpdir, homedir } from 'os'
import { rename, readdir, mkdir, readFile, rm } from 'fs/promises'
import { exec, execSync, spawn } from 'child_process'
import { promisify } from 'util'
import sharp from 'sharp'
import * as p from '@clack/prompts'

const execAsync = promisify(exec)

// ─── terminal ────────────────────────────────────────────────────────────────

const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  red:     '\x1b[31m',
}

const SPINNER = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']

let cancelled = false

async function spin<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let i = 0
  const id = setInterval(() => {
    process.stdout.write(`\r  ${c.cyan}${SPINNER[i++ % SPINNER.length]}${c.reset}  ${label}   `)
  }, 80)
  try {
    const result = await fn()
    clearInterval(id)
    process.stdout.write(`\r  ${c.green}✓${c.reset}  ${label}\n`)
    return result
  } catch (err) {
    clearInterval(id)
    if (cancelled) {
      process.stdout.write('\r\x1b[K')
      return new Promise<T>(() => {})
    }
    process.stdout.write(`\r  ${c.red}✗${c.reset}  ${label}\n`)
    throw err
  }
}

async function spinFunny<T>(messages: string[], fn: () => Promise<T>): Promise<T> {
  let spinI = 0
  let msgI  = 0
  let ticks = 0
  const SWAP = Math.round(3_500 / 80) // rotate every ~3.5 s
  process.stdout.write('\x1b[?25l') // hide cursor
  const id = setInterval(() => {
    if (ticks > 0 && ticks % SWAP === 0) msgI = (msgI + 1) % messages.length
    ticks++
    process.stdout.write(`\r\x1b[K  ${c.cyan}${SPINNER[spinI++ % SPINNER.length]}${c.reset}  ${messages[msgI]}`)
  }, 80)
  try {
    const result = await fn()
    clearInterval(id)
    process.stdout.write(`\r\x1b[K  ${c.green}✓${c.reset}  ${messages[0]}\n\x1b[?25h`)
    return result
  } catch (err) {
    clearInterval(id)
    process.stdout.write(`\r\x1b[K  ${c.red}✗${c.reset}  ${messages[msgI]}\n\x1b[?25h`)
    throw err
  }
}

async function spinWithProgress<T>(
  messages: string[],
  total: number,
  fn: (update: (done: number) => void) => Promise<T>
): Promise<T> {
  let spinI = 0
  let msgI  = 0
  let ticks = 0
  let current = 0
  const SWAP = Math.round(3_500 / 80)
  process.stdout.write('\x1b[?25l')
  const id = setInterval(() => {
    if (ticks > 0 && ticks % SWAP === 0) msgI = (msgI + 1) % messages.length
    ticks++
    const pct = total > 0 ? Math.round((current / total) * 100) : 0
    process.stdout.write(`\r\x1b[K  ${c.cyan}${SPINNER[spinI++ % SPINNER.length]}${c.reset}  ${messages[msgI]}  ${c.dim}${current}/${total}  ${pct}%  · Ctrl+C to cancel${c.reset}`)
  }, 80)
  try {
    const result = await fn((done) => { current = done })
    clearInterval(id)
    if (!cancelled) {
      process.stdout.write(`\r\x1b[K  ${c.green}✓${c.reset}  ${messages[0]}  ${c.dim}${total}/${total}${c.reset}\n\x1b[?25h`)
    } else {
      process.stdout.write('\x1b[?25h')
    }
    return result
  } catch (err) {
    clearInterval(id)
    if (cancelled) {
      process.stdout.write('\x1b[?25h')
      return new Promise<T>(() => {})
    }
    process.stdout.write(`\r\x1b[K  ${c.red}✗${c.reset}  ${messages[msgI]}  ${c.dim}${current}/${total}${c.reset}\n\x1b[?25h`)
    throw err
  }
}

function log(line: string) {
  console.log(`     ${c.dim}${line}${c.reset}`)
}

// ─── args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

if (args.includes('--help')) {
  console.log(`
  ${c.bold}frameup ✦${c.reset}

  ${c.dim}Usage:${c.reset}
    bun run frameup.ts <url> [url2 ...] [images|video] [options]
    bun run frameup.ts            (no args → interactive wizard)

  ${c.dim}Modes:${c.reset}
    images   Capture screenshots (default)
    video    Record a scroll-through video

  ${c.dim}Options:${c.reset}
    --wait=<ms>             Wait before capturing               (default: 6000)
    --scroll=<ms>           Scroll duration in video mode       (default: 8000)
    --hold=<ms>             Pause at bottom before video ends   (default: 1500)
    --density=<n>           Pixel density: 1, 2, or 3           (default: 3)
    --format=<fmt>          Output format: png or webp          (default: png)
    --fps=<n>               Video frame rate                    (default: ffmpeg default)
    --selector=<css>        Capture a specific element only
    --delay-selector=<css>  Wait for element before capturing
    --clip=<x,y,w,h>        Crop output to a region (pixels, pre-density)
    --watermark=<path>      Overlay a PNG, bottom right
    --prefix=<name>         Custom filename prefix
    --out=<dir>             Output directory                    (default: ~/Downloads)
    --urls=<path>           Text file with one URL per line
    --swipe                 Emulate human swipe gestures in video mode
    --dark                  Force dark mode
    --no-scroll             Record without scrolling (video mode)
    --zip                   Bundle all outputs into a zip file
    --open                  Open output folder when done
    --help                  Show this help message

  ${c.dim}Examples:${c.reset}
    bun run frameup.ts https://example.com
    bun run frameup.ts https://example.com https://other.com images
    bun run frameup.ts https://example.com video --scroll=12000 --fps=60
    bun run frameup.ts https://example.com images --format=webp --dark
    bun run frameup.ts https://example.com images --clip=0,0,1500,800
    bun run frameup.ts https://example.com images --watermark=./logo.png --zip
    bun run frameup.ts --urls=./sites.txt images --prefix=portfolio --out=./out
  `)
  process.exit(0)
}

// ─── wizard ──────────────────────────────────────────────────────────────────

if (args.length === 0) {
  const LOGO = [
    '█████ ████   ███  █   █ █████ █   █ ████ ',
    '█     █   █ █   █ ██ ██ █     █   █ █   █',
    '████  ████  █████ █ █ █ ████  █   █ ████ ',
    '█     █  █  █   █ █   █ █     █   █ █    ',
    '█     █   █ █   █ █   █ █████ █████ █    ',
  ]
  console.log()
  for (const line of LOGO) console.log(`  ${c.bold}${line}${c.reset}`)
  console.log(`\n  ${c.magenta}✦${c.reset}  ${c.dim}capture websites · desktop + mobile${c.reset}\n`)
  p.intro('  Let\'s set up your capture.')

  const urlInput = await p.text({
    message: 'URL(s) to capture',
    placeholder: 'https://yoursite.com  (space-separated for multiple)',
    validate: v => (v ?? '').trim() ? undefined : 'At least one URL is required',
  })
  if (p.isCancel(urlInput)) { p.cancel('Cancelled.'); process.exit(0) }

  const modeAnswer = await p.select({
    message: 'What do you want to capture?',
    options: [
      { value: 'images', label: 'Screenshots', hint: 'PNG or WebP, desktop + mobile' },
      { value: 'video',  label: 'Scroll video', hint: 'MP4, desktop + mobile' },
    ],
  })
  if (p.isCancel(modeAnswer)) { p.cancel('Cancelled.'); process.exit(0) }

  let scrollMs = 8000
  if (modeAnswer === 'video') {
    const scrollAnswer = await p.select({
      message: 'Scroll speed',
      options: [
        { value: 6000,  label: 'Fast',   hint: '6 seconds' },
        { value: 8000,  label: 'Normal', hint: '8 seconds (default)' },
        { value: 12000, label: 'Slow',   hint: '12 seconds' },
        { value: 18000, label: 'Cinematic', hint: '18 seconds' },
      ],
    })
    if (p.isCancel(scrollAnswer)) { p.cancel('Cancelled.'); process.exit(0) }
    scrollMs = scrollAnswer as number
  }

  const extras = await p.multiselect({
    message: 'Any extras? (space to toggle, enter to confirm)',
    options: [
      { value: 'dark',     label: 'Dark mode',        hint: 'force prefers-color-scheme: dark' },
      { value: 'webp',     label: 'WebP format',      hint: 'images only — smaller file size' },
      { value: 'noscroll', label: 'No scroll',        hint: 'video only — record page as-is' },
      { value: 'zip',      label: 'Zip outputs',      hint: 'bundle everything into one file' },
      { value: 'open',     label: 'Open when done',   hint: 'open output folder automatically' },
    ],
    required: false,
  }) as string[]
  if (p.isCancel(extras)) { p.cancel('Cancelled.'); process.exit(0) }

  const outAnswer = await p.text({
    message: 'Output folder',
    placeholder: `~/Downloads  (leave blank for default)`,
  })
  if (p.isCancel(outAnswer)) { p.cancel('Cancelled.'); process.exit(0) }

  p.outro('Starting capture…')
  console.log()

  // rebuild argv and re-exec
  const wizardArgs: string[] = [
    ...(urlInput as string).trim().split(/\s+/),
    modeAnswer as string,
    ...(modeAnswer === 'video'      ? [`--scroll=${scrollMs}`] : []),
    ...(extras.includes('dark')     ? ['--dark']        : []),
    ...(extras.includes('webp')     ? ['--format=webp'] : []),
    ...(extras.includes('noscroll') ? ['--no-scroll']   : []),
    ...(extras.includes('zip')      ? ['--zip']         : []),
    ...(extras.includes('open')     ? ['--open']        : []),
    ...((outAnswer as string).trim() ? [`--out=${(outAnswer as string).trim()}`] : []),
  ]

  const { spawnSync } = await import('child_process')
  const result = spawnSync('bun', ['run', 'frameup.ts', ...wizardArgs], { stdio: 'inherit' })
  process.exit(result.status ?? 0)
}

function strFlag(name: string): string | undefined {
  return args.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
}

function numFlag(name: string, fallback: number): number {
  const arg = args.find(a => a.startsWith(`--${name}=`))
  return arg ? Number(arg.split('=')[1]) : fallback
}

// ─── url sources ─────────────────────────────────────────────────────────────

const urlsFilePath = strFlag('urls')
const fileUrls: string[] = urlsFilePath
  ? (await readFile(resolve(urlsFilePath), 'utf-8'))
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
  : []

const inlineUrls = args.filter(a => !a.startsWith('--') && a !== 'images' && a !== 'video')
const urls = [...inlineUrls, ...fileUrls]
const mode = args.find(a => a === 'images' || a === 'video') ?? 'images'

if (urls.length === 0) {
  console.error(`\n  ${c.red}✗${c.reset}  A URL is required. Run with --help for usage.\n`)
  process.exit(1)
}

// ─── options ─────────────────────────────────────────────────────────────────

const DENSITY            = numFlag('density', 3)
const selector           = strFlag('selector')
const delaySelector      = strFlag('delay-selector')
const watermarkArg       = strFlag('watermark')
const watermarkPath      = watermarkArg ? resolve(watermarkArg) : null
const prefix             = strFlag('prefix')
const outArg             = strFlag('out')
const format             = strFlag('format') ?? 'png'
const clipArg            = strFlag('clip')
const FPS                = numFlag('fps', 0)
const WAIT_MS            = numFlag('wait',   6_000)
const SCROLL_DURATION_MS = numFlag('scroll', 8_000)
const userSetScroll      = args.some(a => a.startsWith('--scroll='))
const HOLD_MS            = numFlag('hold',   1_500)
const darkMode           = args.includes('--dark')
const noScroll           = args.includes('--no-scroll')
const swipeScroll        = args.includes('--swipe')
const doZip              = args.includes('--zip')
const doOpen             = args.includes('--open')

const outDir = outArg ? resolve(outArg) : join(homedir(), 'Downloads')
await mkdir(outDir, { recursive: true })

const suffix = selector ? `_${selector.replace(/[^a-z0-9]/gi, '')}` : ''

const clip = clipArg
  ? (() => { const [x, y, w, h] = clipArg.split(',').map(Number); return { left: x, top: y, width: w, height: h } })()
  : null

async function pauseMedia(page: import('playwright').Page) {
  await page.evaluate(() => {
    document.querySelectorAll('video, audio').forEach(el => {
      (el as HTMLMediaElement).pause()
      ;(el as HTMLMediaElement).muted = true
    })
  })
}

async function dismissCookies(page: import('playwright').Page) {
  await page.evaluate(() => {
    // Click the most common accept buttons
    const acceptText = /^(accept|accept all|accept cookies|agree|i agree|got it|ok|okay|allow|allow all|allow cookies|consent|continue|yes|confirm)$/i
    const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    for (const el of buttons) {
      const text = (el.textContent ?? '').trim()
      if (acceptText.test(text)) {
        (el as HTMLElement).click()
        break
      }
    }
  })

  // Small pause for the banner to animate out
  await page.waitForTimeout(600)

  // Hide anything that still looks like a cookie/consent overlay
  await page.evaluate(() => {
    const keywords = /cookie|consent|gdpr|privacy|banner|notice|overlay|popup|modal/i
    const elements = Array.from(document.querySelectorAll('*'))
    for (const el of elements) {
      const html = el as HTMLElement
      if (!html.offsetParent && html.tagName !== 'BODY') continue
      const id  = (html.id ?? '').toLowerCase()
      const cls = (html.className ?? '').toLowerCase()
      if (keywords.test(id) || keywords.test(cls)) {
        const style = getComputedStyle(html)
        const isOverlay = style.position === 'fixed' || style.position === 'sticky' || style.zIndex > '100'
        if (isOverlay) html.style.setProperty('display', 'none', 'important')
      }
    }
    // Also remove common scroll locks added by cookie banners
    document.body.style.removeProperty('overflow')
    document.documentElement.style.removeProperty('overflow')
  })
}

const hasFfmpeg = (() => {
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true }
  catch { return false }
})()

const SIZES = [
  { width: 1500, height: 900,  label: 'desktop' },
  { width: 393,  height: 852,  label: 'mobile'  },
]

// ─── go ──────────────────────────────────────────────────────────────────────

let activeBrowser: import('playwright').Browser | null = null
let currentFrameDir: string | null = null

process.on('SIGINT', async () => {
  cancelled = true
  process.stdout.write('\x1b[?25h\r\x1b[K')
  console.log(`\n  ${c.magenta}✦${c.reset}  ${c.dim}Cancelled.${c.reset}\n`)
  if (currentFrameDir) {
    try { await rm(currentFrameDir, { recursive: true, force: true }) } catch {}
  }
  try { await activeBrowser?.close() } catch {}
  process.exit(0)
})

const browser = await chromium.launch()
activeBrowser = browser
const saved: string[] = []

for (const url of urls) {
  const hostname = new URL(url).hostname.replace(/\./g, '-')
  const ts       = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
  const stem     = prefix ?? hostname

  console.log(`\n  ${c.bold}frameup ✦${c.reset}  ${c.dim}${hostname}  ·  ${mode}${darkMode ? '  · dark' : ''}${c.reset}\n`)

  for (const { width, height, label } of SIZES) {
    if (mode === 'images') {
      const page = await browser.newPage({
        deviceScaleFactor: DENSITY,
        colorScheme: darkMode ? 'dark' : 'light',
      })
      await page.setViewportSize({ width, height })

      await spin(`Opening ${hostname}…`, () =>
        page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
      )

      if (delaySelector) {
        await spin(`Waiting for ${delaySelector}…`, () =>
          page.waitForSelector(delaySelector, { timeout: 15_000 })
        )
      }

      await spin('Clearing cookie banners…', () => dismissCookies(page))

      await spin('Letting animations breathe…', () =>
        page.waitForTimeout(WAIT_MS)
      )

      await pauseMedia(page)

      const ext  = format === 'webp' ? 'webp' : 'png'
      const file = join(outDir, `${stem}_${ts}_${width}x${height}${suffix}.${ext}`)

      await spin(`Shooting ${label} (${width}×${height})…`, async () => {
        const raw = selector
          ? await page.locator(selector).first().screenshot()
          : await page.screenshot({ fullPage: !selector })

        let pipeline = sharp(raw)
        if (clip) pipeline = pipeline.extract({
          left:   clip.left   * DENSITY,
          top:    clip.top    * DENSITY,
          width:  clip.width  * DENSITY,
          height: clip.height * DENSITY,
        })
        if (watermarkPath) {
          const { width: imgW, height: imgH } = await pipeline.clone().metadata()
          const { width: wmW,  height: wmH  } = await sharp(watermarkPath).metadata()
          const margin = 20
          pipeline = pipeline.composite([{
            input: watermarkPath,
            left: (imgW ?? 0) - (wmW ?? 0) - margin,
            top:  (imgH ?? 0) - (wmH ?? 0) - margin,
          }])
        }
        if (format === 'webp') pipeline = pipeline.webp({ quality: 90 })
        await pipeline.toFile(file)
      })

      log(file)
      saved.push(file)
      await page.close()

    } else {
      const frameDir = join(tmpdir(), `frameup-frames-${Date.now()}`)
      await mkdir(frameDir, { recursive: true })
      currentFrameDir = frameDir

      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
        colorScheme: darkMode ? 'dark' : 'light',
      })

      const page = await context.newPage()

      await spin(`Opening ${hostname}…`, () =>
        page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
      )

      if (delaySelector) {
        await spin(`Waiting for ${delaySelector}…`, () =>
          page.waitForSelector(delaySelector, { timeout: 15_000 })
        )
      }

      await spin('Clearing cookie banners…', () => dismissCookies(page))

      await spin('Letting animations breathe…', () =>
        page.waitForTimeout(WAIT_MS)
      )

      const baseName  = `${stem}_${ts}_${width}x${height}${suffix}`
      const targetFps = FPS > 0 ? FPS : 30

      const bounds = await page.evaluate((sel: string | null) => {
        const scrollable = document.body.scrollHeight - window.innerHeight
        if (!sel) return { startY: 0, endY: scrollable }
        const el = document.querySelector(sel)
        if (!el) return { startY: 0, endY: scrollable }
        const rect = el.getBoundingClientRect()
        const startY = window.scrollY + rect.top
        const endY   = Math.max(startY, window.scrollY + rect.bottom - window.innerHeight)
        return { startY, endY }
      }, selector ?? null)

      // Auto-calculate scroll duration from page height unless user set --scroll
      const scrollable      = bounds.endY - bounds.startY
      const autoDurationMs  = Math.min(Math.max(Math.round(scrollable / 0.6), 4_000), 30_000)
      const scrollDurationMs = userSetScroll ? SCROLL_DURATION_MS : autoDurationMs
      const durationLabel   = userSetScroll
        ? `${scrollDurationMs / 1000}s`
        : `auto ${(scrollDurationMs / 1000).toFixed(1)}s · ${Math.round(scrollable)}px`

      // Pre-calculate swipe weights in Node.js for full determinism
      const swipeCount = Math.max(1, Math.round(scrollable / height))
      const rawW       = Array.from({ length: swipeCount }, () => 0.6 + Math.random() * 0.8)
      const sumW       = rawW.reduce((a, b) => a + b, 0)
      const distW      = rawW.map(w => w / sumW)
      const distBounds = [0]
      distW.forEach(w => distBounds.push(distBounds[distBounds.length - 1] + w))

      const scrollFrames = Math.ceil(scrollDurationMs / 1000 * targetFps)
      const holdFrames   = Math.ceil(HOLD_MS / 1000 * targetFps)
      const totalFrames  = noScroll ? holdFrames : scrollFrames + holdFrames

      const info = ` (${durationLabel})`
      await spinWithProgress([
        `Capturing ${totalFrames} frames${info}…`,
        `Asking Chrome to sit still${info}…`,
        `Tickling the renderer${info}…`,
        `Bribing the compositor${info}…`,
        `Calculating vibes per second${info}…`,
        `Doing the scroll of a lifetime${info}…`,
        `Telling the hero section to stop fidgeting${info}…`,
        `Scrolling slower than design revisions${info}…`,
        `Making pixels march in order${info}…`,
        `Instructing the browser to act natural${info}…`,
        `Pretending not to be a robot${info}…`,
        `Waiting for the above-the-fold to finish its thing${info}…`,
        `Capturing the essence of this website${info}…`,
      ], totalFrames, async (update) => {
        for (let i = 0; i < totalFrames; i++) {
          if (cancelled) return
          let scrollY = bounds.endY
          if (!noScroll && i < scrollFrames) {
            const t = scrollFrames > 1 ? i / (scrollFrames - 1) : 1
            let eased: number
            if (swipeScroll) {
              const seg  = Math.min(Math.floor(t * swipeCount), swipeCount - 1)
              const tSeg = (t * swipeCount) % 1
              eased = distBounds[seg] + distW[seg] * 0.5 * (1 - Math.cos(Math.PI * tSeg))
            } else {
              const m    = 0.15
              const vMax = 1 / (1 - m)
              eased = t <= m
                ? (vMax * t * t) / (2 * m)
                : t >= 1 - m
                  ? 1 - (vMax * (1 - t) * (1 - t)) / (2 * m)
                  : (vMax * m) / 2 + vMax * (t - m)
            }
            scrollY = bounds.startY + scrollable * eased
          }
          try {
            await page.evaluate((y: number) => window.scrollTo(0, y), scrollY)
            const framePath = join(frameDir, `frame_${String(i).padStart(5, '0')}.jpg`)
            await page.screenshot({ path: framePath, type: 'jpeg', quality: 95 })
          } catch (err) {
            if (cancelled) return
            throw err
          }
          update(i + 1)
        }
      })

      await page.close()
      await context.close()

      if (!hasFfmpeg) {
        console.error(`\n  ${c.red}✗${c.reset}  ffmpeg is required for video mode\n`)
        continue
      }

      const mp4Out = join(outDir, `${baseName}.mp4`)

      await spinWithProgress([
        'Encoding video…',
        'Compressing hopes and dreams…',
        'Running libx264 through its paces…',
        'Transcoding the vibes…',
        'Making it presentation-ready…',
        'Telling ffmpeg to do its best…',
      ], totalFrames, async (update) => {
        const scale      = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
        const filterFlag = watermarkPath
          ? `-filter_complex "[0:v]${scale}[s];[s][1:v]overlay=W-w-20:H-h-20"`
          : `-vf "${scale}"`
        const wmInput = watermarkPath ? `-i "${watermarkPath}"` : ''
        const ffCmd   = `ffmpeg -y -r ${targetFps} -i "${frameDir}/frame_%05d.jpg" ${wmInput} ${filterFlag} -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -movflags +faststart "${mp4Out}"`
        await new Promise<void>((resolve, reject) => {
          const proc = spawn('sh', ['-c', ffCmd])
          proc.stderr.on('data', (chunk: Buffer) => {
            const m = chunk.toString().match(/frame=\s*(\d+)/)
            if (m) update(Math.min(parseInt(m[1], 10), totalFrames))
          })
          proc.on('close', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`ffmpeg exited with code ${code}`))
          })
        })
        await rm(frameDir, { recursive: true, force: true })
        currentFrameDir = null
      })

      log(mp4Out)
      saved.push(mp4Out)
    }

    console.log()
  }
}

await browser.close()

// ─── zip ─────────────────────────────────────────────────────────────────────

if (doZip && saved.length > 0) {
  const zipName = `frameup_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.zip`
  const zipPath = join(outDir, zipName)
  await spin('Zipping outputs…', async () => {
    const fileList = saved.map(f => `"${f}"`).join(' ')
    if (process.platform === 'win32') {
      await execAsync(`powershell -Command "Compress-Archive -Path ${saved.map(f => `'${f}'`).join(',')} -DestinationPath '${zipPath}'"`)
    } else {
      await execAsync(`zip -j "${zipPath}" ${fileList}`)
    }
  })
  log(zipPath)
}

// ─── done ─────────────────────────────────────────────────────────────────────

const noun = mode === 'images' ? (saved.length === 1 ? 'frame' : 'frames') : (saved.length === 1 ? 'clip' : 'clips')
console.log(`  ${c.magenta}✦${c.reset}  ${c.bold}${saved.length} ${noun} saved${c.reset}  ${c.dim}→ ${outDir}${c.reset}\n`)

if (doOpen) {
  const openCmd = process.platform === 'win32' ? `explorer "${outDir}"` : `open "${outDir}"`
  execSync(openCmd)
}
