import type { ElementHandle, Page, CDPSession } from 'patchright'
import debug from 'debug'
import {
  type Vector,
  type TimedVector,
  bezierCurve,
  bezierCurveSpeed,
  direction,
  magnitude,
  origin,
  overshoot,
  add,
  clamp,
  scale,
  extrapolate
} from './math'
import { installMouseHelper } from './mouse-helper'

/** BoundingBox type — Patchright uses inline types, so we define our own. */
export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export { installMouseHelper }

const log = debug('ghost-cursor')

export interface BoxOptions {
  /**
   * Percentage of padding to be added inside the element when determining the target point.
   * Example:
   * - `0` = may be anywhere within the element.
   * - `100` = will always be center of element.
   * @default 0
   */
  readonly paddingPercentage?: number
  /**
   * Destination to move the cursor to, relative to the top-left corner of the element.
   * If specified, `paddingPercentage` is not used.
   * If not specified (default), destination is random point within the `paddingPercentage`.
   * @default undefined (random point)
   */
  readonly destination?: Vector
}

export interface GetElementOptions {
  /**
   * Time to wait for the selector to appear in milliseconds.
   * Default is to not wait for selector.
   */
  readonly waitForSelector?: number
}

export interface ScrollOptions {
  /**
   * Scroll speed. 0 to 100. 100 is instant.
   * @default 100
   */
  readonly scrollSpeed?: number
  /**
   * Time to wait after scrolling.
   * @default 200
   */
  readonly scrollDelay?: number
}

export interface ScrollIntoViewOptions extends ScrollOptions, GetElementOptions {
  /**
   * Scroll speed (when scrolling occurs). 0 to 100. 100 is instant.
   * @default 100
   */
  readonly scrollSpeed?: number
  /**
   * Time to wait after scrolling (when scrolling occurs).
   * @default 200
   */
  readonly scrollDelay?: number
  /**
   * Margin (in px) to add around the element when ensuring it is in the viewport.
   * @default 0
   */
  readonly inViewportMargin?: number
}

export interface MoveOptions extends BoxOptions, ScrollIntoViewOptions, Pick<PathOptions, 'moveSpeed'> {
  /**
   * Delay after moving the mouse in milliseconds. If `randomizeMoveDelay=true`, delay is randomized from 0 to `moveDelay`.
   * @default 0
   */
  readonly moveDelay?: number
  /**
   * Randomize delay between actions from `0` to `moveDelay`. See `moveDelay` docs.
   * @default true
   */
  readonly randomizeMoveDelay?: boolean
  /**
   * Maximum number of attempts to mouse-over the element.
   * @default 10
   */
  readonly maxTries?: number
  /**
   * Distance from current location to destination that triggers overshoot to
   * occur. (Below this distance, no overshoot will occur).
   * @default 500
   */
  readonly overshootThreshold?: number
}

export interface ClickOptions extends MoveOptions {
  /**
   * Delay before initiating the click action in milliseconds.
   * @default 0
   */
  readonly hesitate?: number
  /**
   * Delay between mousedown and mouseup in milliseconds.
   * @default 0
   */
  readonly waitForClick?: number
  /**
   * @default 2000
   */
  readonly moveDelay?: number
  /**
   * @default "left"
   */
  readonly button?: 'left' | 'right' | 'middle'
  /**
   * @default 1
   */
  readonly clickCount?: number
}

export interface PathOptions {
  /**
   * Override the spread of the generated path.
   */
  readonly spreadOverride?: number
  /**
   * Speed of mouse movement.
   * Default is random.
   */
  readonly moveSpeed?: number

  /**
   * Generate timestamps for each point in the path.
   */
  readonly useTimestamps?: boolean
}

export interface RandomMoveOptions extends Pick<MoveOptions, 'moveDelay' | 'randomizeMoveDelay' | 'moveSpeed'> {
  /**
   * @default 2000
   */
  readonly moveDelay?: number
}

export interface MoveToOptions extends PathOptions, Pick<MoveOptions, 'moveDelay' | 'randomizeMoveDelay'> {
  /**
   * @default 0
   */
  readonly moveDelay?: number
}

export type ScrollToDestination = Partial<Vector> | 'top' | 'bottom' | 'left' | 'right'

export type MouseButtonOptions = Pick<ClickOptions, 'button' | 'clickCount'>

export interface TypeOptions {
  /**
   * Average delay between key presses in milliseconds.
   * @default 100
   */
  readonly delay?: number
  /**
   * Whether to randomize the delay between key presses.
   * @default true
   */
  readonly randomizeDelay?: boolean
  /**
   * Probability of making a typo (0 to 1).
   * @default 0.05
   */
  readonly typoRatio?: number
}

/**
 * Default options for cursor functions.
 */
