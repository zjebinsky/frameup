import { chromium } from 'playwright'
import { join } from 'path'
import { tmpdir } from 'os'
import { rename, readdir, mkdir } from 'fs/promises'
import { execSync } from 'child_process'

const url  = process.argv[2]
const mode = process.argv[3] ?? 'images'

if (!url || !['images', 'video'].includes(mode)) {
  console.error('Usage: bun run capture.ts <url> [images|video]')
  process.exit(1)
}

const SIZES = [
  { width: 1500, height: 900 },
  { width: 393,  height: 852 },
]

// images
const DENSITY = 3

// video
const WAIT_MS            = 6_000
const SCROLL_DURATION_MS = 8_000
const HOLD_MS            = 1_500

const hasFfmpeg = (() => {
  try { execSync('which ffmpeg', { stdio: 'ignore' }); return true }
  catch { return false }
})()

const browser  = await chromium.launch()
const hostname = new URL(url).hostname.replace(/\./g, '-')
const ts       = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
const outDir   = join(process.env.HOME!, 'Downloads')

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
    const videoDir = join(tmpdir(), `capture-${Date.now()}`)
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
