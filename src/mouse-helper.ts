import type { Page } from 'patchright'

// ─── SVG Cursor Shapes (inline data URIs, no external dependencies) ───

const CURSOR_ARROW = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <path d="M2 2 L2 24 L8.5 17.5 L14 26 L18 24 L12.5 15.5 L22 15.5 Z" 
        fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`)}`

const CURSOR_HAND = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <g transform="translate(4, 0)">
    <path d="M9 4 C9 2.5 10.5 1.5 12 2 L12 2 C12.8 2.3 13 3 13 4 L13 10 L13 4 C13 2.5 14.5 1.5 16 2 L16 2 C16.8 2.3 17 3 17 4 L17 10 L17 6 C17 4.5 18.5 3.5 20 4 L20 4 C20.8 4.3 21 5 21 6 L21 14 C21 20 17 24 12 24 L10 24 C6 24 3 20.5 3 17 L3 14 C3 12 4 10.5 6 11 L6 11 C7 11.3 9 12 9 13 Z"
          fill="white" stroke="black" stroke-width="1.2" stroke-linejoin="round"/>
  </g>
</svg>`)}`

const CURSOR_TEXT = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <line x1="10" y1="5" x2="18" y2="5" stroke="black" stroke-width="2" stroke-linecap="round"/>
  <line x1="14" y1="5" x2="14" y2="23" stroke="black" stroke-width="2" stroke-linecap="round"/>
  <line x1="10" y1="23" x2="18" y2="23" stroke="black" stroke-width="2" stroke-linecap="round"/>
</svg>`)}`

/**
 * Install a mouse helper on a Patchright page.
 * Displays a realistic cursor shape (arrow, hand, text) that follows mouse events.
 * In headless mode, the cursor won't be visible but the function will not throw errors.
 */
