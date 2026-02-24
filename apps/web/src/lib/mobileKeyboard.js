/**
 * Mobile keyboard handler using Visual Viewport API.
 * Scrolls the active ProseMirror cursor into view when the virtual keyboard appears.
 */

let cleanup = null;

export function initMobileKeyboard() {
  if (cleanup) return; // Already initialized
  if (!window.visualViewport) return; // Not supported

  const onResize = () => {
    // When the visual viewport shrinks, the keyboard is likely showing
    const heightDiff = window.innerHeight - window.visualViewport.height;
    if (heightDiff > 100) {
      // Keyboard is visible — scroll cursor into view
      requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect || rect.height === 0) return;

        const viewportBottom = window.visualViewport.height + window.visualViewport.offsetTop;
        const cursorBottom = rect.bottom;

        // If cursor is below the visible area, scroll it up
        if (cursorBottom > viewportBottom - 40) {
          const scrollBy = cursorBottom - viewportBottom + 80;
          const scrollArea = document.querySelector('[class*="scrollArea"]');
          if (scrollArea) {
            scrollArea.scrollTop += scrollBy;
          }
        }
      });
    }
  };

  window.visualViewport.addEventListener('resize', onResize);

  cleanup = () => {
    window.visualViewport.removeEventListener('resize', onResize);
    cleanup = null;
  };

  return cleanup;
}

export function destroyMobileKeyboard() {
  if (cleanup) cleanup();
}
