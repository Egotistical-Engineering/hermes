import { useCallback, useRef, useState } from 'react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const LINK_PATTERN = /\[([^\]]*)\]\(([^)]*)\)/g;

function findLinkPatternAtCursor(state) {
  const { $head } = state.selection;
  const blockStart = $head.start();
  const blockText = $head.parent.textContent;
  const cursorInBlock = $head.pos - blockStart;

  let match;
  LINK_PATTERN.lastIndex = 0;
  while ((match = LINK_PATTERN.exec(blockText)) !== null) {
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    if (cursorInBlock >= matchStart && cursorInBlock <= matchEnd) {
      return {
        fullMatch: match[0],
        text: match[1],
        url: match[2],
        from: blockStart + matchStart,
        to: blockStart + matchEnd,
        // Position of the opening paren for URL
        parenOpen: blockStart + matchStart + match[1].length + 2,
        parenClose: blockStart + matchEnd - 1,
      };
    }
  }
  return null;
}

function findAllLinkPatterns(doc) {
  const results = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const text = node.textContent;
    const blockStart = pos + 1; // +1 to skip the node open token
    let match;
    LINK_PATTERN.lastIndex = 0;
    while ((match = LINK_PATTERN.exec(text)) !== null) {
      results.push({
        fullMatch: match[0],
        text: match[1],
        url: match[2],
        from: blockStart + match.index,
        to: blockStart + match.index + match[0].length,
      });
    }
  });
  return results;
}

function convertPatternToLink(tr, pattern, schema) {
  const { text, url, from, to } = pattern;
  const trimmedUrl = url.trim();

  if (trimmedUrl) {
    // Replace pattern text with just the display text, then add link mark
    tr.insertText(text, from, to);
    const linkMark = schema.marks.link.create({ href: trimmedUrl });
    tr.addMark(from, from + text.length, linkMark);
  } else {
    // Empty URL — just leave the plain text
    tr.insertText(text, from, to);
  }
  tr.setMeta('preventAutolink', true);
}

/**
 * Expand a rendered link mark back to [text](url) raw pattern for editing.
 * Finds the full contiguous range of text nodes sharing the same link mark,
 * then replaces with the raw markdown pattern.
 */
function expandLinkToPattern(view, pos, linkZoneRef) {
  const { state } = view;
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  const parentStart = $pos.start();

  // Find the link mark at cursor position
  const linkMark = state.doc.resolve(pos).marks().find((m) => m.type.name === 'link');
  if (!linkMark) return false;

  const href = linkMark.attrs.href;

  // Walk the parent's children to find the contiguous range with this link mark
  let from = null;
  let to = null;
  let offset = parentStart;

  parent.forEach((child) => {
    const childFrom = offset;
    const childTo = offset + child.nodeSize;

    if (child.isText && child.marks.some((m) => m.type.name === 'link' && m.attrs.href === href)) {
      if (from === null) from = childFrom;
      to = childTo;
    } else {
      // Break in the link — reset if we haven't reached our position yet
      if (from !== null && to !== null && pos >= from && pos <= to) {
        // We already found the range containing our position
      } else if (from !== null) {
        // Reset — this was a different link segment
        from = null;
        to = null;
      }
    }

    offset = childTo;
  });

  if (from === null || to === null) return false;

  // Verify the cursor is actually within this range
  if (pos < from || pos > to) return false;

  const linkText = state.doc.textBetween(from, to);
  const insertStr = `[${linkText}](${href})`;

  const tr = state.tr;
  // Remove link marks from the range first, then replace with raw text
  tr.insertText(insertStr, from, to);
  // The insertText removes existing marks. We need to ensure no link mark remains.
  tr.removeMark(from, from + insertStr.length, state.schema.marks.link);
  tr.setMeta('preventAutolink', true);

  // Position cursor at end of URL (before closing paren)
  const cursorPos = from + linkText.length + 2 + href.length; // [ + text + ]( + href
  tr.setSelection(TextSelection.create(tr.doc, cursorPos));

  view.dispatch(tr);
  linkZoneRef.current = true;

  return true;
}