export interface DefaultOptions {
  /**
   * Default options for the `randomMove` function that occurs when `performRandomMoves=true`
   * @default RandomMoveOptions
   */
  randomMove?: RandomMoveOptions
  /**
   * Default options for the `move` function
   * @default MoveOptions
   */
  move?: MoveOptions
  /**
   * Default options for the `moveTo` function
   * @default MoveToOptions
   */
  moveTo?: MoveToOptions
  /**
   * Default options for the `click` function
   * @default ClickOptions
   */
  click?: ClickOptions
  /**
   * Default options for the `type` function
   * @default TypeOptions
   */
  type?: TypeOptions
  /**
   * Default options for the `scrollIntoView`, `scrollTo`, and `scroll` functions
   * @default ScrollIntoViewOptions
   */
  scroll?: ScrollOptions & ScrollIntoViewOptions
  /**
   * Default options for the `getElement` function
   * @default GetElementOptions
   */
  getElement?: GetElementOptions
}

/** Helper function to wait a specified number of milliseconds  */
const delay = async (ms: number): Promise<void> => {
  if (ms < 1) return
  return await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculate the amount of time needed to move from (x1, y1) to (x2, y2)
 * given the width of the element being clicked on
 * https://en.wikipedia.org/wiki/Fitts%27s_law
 */
const fitts = (distance: number, width: number): number => {
  const a = 0
  const b = 2
  const id = Math.log2(distance / width + 1)
  return a + b * id
}

const QWERTY_NEIGHBORS: Record<string, string> = {
  q: 'wase',
  w: 'qase3',
  e: 'wsdr4',
  r: 'edft5',
  t: 'rfgy6',
  y: 'tghu7',
  u: 'yhij8',
  i: 'ujok9',
  o: 'iklp0',
  p: 'ol[-',
  a: 'qwszx',
  s: 'weazxd',
  d: 'erfcxs',
  f: 'rtgvcd',
  g: 'tyhbvf',
  h: 'yujnbg',
  j: 'uikmnh',
  k: 'ijlm',
  l: 'okp;',
  z: 'asx',
  x: 'zsdc',
  c: 'xdfv',
  v: 'cfgb',
  b: 'vghn',
  n: 'bhjm',
  m: 'njkl'
}

const getRandomTypoChar = (char: string): string => {
  const isUpper = char === char.toUpperCase() && char !== char.toLowerCase()
  const lowerChar = char.toLowerCase()
  const neighbors = QWERTY_NEIGHBORS[lowerChar]
  if (neighbors === undefined) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'
    const randomChar = alphabet[Math.floor(Math.random() * alphabet.length)]
    return isUpper ? randomChar.toUpperCase() : randomChar
  }
  const typo = neighbors[Math.floor(Math.random() * neighbors.length)]
  return isUpper ? typo.toUpperCase() : typo
}

/** Get a random point on a box */
const getRandomBoxPoint = (
  { x, y, width, height }: BoundingBox,
  options?: Pick<BoxOptions, 'paddingPercentage'>
): Vector => {
  let paddingWidth = 0
  let paddingHeight = 0

  if (
    options?.paddingPercentage !== undefined &&
    options?.paddingPercentage > 0 &&
    options?.paddingPercentage <= 100
  ) {
    paddingWidth = (width * options.paddingPercentage) / 100
    paddingHeight = (height * options.paddingPercentage) / 100
  }

  return {
    x: x + paddingWidth / 2 + Math.random() * (width - paddingWidth),
    y: y + paddingHeight / 2 + Math.random() * (height - paddingHeight)
  }
}

/** Get a random point on a browser window. Works in both headless and headed modes. */
export const getRandomPagePoint = async (page: Page): Promise<Vector> => {
  let viewport = page.viewportSize()

  // Fallback: if viewportSize() returns null (e.g., headless without explicit viewport),
  // get the actual window dimensions via page.evaluate
  if (viewport === null) {
    try {
      viewport = await page.evaluate(() => ({
        width: (window.innerWidth !== 0) ? window.innerWidth : ((document.documentElement.clientWidth !== 0) ? document.documentElement.clientWidth : 1920),
        height: (window.innerHeight !== 0) ? window.innerHeight : ((document.documentElement.clientHeight !== 0) ? document.documentElement.clientHeight : 1080)
      }))
    } catch {
      // Last resort fallback: use common default viewport
      viewport = { width: 1920, height: 1080 }
    }
  }

  return getRandomBoxPoint({
    x: origin.x,
    y: origin.y,
    width: viewport.width,
    height: viewport.height
  })
}

