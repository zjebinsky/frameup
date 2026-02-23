import { chromium } from 'playwright'
import { join, resolve } from 'path'
import { tmpdir, homedir } from 'os'
import { rename, readdir, mkdir, readFile } from 'fs/promises'
import { exec, execSync } from 'child_process'
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
    process.stdout.write(`\r  ${c.red}✗${c.reset}  ${label}\n`)
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
  console.log(`\n  ${c.bold}frameup ✦${c.reset}\n`)
  p.intro('  Let\'s set up your capture.')

  const urlInput = await p.text({
    message: 'URL(s) to capture',
    placeholder: 'https://yoursite.com  (space-separated for multiple)',
    validate: v => v.trim() ? undefined : 'At least one URL is required',
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
const HOLD_MS            = numFlag('hold',   1_500)
const darkMode           = args.includes('--dark')
const noScroll           = args.includes('--no-scroll')
const doZip              = args.includes('--zip')
const doOpen             = args.includes('--open')

const outDir = outArg ? resolve(outArg) : join(homedir(), 'Downloads')
await mkdir(outDir, { recursive: true })

const suffix = selector ? `_${selector.replace(/[^a-z0-9]/gi, '')}` : ''

const clip = clipArg
  ? (() => { const [x, y, w, h] = clipArg.split(',').map(Number); return { left: x, top: y, width: w, height: h } })()
  : null

async function dismissCookies(page: import('playwright').Page) {
  await page.evaluate(() => {
    // Click the most common accept buttons
    const acceptText = /^(accept|accept all|accept cookies|agree|i agree|got it|ok|okay|allow|allow all|allow cookies|consent|continue|yes|confirm)$/i
    const buttons = [...document.querySelectorAll('button, a, [role="button"]')]
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
    const elements = [...document.querySelectorAll('*')]
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

const browser = await chromium.launch()
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
      const videoDir = join(tmpdir(), `frameup-${Date.now()}`)
      await mkdir(videoDir, { recursive: true })

      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: darkMode ? 'dark' : 'light',
        recordVideo: { dir: videoDir, size: { width, height } },
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

      await spin(`Rolling ${label} (${width}×${height})…`, async () => {
        if (!noScroll) {
          await page.evaluate(async ({ durationMs, sel }) => {
            let startY = 0
            let endY   = document.body.scrollHeight - window.innerHeight

            if (sel) {
              const el = document.querySelector(sel)
              if (el) {
                const rect = el.getBoundingClientRect()
                startY = window.scrollY + rect.top
                endY   = Math.max(startY, window.scrollY + rect.bottom - window.innerHeight)
                window.scrollTo(0, startY)
              }
            }

            if (endY <= startY) return
            const start = performance.now()
            await new Promise<void>(resolve => {
              function step() {
                const t = Math.min((performance.now() - start) / durationMs, 1)
                const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
                window.scrollTo(0, startY + (endY - startY) * eased)
                t < 1 ? requestAnimationFrame(step) : resolve()
              }
              requestAnimationFrame(step)
            })
          }, { durationMs: SCROLL_DURATION_MS, sel: selector ?? null })
        }

        await page.waitForTimeout(HOLD_MS)
        await page.close()
        await context.close()
      })

      const files = await readdir(videoDir)
      const webm  = files.find(f => f.endsWith('.webm'))
      if (!webm) {
        console.error(`\n  ${c.red}✗${c.reset}  No video found for ${width}×${height}\n`)
        continue
      }

      const baseName = `${stem}_${ts}_${width}x${height}${suffix}`
      const webmSrc  = join(videoDir, webm)

      if (hasFfmpeg) {
        const mp4Out = join(outDir, `${baseName}.mp4`)
        await spin('Developing the footage…', () => {
          const wmFlag  = watermarkPath ? `-i "${watermarkPath}" -filter_complex "overlay=W-w-20:H-h-20" ` : ''
          const fpsFlag = FPS > 0 ? `-r ${FPS} ` : ''
          return execAsync(`ffmpeg -y -i "${webmSrc}" ${wmFlag}${fpsFlag}-c:v libx264 -pix_fmt yuv420p "${mp4Out}"`)
        })
        log(mp4Out)
        saved.push(mp4Out)
      } else {
        const webmOut = join(outDir, `${baseName}.webm`)
        await rename(webmSrc, webmOut)
        log(webmOut)
        saved.push(webmOut)
      }
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