function createInlineLinkExtension(linkZoneRef, onLinkHover, onLinkExpand, onLinkZoneExit) {
  const pluginKey = new PluginKey('inlineLink');

  return Extension.create({
    name: 'inlineLink',

    addKeyboardShortcuts() {
      return {
        'Mod-k': ({ editor: ed }) => {
          // If we're already editing an expanded link, cancel (same as Escape)
          if (linkZoneRef.current) {
            const pattern = findLinkPatternAtCursor(ed.state);
            if (pattern) {
              const { tr } = ed.state;
              tr.insertText(pattern.text, pattern.from, pattern.to);
              tr.setMeta('preventAutolink', true);
              const newCursorPos = pattern.from + pattern.text.length;
              tr.setSelection(TextSelection.create(tr.doc, newCursorPos));
              ed.view.dispatch(tr);
              linkZoneRef.current = false;
              onLinkZoneExit();
              return true;
            }
            // No pattern but zone active — just deactivate
            linkZoneRef.current = false;
            onLinkZoneExit();
            return true;
          }

          // If cursor is on an existing rendered link, toggle it off
          if (ed.isActive('link')) {
            ed.chain().focus().unsetLink().run();
            return true;
          }

          const { state } = ed;
          const { from, to, empty } = state.selection;

          const selectedText = empty ? '' : state.doc.textBetween(from, to);
          const insertStr = `[${selectedText}]()`;

          // Calculate cursor position: between the parens
          // [text]( | ) — cursor goes right after the opening paren
          const cursorPos = from + selectedText.length + 3; // [ + text + ] + ( = length + 3

          const tr = state.tr;
          tr.insertText(insertStr, from, to);
          tr.setSelection(TextSelection.create(tr.doc, cursorPos));
          tr.setMeta('preventAutolink', true);
          ed.view.dispatch(tr);

          linkZoneRef.current = true;
          return true;
        },

        Enter: ({ editor: ed }) => {
          if (!linkZoneRef.current) return false;

          const pattern = findLinkPatternAtCursor(ed.state);
          if (!pattern) return false;

          const { tr } = ed.state;
          convertPatternToLink(tr, pattern, ed.state.schema);

          // Place cursor at end of the converted text
          const newCursorPos = pattern.from + pattern.text.length;
          tr.setSelection(TextSelection.create(tr.doc, newCursorPos));
          ed.view.dispatch(tr);

          linkZoneRef.current = false;
          onLinkZoneExit();
          return true;
        },

        Escape: ({ editor: ed }) => {
          if (!linkZoneRef.current) return false;

          const pattern = findLinkPatternAtCursor(ed.state);
          if (!pattern) {
            // No pattern found but zone was active — just deactivate
            linkZoneRef.current = false;
            onLinkZoneExit();
            return true;
          }

          // Strip syntax, leave just the display text
          const { tr } = ed.state;
          tr.insertText(pattern.text, pattern.from, pattern.to);
          tr.setMeta('preventAutolink', true);

          const newCursorPos = pattern.from + pattern.text.length;
          tr.setSelection(TextSelection.create(tr.doc, newCursorPos));
          ed.view.dispatch(tr);

          linkZoneRef.current = false;
          onLinkZoneExit();
          return true;
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: pluginKey,

          appendTransaction(transactions, _oldState, newState) {
            if (!linkZoneRef.current) return null;

            // Don't interfere if the transaction was from our own conversion
            const hasPreventAutolink = transactions.some(
              (t) => t.getMeta('preventAutolink'),
            );
            if (hasPreventAutolink) return null;

            const patterns = findAllLinkPatterns(newState.doc);
            if (patterns.length === 0) {
              // No patterns exist anymore (user deleted them) — deactivate
              linkZoneRef.current = false;
              onLinkZoneExit();
              return null;
            }

            const cursorPos = newState.selection.$head.pos;
            const cursorInPattern = patterns.some(
              (p) => cursorPos >= p.from && cursorPos <= p.to,
            );

            if (cursorInPattern) return null;

            // Cursor left the pattern — convert all found patterns
            const tr = newState.tr;
            // Process in reverse order so positions stay valid
            const sorted = [...patterns].sort((a, b) => b.from - a.from);
            for (const pattern of sorted) {
              convertPatternToLink(tr, pattern, newState.schema);
            }

            linkZoneRef.current = false;
            onLinkZoneExit();
            return tr;
          },

          state: {
            init() {
              return DecorationSet.empty;
            },
            apply(tr, oldSet, _oldState, newState) {
              if (!linkZoneRef.current) return DecorationSet.empty;

              const patterns = findAllLinkPatterns(newState.doc);
              if (patterns.length === 0) return DecorationSet.empty;

              const cursorPos = newState.selection.$head.pos;
              const decorations = [];

              for (const p of patterns) {
                if (cursorPos >= p.from && cursorPos <= p.to) {
                  decorations.push(
                    Decoration.inline(p.from, p.to, {
                      class: 'inline-link-editing',
                    }),
                  );
                }
              }

              if (decorations.length === 0) return DecorationSet.empty;
              return DecorationSet.create(newState.doc, decorations);
            },
          },

          props: {
            decorations(state) {
              return pluginKey.getState(state);
            },

            handleClick(view, pos, event) {
              const target = event.target;
              if (target.nodeName !== 'A') return false;

              const href = target.getAttribute('href');
              if (!href) return false;

              // Cmd/Ctrl+click: open in new tab
              if (event.metaKey || event.ctrlKey) {
                window.open(href, '_blank', 'noopener,noreferrer');
                return true;
              }

              // Regular click: expand link to [text](url) for editing
              const linkRect = target.getBoundingClientRect();
              onLinkExpand({ rect: linkRect, href });
              expandLinkToPattern(view, pos, linkZoneRef);
              return true;
            },

            handleDOMEvents: {
              mouseover(view, event) {
                const target = event.target;
                if (target.nodeName !== 'A') return false;

                // Only trigger for links inside the editor
                if (!target.closest('.tiptap')) return false;

                const rect = target.getBoundingClientRect();
                const href = target.getAttribute('href') || '';
                onLinkHover({ rect, href });
                return false; // Don't prevent default
              },

              mouseout(view, event) {
                const target = event.target;
                if (target.nodeName !== 'A') return false;

                // Check relatedTarget — if moving to another part of the same link, ignore
                const related = event.relatedTarget;
                if (related && related.nodeName === 'A' && related === target) return false;

                onLinkHover(null);
                return false;
              },
            },
          },
        }),
      ];
    },
  });
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export default function useInlineLink() {
  const linkZoneRef = useRef(false);
  const [linkTooltip, setLinkTooltip] = useState(null);
  const hoverTimerRef = useRef(null);
  const hideTimerRef = useRef(null);

  const handleLinkHover = useCallback((info) => {
    if (info) {
      // Clear any pending hide
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      // Debounce show (200ms)
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = setTimeout(() => {
        setLinkTooltip((prev) => {
          // Don't overwrite editing mode with hover
          if (prev && prev.mode === 'editing') return prev;
          return { mode: 'hover', rect: info.rect, href: info.href };
        });
      }, 200);
    } else {
      // Clear any pending show
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      // Debounce hide (150ms)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setLinkTooltip((prev) => {
          // Don't clear editing tooltip on mouseout
          if (prev && prev.mode === 'editing') return prev;
          return null;
        });
      }, 150);
    }
  }, []);

  const handleLinkExpand = useCallback((info) => {
    // Clear hover timers
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setLinkTooltip({ mode: 'editing', rect: info.rect, href: info.href });
  }, []);

  const handleLinkZoneExit = useCallback(() => {
    setLinkTooltip(null);
  }, []);

  // linkZoneRef is captured by the ProseMirror plugin closure, not read during render
  // eslint-disable-next-line react-hooks/refs
  const [inlineLinkExtension] = useState(() =>
    createInlineLinkExtension(linkZoneRef, handleLinkHover, handleLinkExpand, handleLinkZoneExit),
  );

  return { inlineLinkExtension, linkTooltip, isMac };
}