export async function installMouseHelper (page: Page): Promise<{ removeMouseHelper: () => Promise<void> }> {
  // Pass cursor SVGs as arguments to avoid template literal issues inside addInitScript
  const cursorArrow = CURSOR_ARROW
  const cursorHand = CURSOR_HAND
  const cursorText = CURSOR_TEXT

  await page.addInitScript(
    ({ cursorArrow, cursorHand, cursorText }: { cursorArrow: string, cursorHand: string, cursorText: string }) => {
      // Skip if disabled (removal workaround)
      if ((window as any).__ghostCursorDisabled === true) return
      // Skip if already installed
      if ((window as any).__ghostCursorInstalled === true) return;
      (window as any).__ghostCursorInstalled = true

      const attachListener = (): void => {
        const box = document.createElement('p-mouse-pointer')
        const styleElement = document.createElement('style')
        styleElement.innerHTML = `
          p-mouse-pointer {
            pointer-events: none;
            position: fixed;
            top: 0;
            left: 0;
            z-index: 2147483647;
            width: 28px;
            height: 28px;
            background-image: url('${cursorArrow}');
            background-size: contain;
            background-repeat: no-repeat;
            margin: 0;
            padding: 0;
            transition: none;
            image-rendering: auto;
            filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.3));
            box-sizing: border-box;
          }
          p-mouse-pointer.cursor-pointer {
            background-image: url('${cursorHand}');
            margin: -4px 0 0 -4px;
          }
          p-mouse-pointer.cursor-text {
            background-image: url('${cursorText}');
            margin: 0 0 0 -14px;
          }
          p-mouse-pointer.clicking::after {
            content: '';
            position: absolute;
            top: 4px;
            left: 4px;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            border: 2px solid rgba(0, 120, 255, 0.6);
            transform: scale(0.5);
            animation: ghost-cursor-click-pulse 0.3s ease-out forwards;
          }
          @keyframes ghost-cursor-click-pulse {
            to {
              transform: scale(2.5);
              opacity: 0;
            }
          }
          p-mouse-pointer.p-mouse-pointer-hide {
            display: none;
          }
        `
        const head = document.head !== null ? document.head : document.documentElement
        head.appendChild(styleElement)
        const target = document.body !== null ? document.body : document.documentElement
        target.appendChild(box)

        /** Detect cursor type based on the hovered element */
        const detectCursorType = (target: EventTarget | null): string => {
          if (target == null || !(target instanceof HTMLElement)) return 'default'

          const el = target
          const tagName = el.tagName.toLowerCase()

          try {
            const computedStyle = window.getComputedStyle(el)
            const cssCursor = computedStyle.cursor

            // CSS cursor property takes priority
            if (cssCursor === 'pointer') return 'pointer'
            if (cssCursor === 'text') return 'text'
            if (cssCursor === 'grab' || cssCursor === 'grabbing') return 'pointer'
          } catch (_) { /* ignore */ }

          // Tag-based detection
          if (tagName === 'a' || tagName === 'button' || tagName === 'summary') return 'pointer'
          if (tagName === 'input' || tagName === 'textarea') return 'text'
          if (el.isContentEditable) return 'text'

          const role = el.getAttribute('role')
          if (role === 'button' || role === 'link' || role === 'tab' || role === 'menuitem') return 'pointer'

          // Check parent elements (links wrapping other elements)
          if (el.closest('a, button, [role="button"], [role="link"]') != null) return 'pointer'

          return 'default'
        }

        const onMouseMove = (event: MouseEvent): void => {
          box.style.left = `${event.clientX}px`
          box.style.top = `${event.clientY}px`
          box.classList.remove('p-mouse-pointer-hide')

          // Smart cursor type switching
          const cursorType = detectCursorType(event.target)
          box.classList.toggle('cursor-pointer', cursorType === 'pointer')
          box.classList.toggle('cursor-text', cursorType === 'text')
        }

        const onMouseDown = (event: MouseEvent): void => {
          box.classList.add('clicking')
          box.classList.remove('p-mouse-pointer-hide')
        }

        const onMouseUp = (event: MouseEvent): void => {
          setTimeout(() => { box.classList.remove('clicking') }, 300)
        }

        const onMouseLeave = (event: MouseEvent): void => {
          box.classList.add('p-mouse-pointer-hide')
        }

        const onMouseEnter = (event: MouseEvent): void => {
          box.classList.remove('p-mouse-pointer-hide')
        }

        document.addEventListener('mousemove', onMouseMove, true)
        document.addEventListener('mousedown', onMouseDown, true)
        document.addEventListener('mouseup', onMouseUp, true)
        document.addEventListener('mouseleave', onMouseLeave, true)
        document.addEventListener('mouseenter', onMouseEnter, true);

        // Cleanup function
        (window as any).removeMouseHelper = (): void => {
          box.remove()
          styleElement.remove()
          document.removeEventListener('mousemove', onMouseMove, true)
          document.removeEventListener('mousedown', onMouseDown, true)
          document.removeEventListener('mouseup', onMouseUp, true)
          document.removeEventListener('mouseleave', onMouseLeave, true)
          document.removeEventListener('mouseenter', onMouseEnter, true);
          (window as any).__ghostCursorInstalled = false
        }
      }

      // Run when DOM is ready
      if (document.readyState !== 'loading') {
        attachListener()
      } else {
        document.addEventListener('DOMContentLoaded', attachListener)
      }
    },
    { cursorArrow, cursorHand, cursorText }
  )

  // Also trigger immediately on the current page (addInitScript only runs on future navigations)
  await page.evaluate(
    ({ cursorArrow, cursorHand, cursorText }: { cursorArrow: string, cursorHand: string, cursorText: string }) => {
      if ((window as any).__ghostCursorDisabled === true) return
      if ((window as any).__ghostCursorInstalled === true) return;
      (window as any).__ghostCursorInstalled = true

      const box = document.createElement('p-mouse-pointer')
      const styleElement = document.createElement('style')
      styleElement.innerHTML = `
        p-mouse-pointer {
          pointer-events: none;
          position: fixed;
          top: 0;
          left: 0;
          z-index: 2147483647;
          width: 28px;
          height: 28px;
          background-image: url('${cursorArrow}');
          background-size: contain;
          background-repeat: no-repeat;
          margin: 0;
          padding: 0;
          transition: none;
          image-rendering: auto;
          filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.3));
          box-sizing: border-box;
        }
        p-mouse-pointer.cursor-pointer {
          background-image: url('${cursorHand}');
          margin: -4px 0 0 -4px;
        }
        p-mouse-pointer.cursor-text {
          background-image: url('${cursorText}');
          margin: 0 0 0 -14px;
        }
        p-mouse-pointer.clicking::after {
          content: '';
          position: absolute;
          top: 4px;
          left: 4px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid rgba(0, 120, 255, 0.6);
          transform: scale(0.5);
          animation: ghost-cursor-click-pulse 0.3s ease-out forwards;
        }
        @keyframes ghost-cursor-click-pulse {
          to {
            transform: scale(2.5);
            opacity: 0;
          }
        }
        p-mouse-pointer.p-mouse-pointer-hide {
          display: none;
        }
      `
      const head = document.head !== null ? document.head : document.documentElement
      head.appendChild(styleElement)
      const target = document.body !== null ? document.body : document.documentElement
      target.appendChild(box)

      const detectCursorType = (target: EventTarget | null): string => {
        if (target == null || !(target instanceof HTMLElement)) return 'default'
        const el = target
        const tagName = el.tagName.toLowerCase()
        try {
          const computedStyle = window.getComputedStyle(el)
          const cssCursor = computedStyle.cursor
          if (cssCursor === 'pointer') return 'pointer'
          if (cssCursor === 'text') return 'text'
          if (cssCursor === 'grab' || cssCursor === 'grabbing') return 'pointer'
        } catch (_) { /* ignore */ }
        if (tagName === 'a' || tagName === 'button' || tagName === 'summary') return 'pointer'
        if (tagName === 'input' || tagName === 'textarea') return 'text'
        if (el.isContentEditable) return 'text'
        const role = el.getAttribute('role')
        if (role === 'button' || role === 'link' || role === 'tab' || role === 'menuitem') return 'pointer'
        if (el.closest('a, button, [role="button"], [role="link"]') != null) return 'pointer'
        return 'default'
      }

      const onMouseMove = (event: MouseEvent): void => {
        box.style.left = `${event.clientX}px`
        box.style.top = `${event.clientY}px`
        box.classList.remove('p-mouse-pointer-hide')
        const cursorType = detectCursorType(event.target)
        box.classList.toggle('cursor-pointer', cursorType === 'pointer')
        box.classList.toggle('cursor-text', cursorType === 'text')
      }

      const onMouseDown = (): void => {
        box.classList.add('clicking')
        box.classList.remove('p-mouse-pointer-hide')
      }
      const onMouseUp = (): void => {
        setTimeout(() => { box.classList.remove('clicking') }, 300)
      }
      const onMouseLeave = (): void => {
        box.classList.add('p-mouse-pointer-hide')
      }
      const onMouseEnter = (): void => {
        box.classList.remove('p-mouse-pointer-hide')
      }

      document.addEventListener('mousemove', onMouseMove, true)
      document.addEventListener('mousedown', onMouseDown, true)
      document.addEventListener('mouseup', onMouseUp, true)
      document.addEventListener('mouseleave', onMouseLeave, true)
      document.addEventListener('mouseenter', onMouseEnter, true);

      (window as any).removeMouseHelper = (): void => {
        box.remove()
        styleElement.remove()
        document.removeEventListener('mousemove', onMouseMove, true)
        document.removeEventListener('mousedown', onMouseDown, true)
        document.removeEventListener('mouseup', onMouseUp, true)
        document.removeEventListener('mouseleave', onMouseLeave, true)
        document.removeEventListener('mouseenter', onMouseEnter, true);
        (window as any).__ghostCursorInstalled = false
      }
    },
    { cursorArrow, cursorHand, cursorText }
  )

  async function removeMouseHelper (): Promise<void> {
    try {
      // 1. Remove from current page
      await page.evaluate(() => {
        (window as any).removeMouseHelper?.()
      })
      // 2. Prevent re-creation on future navigations
      await page.evaluate(() => {
        (window as any).__ghostCursorDisabled = true
      })
    } catch {
      // Silently handle errors (page may be closed or navigated away)
    }
  }

  return { removeMouseHelper }
}
