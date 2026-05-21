import { chromium, type Browser, type Page, type ElementHandle } from 'patchright'
import { type ClickOptions, GhostCursor } from '../spoof'
import { join } from 'path'
import { installMouseHelper } from '../mouse-helper'

let browser: Browser
let page: Page
let cursor: GhostCursor

const cursorDefaultOptions = {
  moveDelay: 0,
  moveSpeed: 99,
  hesitate: 0,
  waitForClick: 0,
  scrollDelay: 0,
  scrollSpeed: 99,
  inViewportMargin: 50
} as const satisfies ClickOptions

declare global {
  // eslint-disable-next-line no-var
  var boxWasClicked: boolean
}

const isIntersectingViewport = async (element: ElementHandle): Promise<boolean> => {
  return await element.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight !== 0 ? window.innerHeight : document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth !== 0 ? window.innerWidth : document.documentElement.clientWidth)
    )
  })
}

describe('Mouse movements', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 800, height: 600 }
    })
    page = await context.newPage()
    await installMouseHelper(page)
  })

  afterAll(async () => {
    await browser.close()
  })

  beforeEach(async () => {
    const testPageUrl = `file://${join(__dirname as string, 'custom-page.html') as string}`
    await page.goto(testPageUrl)
    await page.evaluate(() => {
      window.scrollTo(0, 0)
    })

    cursor = await GhostCursor.create(page, {
      defaultOptions: {
        move: cursorDefaultOptions,
        click: cursorDefaultOptions,
        moveTo: cursorDefaultOptions
      }
    })
  })

  const testClick = async (clickSelector: string): Promise<void> => {
    const handle = await page.waitForSelector(clickSelector)
    if (handle == null) throw new Error(`${clickSelector} not found`)
    const wasClickedBefore = await handle.evaluate(el => el.getAttribute('data-was-clicked') === 'true')
    expect(wasClickedBefore).toEqual(false)

    await cursor.click(clickSelector)

    const wasClickedAfter = await handle.evaluate(el => el.getAttribute('data-was-clicked') === 'true')
    expect(wasClickedAfter).toEqual(true)
  }

  const getScrollPosition = async (): Promise<{ top: number, left: number }> => await page.evaluate(() => (
    { top: window.scrollY, left: window.scrollX }
  ))

  it('Should click on the element without throwing an error (CSS selector)', async () => {
    await testClick('#box1')
  })

  it('Should click on the element without throwing an error (XPath selector)', async () => {
    await testClick('//*[@id="box1"]')
  })

  it('Should scroll to elements correctly', async () => {
    const boxes = await Promise.all([1, 2, 3].map(async (number: number): Promise<ElementHandle<HTMLElement>> => {
      const selector = `#box${number}`
      const box = await page.waitForSelector(selector) as ElementHandle<HTMLElement> | null
      if (box == null) throw new Error(`${selector} not found`)
      return box
    }))

    expect(await getScrollPosition()).toEqual({ top: 0, left: 0 })

    expect(await isIntersectingViewport(boxes[0])).toBeTruthy()
    await cursor.click(boxes[0])
    expect(await getScrollPosition()).toEqual({ top: 0, left: 0 })
    expect(await isIntersectingViewport(boxes[0])).toBeTruthy()

    expect(await isIntersectingViewport(boxes[1])).toBeFalsy()
    await cursor.move(boxes[1])
    expect(await getScrollPosition()).toEqual({ top: 2500, left: 0 })
    expect(await isIntersectingViewport(boxes[1])).toBeTruthy()

    expect(await isIntersectingViewport(boxes[2])).toBeFalsy()
    await cursor.move(boxes[2])
    expect(await getScrollPosition()).toEqual({ top: 4450, left: 2250 })
    expect(await isIntersectingViewport(boxes[2])).toBeTruthy()

    expect(await isIntersectingViewport(boxes[0])).toBeFalsy()
    await cursor.click(boxes[0])
    expect(await isIntersectingViewport(boxes[0])).toBeTruthy()
  })

  it('Should scroll to position correctly', async () => {
    expect(await getScrollPosition()).toEqual({ top: 0, left: 0 })

    await cursor.scrollTo('bottom')
    expect(await getScrollPosition()).toEqual({ top: 4450, left: 0 })

    await cursor.scrollTo('right')
    expect(await getScrollPosition()).toEqual({ top: 4450, left: 2250 })

    await cursor.scrollTo('top')
    expect(await getScrollPosition()).toEqual({ top: 0, left: 2250 })

    await cursor.scrollTo('left')
    expect(await getScrollPosition()).toEqual({ top: 0, left: 0 })

    await cursor.scrollTo({ y: 200, x: 400 })
    expect(await getScrollPosition()).toEqual({ top: 200, left: 400 })
  })
})

jest.setTimeout(25_000)