/** Get correct position of elements. Works reliably in both headless and headed modes. */
export const getElementBox = async (
  page: Page,
  element: ElementHandle,
  relativeToMainFrame: boolean = true): Promise<BoundingBox> => {
  try {
    const elementBox = await element.boundingBox()
    if (elementBox === null) throw new Error('Element boundingBox is null, falling back to getBoundingClientRect')
    // Validate the bounding box has reasonable dimensions
    if (elementBox.width <= 0 || elementBox.height <= 0) {
      log('BoundingBox has zero dimensions, using getBoundingClientRect')
      throw new Error('Element has zero dimensions')
    }
    return elementBox
  } catch {
    log('BoundingBox unavailable, using getBoundingClientRect')
    try {
      const rect = await element.evaluate((el: Element) => {
        const rect = el.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      }) as BoundingBox
      // If element is still zero-sized (hidden), try scrolling it into view first
      if (rect.width <= 0 || rect.height <= 0) {
        await element.evaluate((el: Element) => el.scrollIntoView({ block: 'center' }))
        const retryRect = await element.evaluate((el: Element) => {
          const rect = el.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }) as BoundingBox
        if (retryRect.width > 0 && retryRect.height > 0) return retryRect
      }
      return rect
    } catch (evalError) {
      log('getBoundingClientRect also failed:', evalError)
      throw new Error('Could not determine element position. Element may be detached or hidden.')
    }
  }
}

/** Generates a set of points for mouse movement between two coordinates. */
export function path (
  start: Vector,
  end: Vector | BoundingBox,
  /**
   * Additional options for generating the path.
   * Can also be a number which will set `spreadOverride`.
   */
  options?: number | PathOptions): Vector[] | TimedVector[] {
  const optionsResolved: PathOptions = typeof options === 'number'
    ? { spreadOverride: options }
    : { ...options }

  const DEFAULT_WIDTH = 100
  const MIN_STEPS = 25
  const width = 'width' in end && end.width !== 0 ? end.width : DEFAULT_WIDTH
  const curve = bezierCurve(start, end, optionsResolved.spreadOverride)
  const length = curve.length() * 0.8

  const speed = optionsResolved.moveSpeed !== undefined && optionsResolved.moveSpeed > 0
    ? (25 / optionsResolved.moveSpeed)
    : Math.random()
  const baseTime = speed * MIN_STEPS
  const steps = Math.ceil((Math.log2(fitts(length, width) + 1) + baseTime) * 3)
  const re = curve.getLUT(steps)
  return clampPositive(re, optionsResolved)
}

const clampPositive = (vectors: Vector[], options?: PathOptions): Vector[] | TimedVector[] => {
  const clampedVectors = vectors.map((vector) => ({
    x: Math.max(0, vector.x),
    y: Math.max(0, vector.y)
  }))

  return options?.useTimestamps === true ? generateTimestamps(clampedVectors, options) : clampedVectors
}

const generateTimestamps = (vectors: Vector[], options?: PathOptions): TimedVector[] => {
  const speed = options?.moveSpeed ?? (Math.random() * 0.5 + 0.5)
  const timeToMove = (P0: Vector, P1: Vector, P2: Vector, P3: Vector, samples: number): number => {
    let total = 0
    const dt = 1 / samples

    for (let t = 0; t < 1; t += dt) {
      const v1 = bezierCurveSpeed(t * dt, P0, P1, P2, P3)
      const v2 = bezierCurveSpeed(t, P0, P1, P2, P3)
      total += (v1 + v2) * dt / 2
    }

    return Math.round(total / speed)
  }

  const timedVectors: TimedVector[] = []

  for (let i = 0; i < vectors.length; i++) {
    if (i === 0) {
      timedVectors.push({ ...vectors[i], timestamp: Date.now() })
    } else {
      const P0 = vectors[i - 1]
      const P1 = vectors[i]
      const P2 = i + 1 < vectors.length ? vectors[i + 1] : extrapolate(P0, P1)
      const P3 = i + 2 < vectors.length ? vectors[i + 2] : extrapolate(P1, P2)
      const time = timeToMove(P0, P1, P2, P3, vectors.length)

      timedVectors.push({
        ...vectors[i],
        timestamp: timedVectors[i - 1].timestamp + time
      })
    }
  }

  return timedVectors
}

const shouldOvershoot = (a: Vector, b: Vector, threshold: number): boolean =>
  magnitude(direction(a, b)) > threshold

const intersectsElement = (vec: Vector, box: BoundingBox): boolean => {
  return (
    vec.x > box.x &&
    vec.x <= box.x + box.width &&
    vec.y > box.y &&
    vec.y <= box.y + box.height
  )
}

export interface GhostCursorOptions {
  /**
   * Cursor start position.
   * @default { x: 0, y: 0 }
   */
  start?: Vector
  /**
   * Initially perform random movements.
   * If `move`,`click`, etc. is performed, these random movements end.
   * @default false
   */
  performRandomMoves?: boolean
  /**
   * Set custom default options for cursor action functions.
   * Default values are described in the type JSdocs.
   */
  defaultOptions?: DefaultOptions
  /**
   * Whether cursor should be made visible using `installMouseHelper`.
   * @default false
   */
  visible?: boolean
}

export class GhostCursor {
  public readonly page: Page
  /** Default options for cursor functions. */
  public defaultOptions: DefaultOptions

  /** CDP session for low-level mouse event dispatching. */
  private cdpSession: CDPSession

