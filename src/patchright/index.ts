/**
 * Ghost Cursor for Patchright/Playwright
 *
 * Usage:
 *   import { GhostCursor, createCursor } from 'ghost-cursor/patchright'
 *
 *   const cursor = await GhostCursor.create(page, { visible: true })
 *   await cursor.click('#my-button')
 */
export {
  GhostCursor,
  createCursor,
  path,
  getRandomPagePoint,
  getElementBox
} from './spoof'

export { installMouseHelper } from './mouse-helper'

export type { Vector, TimedVector } from '../math'

export type {
  BoxOptions,
  ClickOptions,
  MoveOptions,
  MoveToOptions,
  PathOptions,
  ScrollOptions,
  ScrollIntoViewOptions,
  DefaultOptions,
  RandomMoveOptions,
  MouseButtonOptions,
  GhostCursorOptions,
  GetElementOptions,
  ScrollToDestination,
  TypeOptions
} from './spoof'
