# Ghost Cursor Patchright

<img src="https://media2.giphy.com/media/26ufp2LYURTvL5PRS/giphy.gif" width="100" align="right">

[![NPM Version](https://img.shields.io/npm/v/ghost-cursor-patchright.svg)](https://www.npmjs.com/package/ghost-cursor-patchright)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Generate realistic, human-like mouse movement data between coordinates or navigate between elements with **Patchright**. It helps bypass bot detection systems by simulating organic human behavior (mouse movements, mechanical scrolling, and keyboard typing).

---

## 🌟 Key Features

### 🖱️ 1. Human-Like Mouse Movements (Bezier Curves & Fitts's Law)
*   **Organic Path Generation:** Instead of straight-line trajectories or artificial noise, it uses cubic Bezier curves to calculate natural curved paths between coordinates.
*   **Physiological Micro-Tremor (Sub-Pixel Noise):** Injects 8–12 Hz biometric oscillations into movements to defeat ML polynomial curve bot classifiers.
*   **Minimum Jerk Velocity Model:** Mimics human arm neurobiology (Flash & Hogan model) with smooth acceleration and fine deceleration near targets.
*   **Fitts's Law Integration:** Dynamically scales speed based on the target element's size and distance.
*   **Smart Overshooting & Re-adjustment:** For distant movements, the cursor can overshoot or slightly miss the target element, followed by a minor correction movement.
*   **Drag & Drop / Slider Support:** Purpose-built `dragAndDrop` method for slider captchas (GeeTest, Cloudflare) with realistic friction.
*   **Idle Simulation:** Wanders and drifts naturally during agent thought cycles using `cursor.idle()`.

### ⌨️ 2. Natural Keyboard Input Emulation
*   **QWERTY Layout Typo Emulation:** Key strokes are typed character-by-character. Based on the QWERTY layout proximity map, the cursor will occasionally type neighboring keys.
*   **Self-Correction (Backspace):** When a typo occurs, the typing pauses briefly ("oops" moment), deletes the mistake, and proceeds.
*   **Cognitive Dwell-Time Distribution:** Simulates variable key-down hold times (40ms–120ms) using Gaussian distribution rather than instantaneous press/release.
*   **Multi-Clicking Patterns:** Dedicated `doubleClick` and `tripleClick` with natural inter-click human latencies.

### 🔄 3. Resilient Browser Integration
*   **CDP Session Auto-Recovery:** Automatically monitors, re-establishes, and re-attaches the Chrome DevTools Protocol (CDP) session during frame or page transitions, avoiding typical "detached session" crashes.
*   **Mechanical Wheel Scrolling:** Simulates organic wheel scrolling by applying randomized `5ms` to `15ms` delay steps between mouse-wheel ticks rather than executing instant jumps.
*   **Universal Selectors:** Supports both standard CSS selectors and complex XPath expressions natively.

---

## 🚀 Installation

```sh
# using yarn
yarn add ghost-cursor-patchright

# using npm
npm install ghost-cursor-patchright
```

---

## 📖 Quick Start

### 1. Generating Movement Path Data
You can generate human-like coordinates on a 2D plane without launching a browser.

```js
import { path } from "ghost-cursor-patchright"

const from = { x: 100, y: 100 }
const to = { x: 600, y: 700 }

const route = path(from, to)
/**
 * Returns:
 * [
 *   { x: 100, y: 100 },
 *   { x: 108.75, y: 102.83 },
 *   ...
 * ]
 */
```

### 2. Browser Navigation and Interaction
Control your Patchright browser session with realistic movements.

```js
import { GhostCursor } from "ghost-cursor-patchright"
import { chromium } from "patchright"

const run = async (url) => {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()
  
  // Initialize the cursor with visual debugging helper enabled
  const cursor = await GhostCursor.create(page, { visible: true })
  
  await page.goto(url)
  
  // Moves mouse to element and clicks it
  await cursor.click("#sign-up-button")
  
  // Types text character-by-character with 10% typo ratio
  await cursor.type("#email-input", "user@example.com", { typoRatio: 0.1 })
}
```

---

## 🛠️ API Reference

### Creation Method

#### `GhostCursor.create(page: Page, options?: GhostCursorOptions)`
Creates the ghost cursor that wraps your Page session.

##### `GhostCursorOptions` Config
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `start` | `Vector` | `{ x: 0, y: 0 }` | Starting coordinate of the cursor. |
| `performRandomMoves` | `boolean` | `false` | Actively trigger random movements on idle. |
| `visible` | `boolean` | `false` | Renders a red dot on the browser representing the cursor. |
| `defaultOptions` | `DefaultOptions` | `{}` | Configure global default configurations for `click`, `move`, `type`, etc. |

---

### Core Instance Methods

#### `click(selector?: string | ElementHandle, options?: ClickOptions)`
Moves the mouse to the specified selector or element handle and clicks it.

##### `ClickOptions` (Extends `MoveOptions` & `ScrollIntoViewOptions`)
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `hesitate` | `number` | `0` | Delay before initiating the click in milliseconds. |
| `waitForClick` | `number` | `0` | Delay between mousedown and mouseup (click speed) in ms. |
| `moveDelay` | `number` | `2000` | Post-movement delay in ms before clicking. |
| `button` | `'left' \| 'right' \| 'middle'` | `'left'` | Mouse button to press. |
| `clickCount` | `number` | `1` | Number of times to click. |

#### `move(selector: string | ElementHandle, options?: MoveOptions)`
Smoothly moves the cursor to the target element.

##### `MoveOptions` (Extends `ScrollIntoViewOptions`)
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `paddingPercentage` | `number` | `0` | Percentage of inner padding to constrain target coordinates. `100` always targets the absolute center. |
| `destination` | `Vector` | `undefined` | Absolute coordinates override to bypass random calculation. |
| `moveDelay` | `number` | `0` | Delay after movement finishes in ms. |
| `randomizeMoveDelay` | `boolean` | `true` | Randomizes the `moveDelay` from `0` to the set value. |
| `moveSpeed` | `number` | `random` | Speed factor of the mouse movement. |
| `overshootThreshold` | `number` | `500` | Distance limit above which overshoot simulation triggers. |

#### `type(selector: string | ElementHandle, text: string, options?: TypeOptions)`
Clicks the element to focus and types the text.

##### `TypeOptions`
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `delay` | `number` | `80` | Average delay between keystrokes in ms. |
| `randomizeDelay` | `boolean` | `true` | Randomizes typing speed to simulate human rhythm. |
| `typoRatio` | `number` | `0.0` | Probability (from `0.0` to `1.0`) of making a QWERTY neighbor typo. |

#### `scrollIntoView(selector: string | ElementHandle, options?: ScrollIntoViewOptions)`
Scrolls the target element into the viewport smoothly if not already visible.

##### `ScrollIntoViewOptions`
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `scrollSpeed` | `number` | `100` | Scrolling speed (0 to 100). 100 performs instant scroll. |
| `scrollDelay` | `number` | `200` | Delay after scroll completes. |
| `inViewportMargin` | `number` | `0` | Extra padding margin in pixels when validating element visibility. |

#### `scroll(delta: Partial<Vector>, options?: ScrollOptions)`
Scrolls the viewport page by a specified `x` and `y` distance offset.

#### `scrollTo(destination: Partial<Vector> | 'top' | 'bottom' | 'left' | 'right' | ElementHandle, options?: ScrollOptions)`
Scrolls the viewport to the absolute target position, a viewport edge, or an element handle.

#### `dragAndDrop(source: string | ElementHandle | Vector, target: string | ElementHandle | Vector, options?: DragAndDropOptions)`
Smooth drag and drop from source to destination with biological acceleration, slider friction, and overshoot correction.

#### `doubleClick(selector?: string | ElementHandle, options?: ClickOptions)`
Human-like double-click with natural 100ms - 220ms inter-click latency.

#### `tripleClick(selector?: string | ElementHandle, options?: ClickOptions)`
Triple-click for selecting full paragraphs or entire code blocks.

#### `idle(options?: IdleOptions)`
Simulates human wandering and reading behavior during idle pauses.

#### `getFrameElementBox(frame: Frame, selector: string)`
Resolves seamless cross-origin coordinate translation for elements embedded inside iframes (e.g., Turnstile, reCAPTCHA).

#### `getLocation()`
Returns the current cursor coordinates (`{ x: number, y: number }`).

---

## 🪵 Debug Logging

Enable comprehensive debug logs by setting the environment variable:

```sh
# Bash/Terminal
DEBUG="ghost-cursor:*"

# Windows PowerShell
$env:DEBUG = "ghost-cursor:*"
```

---

## 📄 License
Released under the [ISC License](LICENSE).
