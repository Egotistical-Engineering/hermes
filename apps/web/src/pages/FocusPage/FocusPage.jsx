import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from '@tiptap/markdown';
import { fetchWritingProject, saveProjectPages, saveProjectHighlights } from '@hermes/api';
import useAuth from '../../hooks/useAuth';
import useFocusMode from './useFocusMode';
import useHighlights from './useHighlights';
import FocusChatWindow from './FocusChatWindow';
import HighlightPopover from './HighlightPopover';
import PageTabs, { EMPTY_PAGES, TAB_KEYS } from './PageTabs';
import ProjectSwitcher from './ProjectSwitcher';
import styles from './FocusPage.module.css';

function getWordCount(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export default function FocusPage() {
  const { projectId } = useParams();
  const { session } = useAuth();
  const [projectTitle, setProjectTitle] = useState('');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [activeTab, setActiveTab] = useState('coral');
  const [pages, setPages] = useState({ ...EMPTY_PAGES });
  const [initialLoaded, setInitialLoaded] = useState(false);
  const saveTimerRef = useRef(null);
  const supabaseSaveTimerRef = useRef(null);
  const highlightSaveTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const switchingRef = useRef(false);
  const pagesRef = useRef(pages);
  const activeTabRef = useRef(activeTab);
  const storageKey = `hermes-focus-pages-${projectId}`;

  // Keep refs in sync for use in onUpdate callback
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const isLoggedIn = !!session;

  // Load project title
  useEffect(() => {
    if (!projectId || !isLoggedIn) return;
    fetchWritingProject(projectId).then((project) => {
      if (project?.title) setProjectTitle(project.title);
    }).catch(() => {});
  }, [projectId, isLoggedIn]);

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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
      focusExtension,
      highlightExtension,
    ],
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
          localStorage.setItem(storageKey, JSON.stringify(pagesRef.current));
        } catch {
          // localStorage full or unavailable
        }
      }, 500);

      // Debounced Supabase save (2s, authenticated only)
      if (isLoggedIn && projectId) {
        if (supabaseSaveTimerRef.current) clearTimeout(supabaseSaveTimerRef.current);
        supabaseSaveTimerRef.current = setTimeout(() => {
          saveProjectPages(projectId, pagesRef.current).catch(() => {});
        }, 2000);
      }
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

  // Load content: Supabase first (if logged in), then localStorage fallback
  useEffect(() => {
    if (!editor) return;
    if (initialLoaded) return;

    let cancelled = false;

    async function loadContent() {
      let loadedPages = null;

      // Try Supabase first if logged in
      if (isLoggedIn && projectId) {
        try {
          const project = await fetchWritingProject(projectId);
          if (cancelled) return;

          // Use pages if they have content, else migrate from content field
          const hasPages = project?.pages && Object.values(project.pages).some((v) => v);
          if (hasPages) {
            loadedPages = { ...EMPTY_PAGES, ...project.pages };
          } else if (project?.content) {
            loadedPages = { ...EMPTY_PAGES, coral: project.content };
          }

          // Load highlights from project
          if (project?.highlights && project.highlights.length > 0) {
            replaceHighlights(project.highlights);
          }

          if (loadedPages) {
            setPages(loadedPages);
            pagesRef.current = loadedPages;
            editor.commands.setContent(loadedPages[activeTab] || '', { contentType: 'markdown' });
            setWordCount(getWordCount(editor.getText()));
            setInitialLoaded(true);
            return;
          }
        } catch {
          // Fall through to localStorage
        }
      }

      if (cancelled) return;

      // localStorage fallback
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object') {
            loadedPages = { ...EMPTY_PAGES, ...parsed };
          }
        }
      } catch {
        // Try legacy single-content key
        try {
          const legacy = localStorage.getItem(`hermes-focus-${projectId}`);
          if (legacy) {
            loadedPages = { ...EMPTY_PAGES, coral: legacy };
          }
        } catch {
          // localStorage unavailable
        }
      }

      if (loadedPages) {
        setPages(loadedPages);
        pagesRef.current = loadedPages;
        editor.commands.setContent(loadedPages[activeTab] || '', { contentType: 'markdown' });
        setWordCount(getWordCount(editor.getText()));
      }

      setInitialLoaded(true);
    }

    loadContent();

    return () => { cancelled = true; };
  }, [editor, projectId, isLoggedIn, storageKey, initialLoaded, activeTab, replaceHighlights]);

  // Reset when projectId changes
  useEffect(() => {
    setInitialLoaded(false);
    setActiveTab('coral');
    setPages({ ...EMPTY_PAGES });
    pagesRef.current = { ...EMPTY_PAGES };
    if (editor) {
      editor.commands.clearContent();
      setWordCount(0);
    }
    replaceHighlights([]);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist highlights to Supabase when they change
  useEffect(() => {
    if (!isLoggedIn || !projectId || !initialLoaded) return;
    if (highlightSaveTimerRef.current) clearTimeout(highlightSaveTimerRef.current);
    highlightSaveTimerRef.current = setTimeout(() => {
      saveProjectHighlights(projectId, highlights).catch(() => {});
    }, 1500);
  }, [highlights, projectId, isLoggedIn, initialLoaded]);

  // Handle new highlights from chat
  const handleHighlights = useCallback((newHighlights) => {
    addHighlights(newHighlights);
  }, [addHighlights]);

  // Accept edit: replace matchText in editor with suggestedEdit
  const handleAcceptEdit = useCallback((highlight) => {
    if (!editor || !highlight.suggestedEdit) return;

    const md = editor.getMarkdown();
    const idx = md.indexOf(highlight.matchText);
    if (idx !== -1) {
      const newMd = md.slice(0, idx) + highlight.suggestedEdit + md.slice(idx + highlight.matchText.length);
      editor.commands.setContent(newMd, { contentType: 'markdown' });
    }

    dismissHighlight(highlight.id);
  }, [editor, dismissHighlight]);

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
        localStorage.setItem(storageKey, JSON.stringify(pagesRef.current));
      } catch { /* */ }
    }
    if (supabaseSaveTimerRef.current) {
      clearTimeout(supabaseSaveTimerRef.current);
      if (isLoggedIn && projectId) {
        saveProjectPages(projectId, pagesRef.current).catch(() => {});
      }
    }

    // Save current content into pages (empty editor → empty string)
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
    replaceHighlights([]);
  }, [editor, activeTab, storageKey, isLoggedIn, projectId, replaceHighlights]);

  // Settings bar hover handling
  const showSettings = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setSettingsVisible(true);
  }, []);

  const hideSettings = useCallback(() => {
    if (dropdownOpen) return;
    hideTimerRef.current = setTimeout(() => setSettingsVisible(false), 300);
  }, [dropdownOpen]);

  const handleCopy = useCallback(() => {
    if (!editor) return;
    return editor.getMarkdown();
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

  return (
    <div className={styles.page}>
      {/* Mobile floating toggle — only visible when bar is hidden */}
      {!settingsVisible && (
        <button
          className={styles.mobileToggleFloat}
          onClick={() => setSettingsVisible(true)}
          aria-label="Show settings"
        >
          {eyeIcon}
        </button>
      )}

      {/* Hover zone + settings bar */}
      <div
        className={styles.hoverZone}
        onMouseEnter={showSettings}
        onMouseLeave={hideSettings}
      >
        <div
          className={`${styles.settingsBar} ${settingsVisible ? styles.settingsBarVisible : ''}`}
        >
          {isLoggedIn && projectId ? (
            <ProjectSwitcher
              projectId={projectId}
              projectTitle={projectTitle}
              onDropdownOpen={() => setDropdownOpen(true)}
              onDropdownClose={() => setDropdownOpen(false)}
              onProjectRenamed={(id, newTitle) => {
                if (id === projectId) setProjectTitle(newTitle);
              }}
              getMarkdown={handleCopy}
            />
          ) : (
            <span className={styles.brandLabel}>Hermes</span>
          )}

          <div className={styles.settingsRight}>
            <button
              className={`${styles.focusBtn} ${focusMode !== 'off' ? styles.focusBtnActive : ''}`}
              onClick={cycleFocusMode}
              title={focusLabel}
            >
              <span className={styles.focusLabel}>{focusLabel}</span>
              <span className={styles.focusIcon}>{focusIcon}</span>
            </button>
            <span className={styles.wordCount}>
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </span>
            {/* Mobile inline toggle — inside the bar */}
            <button
              className={styles.mobileToggleInline}
              onClick={() => setSettingsVisible(false)}
              aria-label="Hide settings"
            >
              {eyeIcon}
            </button>
          </div>
        </div>
      </div>

      {/* Page tabs */}
      <div className={styles.tabsArea}>
        <PageTabs activeTab={activeTab} onTabChange={handleTabChange} pages={pages} />
      </div>

      {/* Editor */}
      <div className={styles.content}>
        <div className={styles.editorWrap}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Highlight popover */}
      <HighlightPopover
        highlight={activeHighlight}
        rect={popoverRect}
        onDismiss={(id) => {
          if (id) dismissHighlight(id);
          else clearHighlight();
        }}
        onAcceptEdit={handleAcceptEdit}
        onReply={handleReply}
      />

      {/* Floating chat window */}
      <FocusChatWindow
        projectId={projectId}
        pages={pages}
        activeTab={activeTab}
        onHighlights={handleHighlights}
        session={session}
      />
    </div>
  );
}
