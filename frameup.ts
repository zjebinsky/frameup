import { chromium } from 'playwright'
import { join } from 'path'
import { tmpdir, homedir } from 'os'
import { rename, readdir, mkdir } from 'fs/promises'
import { exec, execSync } from 'child_process'
import { promisify } from 'util'

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

if (args.length === 0 || args.includes('--help')) {
  console.log(`
  ${c.bold}frameup ✦${c.reset}

  ${c.dim}Usage:${c.reset}
    bun run frameup.ts <url> [images|video] [options]

  ${c.dim}Modes:${c.reset}
    images   Capture screenshots (default)
    video    Record a scroll-through video

  ${c.dim}Options:${c.reset}
    --wait=<ms>      Wait before capturing, lets animations finish  (default: 6000)
    --scroll=<ms>    Duration of the scroll in video mode           (default: 8000)
    --hold=<ms>      Pause at the bottom before the video ends      (default: 1500)
    --density=<n>    Pixel density for images, 1, 2, or 3           (default: 3)
    --selector=<css> Capture a specific element only
    --help           Show this help message

  ${c.dim}Examples:${c.reset}
    bun run frameup.ts https://example.com
    bun run frameup.ts https://example.com video
    bun run frameup.ts https://example.com video --scroll=12000
    bun run frameup.ts https://example.com images --wait=3000 --density=2
    bun run frameup.ts https://example.com images --selector=".hero"
    bun run frameup.ts https://example.com video --selector=".features"
  `)
  process.exit(0)
}

const url  = args.find(a => !a.startsWith('--') && a !== 'images' && a !== 'video')
const mode = args.find(a => a === 'images' || a === 'video') ?? 'images'

if (!url) {
  console.error(`\n  ${c.red}✗${c.reset}  A URL is required. Run with --help for usage.\n`)
  process.exit(1)
}

function flag(name: string, fallback: number): number {
  const arg = args.find(a => a.startsWith(`--${name}=`))
  return arg ? Number(arg.split('=')[1]) : fallback
}

const SIZES = [
  { width: 1500, height: 900,  label: 'desktop' },
  { width: 393,  height: 852,  label: 'mobile'  },
]

const DENSITY            = flag('density', 3)
const selector           = args.find(a => a.startsWith('--selector='))?.split('=').slice(1).join('=')
const WAIT_MS            = flag('wait',    6_000)
const SCROLL_DURATION_MS = flag('scroll',  8_000)
const HOLD_MS            = flag('hold',    1_500)

const hasFfmpeg = (() => {
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true }
  catch { return false }
})()

// ─── go ──────────────────────────────────────────────────────────────────────

const hostname = new URL(url).hostname.replace(/\./g, '-')
const ts       = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
const outDir   = join(homedir(), 'Downloads')
const suffix   = selector ? `_${selector.replace(/[^a-z0-9]/gi, '')}` : ''

console.log(`\n  ${c.bold}frameup ✦${c.reset}  ${c.dim}${hostname}  ·  ${mode}${c.reset}\n`)

const browser = await chromium.launch()
const saved: string[] = []

for (const { width, height, label } of SIZES) {
  if (mode === 'images') {
    const page = await browser.newPage({ deviceScaleFactor: DENSITY })
    await page.setViewportSize({ width, height })

    await spin(`Opening ${hostname}…`, () =>
      page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    )

    await spin('Letting animations breathe…', () =>
      page.waitForTimeout(WAIT_MS)
    )

    const file = join(outDir, `${hostname}_${ts}_${width}x${height}${suffix}.png`)

    await spin(`Shooting ${label} (${width}×${height})…`, async () => {
      if (selector) {
        await page.locator(selector).first().screenshot({ path: file })
      } else {
        await page.screenshot({ path: file })
      }
    })

    log(file)
    saved.push(file)
    await page.close()

  } else {
    const videoDir = join(tmpdir(), `frameup-${Date.now()}`)
    await mkdir(videoDir, { recursive: true })

    const context = await browser.newContext({
      viewport: { width, height },
      recordVideo: { dir: videoDir, size: { width, height } },
    })

    const page = await context.newPage()

    await spin(`Opening ${hostname}…`, () =>
      page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    )

    await spin('Letting animations breathe…', () =>
      page.waitForTimeout(WAIT_MS)
    )

    await spin(`Rolling ${label} (${width}×${height})…`, async () => {
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

    const baseName = `${hostname}_${ts}_${width}x${height}${suffix}`
    const webmSrc  = join(videoDir, webm)

    if (hasFfmpeg) {
      const mp4Out = join(outDir, `${baseName}.mp4`)
      await spin('Developing the footage…', () =>
        execAsync(`ffmpeg -y -i "${webmSrc}" -c:v libx264 -pix_fmt yuv420p "${mp4Out}"`)
      )
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

await browser.close()

const noun = mode === 'images' ? (saved.length === 1 ? 'frame' : 'frames') : (saved.length === 1 ? 'clip' : 'clips')
console.log(`  ${c.magenta}✦${c.reset}  ${c.bold}${saved.length} ${noun} saved${c.reset}  ${c.dim}→ ~/Downloads${c.reset}\n`)