  /** Location of the cursor. */
  private location: Vector
  /** Whether mouse is moving via `click`, `move`, `moveTo`, etc. (does not include random movements). Initial state: not moving. */
  private moving: boolean = false
  /** Make the cursor no longer visible. Defined only if `visible=true` was passed, or `installMouseHelper` ran later. */
  private removeMouseHelperFn: undefined | (() => Promise<void>)

  private static readonly OVERSHOOT_SPREAD = 10
  private static readonly OVERSHOOT_RADIUS = 120

  /**
   * Private constructor. Use `GhostCursor.create()` factory method instead.
   */
  private constructor (
    page: Page,
    cdpSession: CDPSession,
    options: GhostCursorOptions = {}
  ) {
    this.page = page
    this.cdpSession = cdpSession
    this.location = options.start ?? origin
    this.defaultOptions = options.defaultOptions ?? {}
  }

  /** Check if the browser is still connected. */
  private isConnected (): boolean {
    try {
      return this.page.context().browser()?.isConnected() ?? false
    } catch {
      return false
    }
  }

  /** Attempt to re-create CDP session if it was disconnected. */
  private async ensureCDPSession (): Promise<void> {
    try {
      // Quick check: try a lightweight CDP call
      await this.cdpSession.send('Runtime.getIsolateId' as any)
    } catch {
      if (!this.isConnected()) return
      log('CDP session lost, attempting to re-create...')
      try {
        this.cdpSession = await this.page.context().newCDPSession(this.page)
        log('CDP session re-created successfully')
      } catch (reconnectError) {
        log('Failed to re-create CDP session:', reconnectError)
      }
    }
  }

  /**
   * Create a new GhostCursor instance. Async factory method required because
   * CDPSession creation is asynchronous in Playwright/Patchright.
   */
  public static async create (
    page: Page,
    options: GhostCursorOptions = {}
  ): Promise<GhostCursor> {
    let cdpSession: CDPSession

    // Create CDP session with retry for resilience (important for headless mode)
    try {
      cdpSession = await page.context().newCDPSession(page)
    } catch (error) {
      log('First CDPSession creation failed, retrying:', error)
      // Brief wait before retry
      await new Promise((resolve) => setTimeout(resolve, 100))
      try {
        cdpSession = await page.context().newCDPSession(page)
      } catch (retryError) {
        log('CDPSession retry also failed:', retryError)
        throw new Error(
          'Failed to create CDP session. Ensure the browser is launched with a Chromium-based browser. ' +
          'Patchright only supports Chromium. Error: ' + String(retryError)
        )
      }
    }

    const cursor = new GhostCursor(page, cdpSession, options)

    if (options.visible === true) {
      // Install mouse helper (visible mouse). Do not await the promise but return immediately.
      // In headless mode, the cursor won't be visible but it won't cause errors either.
      cursor.installMouseHelper().then(
        (_) => { },
        (err) => { log('Warning: installMouseHelper failed (this is normal in headless mode):', err) }
      )
    }

    // Start random mouse movements. Do not await the promise but return immediately
    if (options.performRandomMoves === true) {
      cursor.randomMove().then(
        (_) => { },
        (_) => { }
      )
    }

    return cursor
  }

  /**
   * Install mouse helper (visible cursor with real cursor shapes).
   */
  public async installMouseHelper (): Promise<void> {
    try {
      await installMouseHelper(this.page).then(
        ({ removeMouseHelper }) => {
          this.removeMouseHelperFn = removeMouseHelper
        })
    } catch (error) {
      log('Warning: installMouseHelper failed:', error)
    }
  }

  /**
   * Make the cursor no longer visible.
   * Only has an effect if `visible=true` was passed, or this.installMouseHelper performed manually.
   */
  public async removeMouseHelper (): Promise<void> {
    await this.removeMouseHelperFn?.()
    this.removeMouseHelperFn = undefined
  }

