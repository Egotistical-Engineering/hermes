import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Markdown } from '@tiptap/markdown';
import { Slice } from '@tiptap/pm/model';
import { IS_MOBILE } from '../../lib/platform';
import useFocusMode from './useFocusMode';
import useHighlights, { getDocFlatText, flatOffsetToPos } from './useHighlights';
import useInlineLink from './useInlineLink';
import LinkTooltip from './LinkTooltip';
import FocusChatWindow from './FocusChatWindow';
import HighlightPopover from './HighlightPopover';
import PageTabs, { EMPTY_PAGES } from './PageTabs';
import SettingsPanel from './SettingsPanel';
import styles from './FocusPage.module.css';

function looksLikeMarkdown(text) {
  return /(?:^|\n)(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|---|\*\*|__|\[.+\]\()/.test(text);
}

function getWordCount(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

const STORAGE_KEY = 'hermes-focus-pages';

export default function FocusPage() {
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsRef = useRef(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef(null);
  const [wordCount, setWordCount] = useState(0);
  const [postCopied, setPostCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('coral');
  const [pages, setPages] = useState({ ...EMPTY_PAGES });
  const [initialLoaded, setInitialLoaded] = useState(false);
  const saveTimerRef = useRef(null);
  const switchingRef = useRef(false);
  const pagesRef = useRef(pages);
  const activeTabRef = useRef(activeTab);

  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const {
    focusMode,
    cycleFocusMode,
    focusExtension,
    syncFocusMode,
  } = useFocusMode();

  const {
    highlights,
    activeHighlight,
    popoverRect,
    highlightExtension,
    addHighlights,
    dismissHighlight,
    clearHighlight,
    replaceHighlights,
    syncHighlights,
  } = useHighlights();

  const { inlineLinkExtension, linkTooltip, isMac } = useInlineLink();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Markdown,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
      }),
      inlineLinkExtension,
      focusExtension,
      highlightExtension,
    ],
    editorProps: {
      clipboardTextParser(text, $context, plainText) {
        if (plainText || !looksLikeMarkdown(text)) {
          return null;
        }
        const parsed = editor?.markdown?.parse(text);
        if (!parsed?.content) return null;
        try {
          const doc = editor.schema.nodeFromJSON(parsed);
          return new Slice(doc.content, 0, 0);
        } catch {
          return null;
        }
      },
    },
    content: '',
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      if (switchingRef.current) return;

      const text = ed.getText();
      setWordCount(getWordCount(text));

      const md = text.trim().length > 0 ? ed.getMarkdown() : '';
      const tab = activeTabRef.current;

      setPages((prev) => {
        const next = { ...prev, [tab]: md };
        pagesRef.current = next;
        return next;
      });

      // Debounced localStorage save (500ms)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(pagesRef.current));
        } catch {
          // localStorage full or unavailable
        }
      }, 500);
    },
  });

  // Sync decorations when focus mode changes
  useEffect(() => {
    syncFocusMode(editor);
  }, [editor, focusMode, syncFocusMode]);

  // Sync highlight decorations when highlights change
  useEffect(() => {
    syncHighlights(editor);
  }, [editor, highlights, syncHighlights]);

  // Init mobile keyboard handler for Tauri mobile
  useEffect(() => {
    if (!IS_MOBILE) return;
    let destroy;
    import('../../lib/mobileKeyboard.js').then(({ initMobileKeyboard }) => {
      destroy = initMobileKeyboard();
    });
    return () => { if (destroy) destroy(); };
  }, []);

  // Load content from localStorage
  useEffect(() => {
    if (!editor) return;
    if (initialLoaded) return;

    let loadedPages = null;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          loadedPages = { ...EMPTY_PAGES, ...parsed };
        }
      }
    } catch {
      // localStorage unavailable
    }

    // No localStorage found — seed with Welcome content
    if (!loadedPages) {
      import('@hermes/api').then(({ WELCOME_PAGES, WELCOME_HIGHLIGHTS }) => {
        const seeded = { ...EMPTY_PAGES, ...WELCOME_PAGES };
        setPages(seeded);
        pagesRef.current = seeded;
        editor.commands.setContent(seeded[activeTab] || '', { contentType: 'markdown' });
        setWordCount(getWordCount(editor.getText()));
        if (WELCOME_HIGHLIGHTS) replaceHighlights(WELCOME_HIGHLIGHTS);
        setInitialLoaded(true);
      });
      return;
    }

    setPages(loadedPages);
    pagesRef.current = loadedPages;
    editor.commands.setContent(loadedPages[activeTab] || '', { contentType: 'markdown' });
    setWordCount(getWordCount(editor.getText()));
    setInitialLoaded(true);
  }, [editor, initialLoaded, activeTab, replaceHighlights]);

  // Handle new highlights from chat
  const handleHighlights = useCallback((newHighlights) => {
    addHighlights(newHighlights);
  }, [addHighlights]);

  // Accept edit: replace matchText in editor with suggestedEdit
  const handleAcceptEdit = useCallback((highlight) => {
    if (!editor || !highlight.suggestedEdit) return;

    const flatText = getDocFlatText(editor.state.doc);
    const idx = flatText.indexOf(highlight.matchText);
    if (idx !== -1) {
      const from = flatOffsetToPos(editor.state.doc, idx);
      const to = flatOffsetToPos(editor.state.doc, idx + highlight.matchText.length);
      if (from.found && to.found) {
        editor.chain().focus().insertContentAt({ from: from.pos, to: to.pos }, highlight.suggestedEdit).run();
      }
    }

    dismissHighlight(highlight.id);
  }, [editor, dismissHighlight]);

  const handleDismissHighlight = useCallback((id) => {
    if (id) {
      dismissHighlight(id);
    } else {
      clearHighlight();
    }
  }, [dismissHighlight, clearHighlight]);

  // Reply from highlight: focus chat with context
  const handleReply = useCallback((highlight) => {
    const prefill = `Re: "${highlight.matchText.slice(0, 50)}${highlight.matchText.length > 50 ? '...' : ''}" — `;
    window.__hermesChatFocus?.(prefill);
    clearHighlight();
  }, [clearHighlight]);

  // Tab switching
  const handleTabChange = useCallback((newTab) => {
    if (!editor || newTab === activeTab) return;

    // Flush pending saves immediately
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pagesRef.current));
      } catch { /* */ }
    }

    // Save current content into pages
    const hasText = editor.getText().trim().length > 0;
    const currentMd = hasText ? editor.getMarkdown() : '';
    const updated = { ...pagesRef.current, [activeTab]: currentMd };
    setPages(updated);
    pagesRef.current = updated;

    // Switch tab
    switchingRef.current = true;
    setActiveTab(newTab);
    activeTabRef.current = newTab;
    editor.commands.setContent(updated[newTab] || '', { contentType: 'markdown' });
    switchingRef.current = false;

    setWordCount(getWordCount(editor.getText()));
    clearHighlight();
  }, [editor, activeTab, clearHighlight]);

  // Stable callback for child components to read pages on-demand
  const getPages = useCallback(() => pagesRef.current, []);

  // Close shortcuts popover on click outside
  useEffect(() => {
    if (!shortcutsOpen) return;
    function handleMouseDown(e) {
      if (shortcutsRef.current && !shortcutsRef.current.contains(e.target)) {
        setShortcutsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [shortcutsOpen]);

  // Close actions menu on outside click
  useEffect(() => {
    if (!actionsOpen) return;
    function handleMouseDown(e) {
      if (actionsRef.current && !actionsRef.current.contains(e.target)) {
        setActionsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [actionsOpen]);

  // Escape key closes actions menu
  useEffect(() => {
    if (!actionsOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setActionsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [actionsOpen]);

  const postCopiedTimerRef = useRef(null);
  useEffect(() => () => { if (postCopiedTimerRef.current) clearTimeout(postCopiedTimerRef.current); }, []);

  const handleCopyPost = useCallback(() => {
    if (!editor) return;
    const md = editor.getMarkdown();
    navigator.clipboard.writeText(md).then(() => {
      setPostCopied(true);
      postCopiedTimerRef.current = setTimeout(() => setPostCopied(false), 2000);
    });
    setActionsOpen(false);
  }, [editor]);

  const focusLabel = focusMode === 'off' ? 'Focus: Off' : 'Focus: On';

  const eyeIcon = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      {settingsVisible && <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" strokeWidth="1.5" />}
    </svg>
  );

  const focusIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" fill={focusMode !== 'off' ? 'currentColor' : 'none'} />
      <path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );

  const gearIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.9 2.9l1.1 1.1M12 12l1.1 1.1M2.9 13.1l1.1-1.1M12 4l1.1-1.1" />
    </svg>
  );

  return (
    <div className={styles.page}>
      {/* Floating toggle — only visible when bar is hidden */}
      {!settingsVisible && (
        <button
          className={styles.toggleFloat}
          onClick={() => setSettingsVisible(true)}
          aria-label="Show settings"
        >
          {eyeIcon}
        </button>
      )}

      {/* Settings bar */}
      <div className={styles.hoverZone}>
        <div
          className={`${styles.settingsBar} ${settingsVisible ? styles.settingsBarVisible : ''}`}
        >
          <span className={styles.brandLabel}>Hermes</span>

          <div className={styles.settingsRight}>
            <span className={styles.wordCount}>
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </span>
            <button
              className={`${styles.focusBtn} ${focusMode !== 'off' ? styles.focusBtnActive : ''}`}
              onClick={cycleFocusMode}
              title={focusLabel}
            >
              <span className={styles.focusLabel}>{focusLabel}</span>
              <span className={styles.focusIcon}>{focusIcon}</span>
            </button>
            {/* Shortcuts reference — desktop only */}
            <div className={styles.shortcutsWrap} ref={shortcutsRef}>
              <button
                className={styles.shortcutsBtn}
                onClick={() => setShortcutsOpen((v) => !v)}
                title="Shortcuts & formatting"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </button>
              {shortcutsOpen && (
                <div className={styles.shortcutsPopover}>
                  <div className={styles.shortcutsSection}>
                    <div className={styles.shortcutsSectionTitle}>Shortcuts</div>
                    <div className={styles.shortcutRow}><kbd>Cmd+K</kbd><span>Insert link</span></div>
                    <div className={styles.shortcutRow}><kbd>Cmd+B</kbd><span>Bold</span></div>
                    <div className={styles.shortcutRow}><kbd>Cmd+I</kbd><span>Italic</span></div>
                    <div className={styles.shortcutRow}><kbd>Cmd+Z</kbd><span>Undo</span></div>
                    <div className={styles.shortcutRow}><kbd>Cmd+Shift+Z</kbd><span>Redo</span></div>
                  </div>
                  <div className={styles.shortcutsSection}>
                    <div className={styles.shortcutsSectionTitle}>Markdown</div>
                    <div className={styles.shortcutRow}><code># </code><span>Heading</span></div>
                    <div className={styles.shortcutRow}><code>**text**</code><span>Bold</span></div>
                    <div className={styles.shortcutRow}><code>*text*</code><span>Italic</span></div>
                    <div className={styles.shortcutRow}><code>~~text~~</code><span>Strikethrough</span></div>
                    <div className={styles.shortcutRow}><code>`code`</code><span>Inline code</span></div>
                    <div className={styles.shortcutRow}><code>&gt; </code><span>Blockquote</span></div>
                    <div className={styles.shortcutRow}><code>- </code><span>Bullet list</span></div>
                    <div className={styles.shortcutRow}><code>1. </code><span>Numbered list</span></div>
                    <div className={styles.shortcutRow}><code>---</code><span>Divider</span></div>
                    <div className={styles.shortcutRow}><code>[text](url)</code><span>Link</span></div>
                  </div>
                </div>
              )}
            </div>
            {/* Mobile actions menu */}
            <div className={styles.actionsWrap} ref={actionsRef}>
              <button
                className={styles.actionsBtn}
                onClick={() => setActionsOpen((v) => !v)}
                title="Actions"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="3" cy="8" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="13" cy="8" r="1.5" />
                </svg>
              </button>
              {actionsOpen && (
                <div className={styles.actionsMenu}>
                  <div className={styles.actionsMenuInfo}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 13h12M2 9h8M2 5h12M2 1h5" />
                    </svg>
                    {wordCount} {wordCount === 1 ? 'word' : 'words'}
                  </div>
                  <button
                    className={styles.actionsMenuItem}
                    onClick={() => {
                      cycleFocusMode();
                      setActionsOpen(false);
                    }}
                  >
                    {focusIcon}
                    {focusLabel}
                  </button>
                  <button
                    className={styles.actionsMenuItem}
                    onClick={handleCopyPost}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="5" width="9" height="9" rx="1" />
                      <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
                    </svg>
                    {postCopied ? 'Copied!' : 'Copy post'}
                  </button>
                </div>
              )}
            </div>
            {/* Settings gear */}
            <button
              className={styles.shortcutsBtn}
              onClick={() => setSettingsPanelOpen((v) => !v)}
              title="Settings"
            >
              {gearIcon}
            </button>
            {/* Inline toggle — inside the bar */}
            <button
              className={styles.toggleInline}
              onClick={() => setSettingsVisible(false)}
              aria-label="Hide settings"
            >
              {eyeIcon}
            </button>
          </div>
        </div>
      </div>

      {/* Scroll area — only this region scrolls */}
      <div className={styles.scrollArea}>
        {/* Static title */}
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleText}>Hermes</span>
        </div>
        {/* Page tabs — scroll with content */}
        <div className={styles.tabsArea}>
          <PageTabs activeTab={activeTab} onTabChange={handleTabChange} pages={pages} />
        </div>
        <div className={styles.content}>
          <div className={styles.editorWrap}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* Highlight popover */}
      <HighlightPopover
        highlight={activeHighlight}
        rect={popoverRect}
        onDismiss={handleDismissHighlight}
        onAcceptEdit={handleAcceptEdit}
        onReply={handleReply}
      />

      {/* Link tooltip */}
      <LinkTooltip tooltip={linkTooltip} isMac={isMac} />

      {/* Settings panel */}
      <SettingsPanel
        isOpen={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
      />

      {/* Floating chat window */}
      <Sentry.ErrorBoundary fallback={<div style={{ position: 'fixed', bottom: 24, left: 24, color: 'var(--text-muted)', fontSize: 13 }}>Chat unavailable</div>}>
        <FocusChatWindow
          getPages={getPages}
          activeTab={activeTab}
          onHighlights={handleHighlights}
        />
      </Sentry.ErrorBoundary>
    </div>
  );
}
