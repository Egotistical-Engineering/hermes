import { useCallback, useRef, useState } from 'react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

function createFocusExtension(modeRef) {
  const pluginKey = new PluginKey('focusMode');

  return Extension.create({
    name: 'focusMode',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: pluginKey,
          state: {
            init() {
              return DecorationSet.empty;
            },
            apply(tr, oldSet, _oldState, newState) {
              const mode = modeRef.current;
              if (mode === 'off') return DecorationSet.empty;

              const { selection } = newState;
              const cursorPos = selection.$head.pos;
              const decorations = [];

              newState.doc.forEach((node, offset) => {
                const nodeStart = offset;
                const nodeEnd = offset + node.nodeSize;

                if (cursorPos < nodeStart || cursorPos > nodeEnd) {
                  decorations.push(
                    Decoration.node(nodeStart, nodeEnd, {
                      class: 'focus-dimmed-block',
                    }),
                  );
                }
              });

              return DecorationSet.create(newState.doc, decorations);
            },
          },
          props: {
            decorations(state) {
              return pluginKey.getState(state);
            },
          },
        }),
      ];
    },
  });
}

const FOCUS_MODES = ['off', 'paragraph'];

export default function useFocusMode() {
  const [focusMode, setFocusMode] = useState('off');
  const modeRef = useRef('off');

  const [focusExtension] = useState(() => createFocusExtension(modeRef));

  const cycleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      const idx = FOCUS_MODES.indexOf(prev);
      const next = FOCUS_MODES[(idx + 1) % FOCUS_MODES.length];
      modeRef.current = next;
      return next;
    });
  }, []);

  // Force the plugin to re-evaluate decorations after mode change
  const syncFocusMode = useCallback((editor) => {
    if (!editor) return;
    // Dispatch a no-op transaction so the plugin recomputes decorations
    editor.view.dispatch(editor.state.tr);
  }, []);

  return {
    focusMode,
    cycleFocusMode,
    focusExtension,
    syncFocusMode,
  };
}