  /** Move the mouse to a point, getting the vectors via `path(previous, newLocation, options)`  */
  private async moveMouse (
    newLocation: BoundingBox | Vector,
    options?: PathOptions,
    abortOnMove: boolean = false
  ): Promise<void> {
    await this.ensureCDPSession()
    // Pre-flight connection check
    if (!this.isConnected()) return

    const vectors = path(this.location, newLocation, options)

    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i]
      try {
        // In case this is called from random mouse movements and the users wants to move the mouse, abort
        if (abortOnMove && this.moving) {
          return
        }

        const dispatchParams: Record<string, any> = {
          type: 'mouseMoved',
          x: v.x,
          y: v.y
        }

        if ('timestamp' in v) dispatchParams.timestamp = (v).timestamp

        await this.cdpSession.send('Input.dispatchMouseEvent', dispatchParams as any)

        this.location = v

        // Introduce pacing delay so mouse movement is visible and realistic
        if (i > 0) {
          const prev = vectors[i - 1]
          if ('timestamp' in v && 'timestamp' in prev) {
            const timeDiff = (v).timestamp - (prev).timestamp
            if (timeDiff > 0) {
              await delay(timeDiff)
            }
          } else {
            await delay(6) // default smooth pacing delay (6ms)
          }
        }
      } catch (error) {
        // Exit function if the browser is no longer connected
        if (!this.isConnected()) return

        log('Warning: could not move mouse, error message:', error)
      }
    }
  }

  /** Start random mouse movements. Function recursively calls itself. Works in both headless and headed modes. */
  private async randomMove (options?: RandomMoveOptions): Promise<void> {
    const optionsResolved = {
      moveDelay: 2000,
      randomizeMoveDelay: true,
      ...this.defaultOptions?.randomMove,
      ...options
    } satisfies RandomMoveOptions

    try {
      // Stop if browser is disconnected
      if (!this.isConnected()) {
        log('Browser disconnected, stopping random mouse movements')
        return
      }

      if (!this.moving) {
        const rand = await getRandomPagePoint(this.page)
        await this.moveMouse(rand, optionsResolved, true)
      }
      await delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))
      this.randomMove(options).then(
        (_) => { },
        (_) => { }
      ) // fire and forget, recursive function
    } catch (_) {
      log('Warning: stopping random mouse movements')
    }
  }

  private async mouseButtonAction (
    action: 'mousePressed' | 'mouseReleased',
    options?: MouseButtonOptions
  ): Promise<void> {
    await this.ensureCDPSession()
    if (!this.isConnected()) return

    const optionsResolved = {
      button: 'left' as const,
      clickCount: 1,
      ...this.defaultOptions?.click,
      ...options
    } satisfies MouseButtonOptions

    try {
      await this.cdpSession.send('Input.dispatchMouseEvent', {
        x: this.location.x,
        y: this.location.y,
        button: optionsResolved.button,
        clickCount: optionsResolved.clickCount,
        type: action
      })
    } catch (error) {
      if (!this.isConnected()) return
      log('Warning: could not dispatch mouse button event:', error)
    }
  }

  /** Mouse button down */
  public async mouseDown (options?: MouseButtonOptions): Promise<void> {
    await this.mouseButtonAction('mousePressed', options)
  }

  /** Mouse button up (release) */
  public async mouseUp (options?: MouseButtonOptions): Promise<void> {
    await this.mouseButtonAction('mouseReleased', options)
  }

  /** Toggles random mouse movements on or off. */
  public toggleRandomMove (random: boolean): void {
    this.moving = !random
  }

  /** Get current location of the cursor. */
  public getLocation (): Vector {
    return this.location
  }

  /**
   * Simulates a mouse click at the specified selector or element.
   * Default is to click at current location, don't move.
   */
  public async click (
    selector?: string | ElementHandle,
    /** @default defaultOptions.click */
    options?: ClickOptions
  ): Promise<void> {
    const optionsResolved = {
      moveDelay: 2000,
      hesitate: 0,
      waitForClick: 0,
      randomizeMoveDelay: true,
      button: 'left' as const,
      clickCount: 1,
      ...this.defaultOptions?.click,
      ...options
    } satisfies ClickOptions

    const wasRandom = !this.moving
    this.toggleRandomMove(false)

    if (selector !== undefined) {
      await this.move(selector, {
        ...optionsResolved,
        // apply moveDelay after click, but not after actual move
        moveDelay: 0
      })
    }

    try {
      await delay(optionsResolved.hesitate)

      await this.mouseDown()
      await delay(optionsResolved.waitForClick)
      await this.mouseUp()
    } catch (error) {
      log('Warning: could not click mouse, error message:', error)
    }

    await delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))

    this.toggleRandomMove(wasRandom)
  }

  /** Moves the mouse to the specified selector or element. */
  public async move (
    selector: string | ElementHandle,
    /** @default defaultOptions.move */
    options?: MoveOptions
  ): Promise<void> {
    const optionsResolved = {
      moveDelay: 0,
      maxTries: 10,
      overshootThreshold: 500,
      randomizeMoveDelay: true,
      ...this.defaultOptions?.move,
      ...options
    } satisfies MoveOptions

    const wasRandom = !this.moving
    this.toggleRandomMove(false)

    const go = async (iteration: number): Promise<void> => {
      if (iteration > (optionsResolved.maxTries)) {
        throw Error('Could not mouse-over element within enough tries')
      }

      // Abort if browser disconnected or page navigated
      if (!this.isConnected()) return

      const elem = await this.getElement(selector, optionsResolved)

      // Make sure the object is in view
      try {
        await this.scrollIntoView(elem, optionsResolved)
      } catch (scrollErr) {
        log('Warning: scrollIntoView failed during move, continuing:', scrollErr)
      }

      let box: BoundingBox
      try {
        box = await getElementBox(this.page, elem)
      } catch (boxErr) {
        // Element context may be lost if page navigated
        if (!this.isConnected()) return
        log('Warning: getElementBox failed during move:', boxErr)
        return
      }

      const destination = (optionsResolved.destination !== undefined)
        ? add(box, optionsResolved.destination)
        : getRandomBoxPoint(box, optionsResolved)
      if (shouldOvershoot(
        this.location,
        destination,
        optionsResolved.overshootThreshold
      )) {
        // overshoot
        await this.moveMouse(overshoot(destination, GhostCursor.OVERSHOOT_RADIUS), optionsResolved)

        // then go to the box
        await this.moveMouse({ ...box, ...destination }, {
          ...optionsResolved,
          spreadOverride: GhostCursor.OVERSHOOT_SPREAD
        })
      } else {
        // go directly to the box, no overshoot
        await this.moveMouse(destination, optionsResolved)
      }

      try {
        const newBoundingBox = await getElementBox(this.page, elem)

        // It's possible that the element that is being moved towards
        // has moved to a different location by the time
        // the the time the mouseover animation finishes
        if (!intersectsElement(this.location, newBoundingBox)) {
          return await go(iteration + 1)
        }
      } catch {
        // Element may be detached after navigation — that's OK
        if (!this.isConnected()) return
        log('Warning: element may have been detached during move')
      }
    }
    await go(0)

    this.toggleRandomMove(wasRandom)

    await delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))
  }

  /** Moves the mouse to the specified destination point. */
  public async moveTo (
    destination: Vector,
    /** @default defaultOptions.moveTo */
    options?: MoveToOptions
  ): Promise<void> {
    const optionsResolved = {
      moveDelay: 0,
      randomizeMoveDelay: true,
      ...this.defaultOptions?.moveTo,
      ...options
    } satisfies MoveToOptions

    const wasRandom = !this.moving
    this.toggleRandomMove(false)
    await this.moveMouse(destination, optionsResolved)
    this.toggleRandomMove(wasRandom)

    await delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))
  }

  /** Moves the mouse by a specified amount */
  public async moveBy (delta: Partial<Vector>, options?: MoveToOptions): Promise<void> {
    await this.moveTo(add(this.location, { x: 0, y: 0, ...delta }), options)
  }

  /** Scrolls the element into view. If already in view, no scroll occurs. */
  public async scrollIntoView (
    selector: string | ElementHandle,
    /** @default defaultOptions.scroll */
    options?: ScrollIntoViewOptions
  ): Promise<void> {
    const optionsResolved = {
      scrollDelay: 200,
      scrollSpeed: 100,
      inViewportMargin: 0,
      ...this.defaultOptions?.scroll,
      ...options
    } satisfies ScrollIntoViewOptions

    const scrollSpeed = clamp(optionsResolved.scrollSpeed, 1, 100)

    const elem = await this.getElement(selector, optionsResolved)

    const {
      viewportWidth,
      viewportHeight,
      docHeight,
      docWidth,
      scrollPositionTop,
      scrollPositionLeft
    } = await this.page.evaluate(() => {
      const de = document.documentElement
      const body = document.body
      return {
        viewportWidth: window.innerWidth !== 0 ? window.innerWidth : (de.clientWidth !== 0 ? de.clientWidth : 1920),
        viewportHeight: window.innerHeight !== 0 ? window.innerHeight : (de.clientHeight !== 0 ? de.clientHeight : 1080),
        docHeight: Math.max(de.scrollHeight, body !== null ? body.scrollHeight : 0, de.clientHeight),
        docWidth: Math.max(de.scrollWidth, body !== null ? body.scrollWidth : 0, de.clientWidth),
        scrollPositionTop: window.scrollY,
        scrollPositionLeft: window.scrollX
      }
    })

    const elemBoundingBox = await getElementBox(this.page, elem) // is relative to viewport
    const elemBox = {
      top: elemBoundingBox.y,
      left: elemBoundingBox.x,
      bottom: elemBoundingBox.y + elemBoundingBox.height,
      right: elemBoundingBox.x + elemBoundingBox.width
    }

    // Add margin around the element
    const marginedBox = {
      top: elemBox.top - optionsResolved.inViewportMargin,
      left: elemBox.left - optionsResolved.inViewportMargin,
      bottom: elemBox.bottom + optionsResolved.inViewportMargin,
      right: elemBox.right + optionsResolved.inViewportMargin
    }

    // Get position relative to the whole document
    const marginedBoxRelativeToDoc = {
      top: marginedBox.top + scrollPositionTop,
      left: marginedBox.left + scrollPositionLeft,
      bottom: marginedBox.bottom + scrollPositionTop,
      right: marginedBox.right + scrollPositionLeft
    }

    // Convert back to being relative to the viewport
    const targetBox = {
      top: Math.max(marginedBoxRelativeToDoc.top, 0) - scrollPositionTop,
      left: Math.max(marginedBoxRelativeToDoc.left, 0) - scrollPositionLeft,
      bottom: Math.min(marginedBoxRelativeToDoc.bottom, docHeight) - scrollPositionTop,
      right: Math.min(marginedBoxRelativeToDoc.right, docWidth) - scrollPositionLeft
    }

    const { top, left, bottom, right } = targetBox

    const isInViewport = top >= 0 &&
      left >= 0 &&
      bottom <= viewportHeight &&
      right <= viewportWidth

    if (isInViewport) return

    const manuallyScroll = async (): Promise<void> => {
      let deltaY: number = 0
      let deltaX: number = 0

      if (top < 0) {
        deltaY = top // Scroll up
      } else if (bottom > viewportHeight) {
        deltaY = bottom - viewportHeight // Scroll down
      }

      if (left < 0) {
        deltaX = left // Scroll left
      } else if (right > viewportWidth) {
        deltaX = right - viewportWidth// Scroll right
      }

      await this.scroll({ x: deltaX, y: deltaY }, optionsResolved)
    }

    try {
      if (scrollSpeed === 100 && optionsResolved.inViewportMargin <= 0) {
        try {
          await elem.scrollIntoViewIfNeeded()
        } catch {
          try {
            await manuallyScroll()
          } catch {
            // Final fallback for headless edge cases
            await elem.evaluate((e: Element) => e.scrollIntoView({ block: 'center' }))
          }
        }
      } else {
        try {
          await manuallyScroll()
        } catch {
          await elem.evaluate((e: Element) => e.scrollIntoView({ block: 'center' }))
        }
      }
    } catch (e) {
      // use regular JS scroll method as a final fallback
      log('All scroll methods failed, using basic JS scroll', e)
      try {
        await elem.evaluate((e: Element) => e.scrollIntoView({
          block: 'center',
          behavior: scrollSpeed < 90 ? 'smooth' : undefined
        }))
      } catch (scrollErr) {
        log('Warning: could not scroll element into view:', scrollErr)
      }
    }
  }

  /** Scrolls the page the distance set by `delta`. Works in both headless and headed modes. */
  public async scroll (
    delta: Partial<Vector>,
    /** @default defaultOptions.scroll */
    options?: ScrollOptions
  ): Promise<void> {
    await this.ensureCDPSession()
    if (!this.isConnected()) return

    const optionsResolved = {
      scrollDelay: 200,
      scrollSpeed: 100,
      ...this.defaultOptions?.scroll,
      ...options
    } satisfies ScrollOptions

    const scrollSpeed = clamp(optionsResolved.scrollSpeed, 1, 100)

    let deltaX = delta.x ?? 0
    let deltaY = delta.y ?? 0

    // Nothing to scroll
    if (deltaX === 0 && deltaY === 0) return

    const xDirection = deltaX < 0 ? -1 : 1
    const yDirection = deltaY < 0 ? -1 : 1

    deltaX = Math.abs(deltaX)
    deltaY = Math.abs(deltaY)

    const largerDistanceDir = deltaX > deltaY ? 'x' : 'y'
    const [largerDistance, shorterDistance] = largerDistanceDir === 'x' ? [deltaX, deltaY] : [deltaY, deltaX]

    const EXP_SCALE_START = 90
    const largerDistanceScrollStep = scrollSpeed < EXP_SCALE_START
      ? scrollSpeed
      : scale(scrollSpeed, [EXP_SCALE_START, 100], [EXP_SCALE_START, largerDistance])

    const numSteps = Math.max(1, Math.floor(largerDistance / largerDistanceScrollStep))
    const largerDistanceRemainder = largerDistance % largerDistanceScrollStep
    const shorterDistanceScrollStep = Math.floor(shorterDistance / numSteps)
    const shorterDistanceRemainder = shorterDistance % numSteps

    for (let i = 0; i < numSteps; i++) {
      if (!this.isConnected()) return

      let longerDistanceDelta = largerDistanceScrollStep
      let shorterDistanceDelta = shorterDistanceScrollStep
      if (i === numSteps - 1) {
        longerDistanceDelta += largerDistanceRemainder
        shorterDistanceDelta += shorterDistanceRemainder
      }
      let [stepDeltaX, stepDeltaY] = largerDistanceDir === 'x'
        ? [longerDistanceDelta, shorterDistanceDelta]
        : [shorterDistanceDelta, longerDistanceDelta]
      stepDeltaX = stepDeltaX * xDirection
      stepDeltaY = stepDeltaY * yDirection

      try {
        await this.cdpSession.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          deltaX: stepDeltaX,
          deltaY: stepDeltaY,
          x: this.location.x,
          y: this.location.y
        })
        if (scrollSpeed < 100) {
          await delay(Math.floor(Math.random() * 11) + 5)
        }
      } catch (error) {
        if (!this.isConnected()) return
        log('Warning: scroll event dispatch failed:', error)
      }
    }

    await delay(optionsResolved.scrollDelay)
  }

  /** Scrolls to the specified destination point. */
  public async scrollTo (
    destination: ScrollToDestination,
    /** @default defaultOptions.scroll */
    options?: ScrollOptions
  ): Promise<void> {
    const optionsResolved = {
      scrollDelay: 200,
      scrollSpeed: 100,
      ...this.defaultOptions?.scroll,
      ...options
    } satisfies ScrollOptions

    const {
      docHeight,
      docWidth,
      scrollPositionTop,
      scrollPositionLeft
    } = await this.page.evaluate(() => {
      const body = document.body !== null ? document.body : document.documentElement
      return {
        docHeight: (body.scrollHeight !== 0) ? body.scrollHeight : ((window.innerHeight !== 0) ? window.innerHeight : 1080),
        docWidth: (body.scrollWidth !== 0) ? body.scrollWidth : ((window.innerWidth !== 0) ? window.innerWidth : 1920),
        scrollPositionTop: window.scrollY,
        scrollPositionLeft: window.scrollX
      }
    })

    const to = ((): Partial<Vector> => {
      switch (destination) {
        case 'top':
          return { y: 0 }
        case 'bottom':
          return { y: docHeight }
        case 'left':
          return { x: 0 }
        case 'right':
          return { x: docWidth }
        default:
          return destination
      }
    })()

    await this.scroll({
      y: to.y !== undefined ? to.y - scrollPositionTop : 0,
      x: to.x !== undefined ? to.x - scrollPositionLeft : 0
    }, optionsResolved)
  }

  /** Gets the element via a selector. Can use an XPath. */
  public async getElement (
    selector: string | ElementHandle,
    /** @default defaultOptions.getElement */
    options?: GetElementOptions
  ): Promise<ElementHandle<Element>> {
    const optionsResolved = {
      ...this.defaultOptions?.getElement,
      ...options
    } satisfies GetElementOptions

    let elem: ElementHandle<Element> | null = null
    if (typeof selector === 'string') {
      if (selector.startsWith('//') || selector.startsWith('(//')) {
        // XPath in Playwright uses 'xpath=' prefix
        const xpathSelector = `xpath=${selector}`
        if (optionsResolved.waitForSelector !== undefined) {
          await this.page.waitForSelector(xpathSelector, { timeout: optionsResolved.waitForSelector })
        }
        elem = await this.page.$(xpathSelector) as ElementHandle<Element> | null
      } else {
        if (optionsResolved.waitForSelector !== undefined) {
          await this.page.waitForSelector(selector, { timeout: optionsResolved.waitForSelector })
        }
        elem = await this.page.$(selector) as ElementHandle<Element> | null
      }
      if (elem === null) {
        throw new Error(
          `Could not find element with selector "${selector}", make sure you're waiting for the elements by specifying "waitForSelector"`
        )
      }
    } else {
      // ElementHandle
      elem = selector as ElementHandle<Element>
    }
    return elem
  }

  /**
   * Simulates typing text into the specified selector or element, mimicking a human.
   * It will first move to and click the element to focus it, then type character by character.
   */
  public async type (
    selector: string | ElementHandle,
    text: string,
    options?: TypeOptions
  ): Promise<void> {
    const optionsResolved = {
      delay: 100,
      randomizeDelay: true,
      typoRatio: 0.05,
      ...this.defaultOptions?.type,
      ...options
    } satisfies TypeOptions

    // Focus the target element by clicking it first, imitating a human click
    await this.click(selector)

    for (const char of text) {
      if (!this.isConnected()) return

      // Simulate a typo
      if (optionsResolved.typoRatio > 0 && Math.random() < optionsResolved.typoRatio) {
        const typoChar = getRandomTypoChar(char)
        try {
          await this.page.keyboard.type(typoChar)
        } catch (err) {
          log('Warning: could not type typo character:', err)
        }

        // Delay to simulate the "oops" moment realizing the mistake
        const mistakeDelay = optionsResolved.delay * (optionsResolved.randomizeDelay ? (Math.random() * 0.5 + 1.5) : 2)
        await delay(mistakeDelay)

        try {
          await this.page.keyboard.press('Backspace')
        } catch (err) {
          log('Warning: could not press Backspace:', err)
        }

        // Delay after correcting
        const correctionDelay = optionsResolved.delay * (optionsResolved.randomizeDelay ? (Math.random() * 0.4 + 0.6) : 1)
        await delay(correctionDelay)
      }

      try {
        await this.page.keyboard.type(char)
      } catch (err) {
        log('Warning: could not type character:', err)
      }

      // Delay between key presses
      const keyDelay = optionsResolved.delay * (optionsResolved.randomizeDelay ? (Math.random() * 0.8 + 0.6) : 1)
      await delay(keyDelay)
    }
  }
}

/**
 * @deprecated
 * Prefer to use `GhostCursor.create()` instead.
 */
export const createCursor = async (
  page: Page,
  /**
   * Cursor start position.
   * @default { x: 0, y: 0 }
   */
  start: Vector = origin,
  /**
   * Initially perform random movements.
   * If `move`,`click`, etc. is performed, these random movements end.
   * @default false
   */
  performRandomMoves: boolean = false,
  /**
   * Default options for cursor functions.
   */
  defaultOptions: DefaultOptions = {},
  /**
   * Whether cursor should be made visible using `installMouseHelper`.
   * @default false
   */
  visible: boolean = false
): Promise<GhostCursor> => await GhostCursor.create(page, { start, performRandomMoves, defaultOptions, visible })
