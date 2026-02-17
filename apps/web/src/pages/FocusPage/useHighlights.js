import { useCallback, useRef, useState } from 'react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const HIGHLIGHT_CLASSES = {
  question: 'highlight-question',
  suggestion: 'highlight-suggestion',
  edit: 'highlight-edit',
  voice: 'highlight-voice',
  weakness: 'highlight-weakness',
  evidence: 'highlight-evidence',
  wordiness: 'highlight-wordiness',
  factcheck: 'highlight-factcheck',
};

/**
 * Maps a flat-text offset to a ProseMirror document position.
 * Walks doc.descendants() to build a mapping from text offsets to doc positions.
 */
export function flatOffsetToPos(doc, flatOffset) {
  let currentOffset = 0;

  const result = { found: false, pos: 0 };

  doc.descendants((node, pos) => {
    if (result.found) return false;

    if (node.isText) {
      const textLen = node.text.length;
      if (flatOffset >= currentOffset && flatOffset <= currentOffset + textLen) {
        result.pos = pos + (flatOffset - currentOffset);
        result.found = true;
        return false;
      }
      currentOffset += textLen;
    } else if (node.isBlock && pos > 0) {
      // Block nodes contribute a newline to the flat text
      currentOffset += 1;
    }

    return true; // continue
  });

  return result;
}

export function getDocFlatText(doc) {
  const parts = [];
  doc.descendants((node, pos) => {
    if (node.isText) {
      parts.push(node.text);
    } else if (node.isBlock && pos > 0) {
      parts.push('\n');
    }
  });
  return parts.join('');
}

function createHighlightExtension(highlightsRef, onHighlightClick) {
  const pluginKey = new PluginKey('highlights');

  return Extension.create({
    name: 'highlights',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: pluginKey,
          state: {
            init() {
              return DecorationSet.empty;
            },
            apply(tr, oldSet, _oldState, newState) {
              const highlights = highlightsRef.current;
              if (!highlights || highlights.length === 0) return DecorationSet.empty;

              const flatText = getDocFlatText(newState.doc);
              const decorations = [];

              for (const h of highlights) {
                if (h.dismissed) continue;

                const idx = flatText.indexOf(h.matchText);
                if (idx === -1) continue;

                const fromResult = flatOffsetToPos(newState.doc, idx);
                const toResult = flatOffsetToPos(newState.doc, idx + h.matchText.length);

                if (!fromResult.found || !toResult.found) continue;
                if (fromResult.pos >= toResult.pos) continue;

                decorations.push(
                  Decoration.inline(fromResult.pos, toResult.pos, {
                    class: HIGHLIGHT_CLASSES[h.type] || 'highlight-question',
                    'data-highlight-id': h.id,
                  }),
                );
              }

              return DecorationSet.create(newState.doc, decorations);
            },
          },
          props: {
            decorations(state) {
              return pluginKey.getState(state);
            },
            handleClick(view, pos, event) {
              const target = event.target;
              if (!target || !target.dataset?.highlightId) return false;

              const highlightId = target.dataset.highlightId;
              const highlight = highlightsRef.current?.find((h) => h.id === highlightId);
              if (!highlight) return false;

              // Get the bounding rect of the clicked element for popover positioning
              const rect = target.getBoundingClientRect();
              onHighlightClick?.(highlight, rect);
              return true;
            },
          },
        }),
      ];
    },
  });
}

export default function useHighlights() {
  const [highlights, setHighlights] = useState([]);
  const [activeHighlight, setActiveHighlight] = useState(null);
  const [popoverRect, setPopoverRect] = useState(null);
  const highlightsRef = useRef([]);

  const handleHighlightClick = useCallback((highlight, rect) => {
    setActiveHighlight(highlight);
    setPopoverRect(rect);
  }, []);

  // eslint-disable-next-line react-hooks/refs -- ref is captured in ProseMirror plugin closure, read only during apply(), not during React render
  const [highlightExtension] = useState(() =>
    createHighlightExtension(highlightsRef, handleHighlightClick),
  );

  const addHighlights = useCallback((newHighlights) => {
    setHighlights((prev) => {
      const updated = [...prev, ...newHighlights];
      highlightsRef.current = updated;
      return updated;
    });
  }, []);

  const dismissHighlight = useCallback((highlightId) => {
    setHighlights((prev) => {
      const updated = prev.map((h) =>
        h.id === highlightId ? { ...h, dismissed: true } : h,
      );
      highlightsRef.current = updated;
      return updated;
    });
    setActiveHighlight(null);
    setPopoverRect(null);
  }, []);

  const clearHighlight = useCallback(() => {
    setActiveHighlight(null);
    setPopoverRect(null);
  }, []);

  const replaceHighlights = useCallback((newHighlights) => {
    highlightsRef.current = newHighlights;
    setHighlights(newHighlights);
  }, []);

  const syncHighlights = useCallback((editor) => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr);
  }, []);

  return {
    highlights,
    activeHighlight,
    popoverRect,
    highlightExtension,
    addHighlights,
    dismissHighlight,
    clearHighlight,
    replaceHighlights,
    syncHighlights,
  };
}
