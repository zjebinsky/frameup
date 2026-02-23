import { chromium } from 'playwright'
import { join } from 'path'
import { tmpdir, homedir } from 'os'
import { rename, readdir, mkdir } from 'fs/promises'
import { execSync } from 'child_process'

const args = process.argv.slice(2)

if (args.length === 0 || args.includes('--help')) {
  console.log(`
Usage:
  bun run frameup.ts <url> [images|video] [options]

Modes:
  images   Capture screenshots (default)
  video    Record a scroll-through video

Options:
  --wait=<ms>      Wait before capturing, lets animations finish  (default: 6000)
  --scroll=<ms>    Duration of the scroll in video mode           (default: 8000)
  --hold=<ms>      Pause at the bottom before the video ends      (default: 1500)
  --density=<n>    Pixel density for images, 1, 2, or 3           (default: 3)
  --help           Show this help message

Examples:
  bun run frameup.ts https://example.com
  bun run frameup.ts https://example.com video
  bun run frameup.ts https://example.com video --scroll=12000
  bun run frameup.ts https://example.com images --wait=3000 --density=2
  `)
  process.exit(0)
}

const url  = args.find(a => !a.startsWith('--') && a !== 'images' && a !== 'video')
const mode = args.find(a => a === 'images' || a === 'video') ?? 'images'

if (!url) {
  console.error('Error: a URL is required. Run with --help for usage.')
  process.exit(1)
}

function flag(name: string, fallback: number): number {
  const arg = args.find(a => a.startsWith(`--${name}=`))
  return arg ? Number(arg.split('=')[1]) : fallback
}

const SIZES = [
  { width: 1500, height: 900 },
  { width: 393,  height: 852 },
]

const DENSITY          = flag('density', 3)
const WAIT_MS          = flag('wait',    6_000)
const SCROLL_DURATION_MS = flag('scroll', 8_000)
const HOLD_MS          = flag('hold',    1_500)

const hasFfmpeg = (() => {
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true }
  catch { return false }
})()

const browser  = await chromium.launch()
const hostname = new URL(url).hostname.replace(/\./g, '-')
const ts       = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
const outDir   = join(homedir(), 'Downloads')

for (const { width, height } of SIZES) {
  if (mode === 'images') {
    const page = await browser.newPage({ deviceScaleFactor: DENSITY })
    await page.setViewportSize({ width, height })
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(WAIT_MS)
    const file = join(outDir, `${hostname}_${ts}_${width}x${height}.png`)
    await page.screenshot({ path: file })
    console.log(`✓ ${file}`)
    await page.close()
  } else {
    const videoDir = join(tmpdir(), `frameup-${Date.now()}`)
    await mkdir(videoDir, { recursive: true })

    const context = await browser.newContext({
      viewport: { width, height },
      recordVideo: { dir: videoDir, size: { width, height } },
    })

    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(WAIT_MS)

    await page.evaluate(async (durationMs) => {
      const totalHeight = document.body.scrollHeight - window.innerHeight
      if (totalHeight <= 0) return
      const start = performance.now()
      await new Promise<void>(resolve => {
        function step() {
          const t = Math.min((performance.now() - start) / durationMs, 1)
          const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
          window.scrollTo(0, totalHeight * eased)
          t < 1 ? requestAnimationFrame(step) : resolve()
        }
        requestAnimationFrame(step)
      })
    }, SCROLL_DURATION_MS)

    await page.waitForTimeout(HOLD_MS)
    await page.close()
    await context.close()

    const files = await readdir(videoDir)
    const webm  = files.find(f => f.endsWith('.webm'))
    if (!webm) {
      console.error(`✗ No video file found for ${width}x${height}`)
      continue
    }

    const baseName = `${hostname}_${ts}_${width}x${height}`
    const webmSrc  = join(videoDir, webm)

    if (hasFfmpeg) {
      const mp4Out = join(outDir, `${baseName}.mp4`)
      execSync(`ffmpeg -y -i "${webmSrc}" -c:v libx264 -pix_fmt yuv420p "${mp4Out}"`, { stdio: 'ignore' })
      console.log(`✓ ${mp4Out}`)
    } else {
      const webmOut = join(outDir, `${baseName}.webm`)
      await rename(webmSrc, webmOut)
      console.log(`✓ ${webmOut}`)
    }
  }
}

await browser.close()
