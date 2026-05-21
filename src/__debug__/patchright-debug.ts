import { type ClickOptions, GhostCursor } from '../patchright/spoof'
import { join } from 'path'
import { promises as fs } from 'fs'
import { chromium } from 'patchright'

const delay = async (ms: number): Promise<void> => {
  if (ms < 1) return
  return await new Promise((resolve) => setTimeout(resolve, ms))
}

const cursorDefaultOptions = {
  moveDelay: 100,
  moveSpeed: 99,
  hesitate: 100,
  waitForClick: 10,
  scrollDelay: 100,
  scrollSpeed: 40,
  inViewportMargin: 50,
  waitForSelector: 200
} as const satisfies ClickOptions

chromium.launch({ headless: false }).then(async (browser) => {
  const page = await browser.newPage()

  const cursor = await GhostCursor.create(page, {
    visible: true,
    defaultOptions: {
      move: cursorDefaultOptions,
      moveTo: cursorDefaultOptions,
      click: cursorDefaultOptions,
      scroll: cursorDefaultOptions,
      getElement: cursorDefaultOptions
    }
  })

  const html = await fs.readFile(join(__dirname, 'custom-page.html'), 'utf8')

  await page.goto('data:text/html,' + encodeURIComponent(html), {
    waitUntil: 'networkidle'
  })

  const performActions = async (): Promise<void> => {
    await cursor.click('#box1')

    await cursor.click('#box2')

    await cursor.removeMouseHelper()

    await cursor.click('#box3')

    await cursor.click('#box1')
  }

  await performActions()

  // allows us to hit "refresh" button to restart the events
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  page.on('load', async () => {
    await delay(500)
    await page.evaluate(() => { window.scrollTo(0, 0) })
    await delay(1000)

    await performActions()
  })
}).catch((e) => {
  console.error(e)
})
