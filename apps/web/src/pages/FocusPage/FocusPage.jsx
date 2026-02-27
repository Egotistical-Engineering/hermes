import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Markdown } from '@tiptap/markdown';
import { Slice } from '@tiptap/pm/model';
import { IS_MOBILE, IS_TAURI } from '../../lib/platform';
import { loadSettings, saveSettings } from '../../lib/settingsStorage';
import { getDefaultWorkspace, listWorkspaceProjects, loadWorkspacePages, saveWorkspacePages } from '../../lib/workspaceStorage';
import {
  loadProjectRegistry,
  saveProjectRegistry,
  loadProjectPages,
  saveProjectPages,
  createProject as createProjectInStorage,
  renameProject as renameProjectInStorage,
  deleteProject as deleteProjectInStorage,
  reconcileWorkspaceProjects,
} from '../../lib/projectStorage';
import useFocusMode from './useFocusMode';
import useHighlights, { getDocFlatText, flatOffsetToPos } from './useHighlights';
import useInlineLink from './useInlineLink';
import LinkTooltip from './LinkTooltip';
import FocusChatWindow from './FocusChatWindow';
import HighlightPopover from './HighlightPopover';
import ProjectDropdown from './ProjectDropdown';
import PageTabs, { EMPTY_PAGES, TAB_KEYS } from './PageTabs';
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

function loadPagesFromLocalStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return null;
    return { ...EMPTY_PAGES, ...parsed };
  } catch {
    return null;
  }
}

function savePagesToLocalStorage(pages) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch {
    // localStorage unavailable
  }
}

function hasAnyPageContent(pages) {
  return Object.values(pages || {}).some((content) => typeof content === 'string' && content.trim().length > 0);
}

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
  const [workspacePath, setWorkspacePath] = useState('');
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [projectRegistry, setProjectRegistry] = useState(null);
  const saveTimerRef = useRef(null);
  const registryUpdateTimerRef = useRef(null);
  const switchingRef = useRef(false);
  const pagesRef = useRef(pages);
  const activeTabRef = useRef(activeTab);
  const workspacePathRef = useRef('');
  const scrollAreaRef = useRef(null);
  const tabScrollRef = useRef(Object.fromEntries(TAB_KEYS.map((key) => [key, 0])));

  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { workspacePathRef.current = workspacePath; }, [workspacePath]);

  // Load project registry on mount
  useEffect(() => {
    const registry = loadProjectRegistry();
    setProjectRegistry(registry);
  }, []);

  const activeProject = projectRegistry?.projects.find((p) => p.id === projectRegistry.activeProjectId) || null;
  const activeProjectId = activeProject?.id || null;
  const chatStorageKey = activeProjectId ? `hermes-project-${activeProjectId}-chat` : 'hermes-chat-messages';
  const projectWorkspacePath = workspacePath && activeProject
    ? `${workspacePath}/${activeProject.name}`
    : workspacePath;
  const projectWorkspacePathRef = useRef(projectWorkspacePath);
  useEffect(() => { projectWorkspacePathRef.current = projectWorkspacePath; }, [projectWorkspacePath]);

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

      // Debounced persistence (workspace files on desktop, localStorage fallback elsewhere)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const currentProjectPath = projectWorkspacePathRef.current;
        if (IS_TAURI && currentProjectPath) {
          void saveWorkspacePages(currentProjectPath, pagesRef.current).catch(() => {
            savePagesToLocalStorage(pagesRef.current);
          });
        } else {
          savePagesToLocalStorage(pagesRef.current);
        }

        // Also persist to project storage
        if (activeProjectId) {
          saveProjectPages(activeProjectId, pagesRef.current);
          // Throttled registry updatedAt update
          if (registryUpdateTimerRef.current) clearTimeout(registryUpdateTimerRef.current);
          registryUpdateTimerRef.current = setTimeout(() => {
            setProjectRegistry((prev) => {
              if (!prev) return prev;
              const updated = {
                ...prev,
                projects: prev.projects.map((p) =>
                  p.id === activeProjectId ? { ...p, updatedAt: Date.now() } : p
                ),
              };
              saveProjectRegistry(updated);
              return updated;
            });
          }, 5000);
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

  // Load content from workspace files (desktop) or localStorage fallback
  useEffect(() => {
    if (!editor) return;
    if (initialLoaded) return;

    let cancelled = false;

    (async () => {
      // Try project storage first, fall back to legacy localStorage
      const projectPages = activeProjectId ? loadProjectPages(activeProjectId) : null;
      const localPages = projectPages || loadPagesFromLocalStorage();
      let loadedPages = localPages;
      let seedWorkspaceFromLoadedPages = false;

      if (IS_TAURI) {
        try {
          const settings = await loadSettings();
          if (cancelled) return;

          let configuredWorkspace = settings.workspacePath?.trim() || '';

          // Auto-provision default workspace on first launch
          if (!configuredWorkspace) {
            try {
              const defaultPath = await getDefaultWorkspace();
              if (cancelled) return;
              if (defaultPath) {
                configuredWorkspace = defaultPath;
                settings.workspacePath = defaultPath;
                await saveSettings(settings);
              }
            } catch {
              // Fall through — user can manually set workspace later
            }
          }

          setWorkspacePath(configuredWorkspace);
          workspacePathRef.current = configuredWorkspace;

          // Reconcile workspace folders with project registry
          if (configuredWorkspace) {
            try {
              const folderNames = await listWorkspaceProjects(configuredWorkspace);
              if (cancelled) return;
              if (folderNames.length > 0) {
                const reconciled = reconcileWorkspaceProjects(folderNames);
                setProjectRegistry(reconciled);
              }
            } catch {
              // non-critical
            }
          }

          if (configuredWorkspace) {
            const projectPath = activeProject
              ? `${configuredWorkspace}/${activeProject.name}`
              : configuredWorkspace;
            const workspacePages = await loadWorkspacePages(projectPath);
            if (cancelled) return;

            if (hasAnyPageContent(workspacePages)) {
              loadedPages = { ...EMPTY_PAGES, ...workspacePages };
            } else if (activeProject) {
              // Migration: check for files at the old root workspace path
              // (before multi-project support moved them into subfolders)
              const rootPages = await loadWorkspacePages(configuredWorkspace);
              if (cancelled) return;

              if (hasAnyPageContent(rootPages)) {
                loadedPages = { ...EMPTY_PAGES, ...rootPages };
                // Save to the new project subfolder
                void saveWorkspacePages(projectPath, loadedPages).catch(() => {});
              } else if (localPages) {
                loadedPages = localPages;
                seedWorkspaceFromLoadedPages = true;
              }
            } else if (localPages) {
              loadedPages = localPages;
              seedWorkspaceFromLoadedPages = true;
            }
          }
        } catch {
          loadedPages = localPages;
        }
      }

      // No stored content found, seed with Welcome content.
      if (!loadedPages) {
        const { WELCOME_PAGES, WELCOME_HIGHLIGHTS } = await import('@hermes/api');
        if (cancelled) return;

        const seeded = { ...EMPTY_PAGES, ...WELCOME_PAGES };
        setPages(seeded);
        pagesRef.current = seeded;
        editor.commands.setContent(seeded[activeTab] || '', { contentType: 'markdown' });
        setWordCount(getWordCount(editor.getText()));
        if (WELCOME_HIGHLIGHTS) replaceHighlights(WELCOME_HIGHLIGHTS);
        setInitialLoaded(true);

        const currentProjectPath = projectWorkspacePathRef.current;
        if (IS_TAURI && currentProjectPath) {
          void saveWorkspacePages(currentProjectPath, seeded).catch(() => {
            savePagesToLocalStorage(seeded);
          });
        } else {
          savePagesToLocalStorage(seeded);
        }
        return;
      }

      setPages(loadedPages);
      pagesRef.current = loadedPages;
      editor.commands.setContent(loadedPages[activeTab] || '', { contentType: 'markdown' });
      setWordCount(getWordCount(editor.getText()));
      setInitialLoaded(true);

      if (IS_TAURI && seedWorkspaceFromLoadedPages && projectWorkspacePathRef.current) {
        void saveWorkspacePages(projectWorkspacePathRef.current, loadedPages).catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editor, initialLoaded, activeTab, activeProject, activeProjectId, replaceHighlights]);

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

    // Persist current tab scroll position so we can restore it later.
    if (scrollAreaRef.current) {
      tabScrollRef.current[activeTab] = scrollAreaRef.current.scrollTop;
    }

    // Flush pending saves immediately
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      const currentProjectPath = projectWorkspacePathRef.current;
      if (IS_TAURI && currentProjectPath) {
        void saveWorkspacePages(currentProjectPath, pagesRef.current).catch(() => {
          savePagesToLocalStorage(pagesRef.current);
        });
      } else {
        savePagesToLocalStorage(pagesRef.current);
      }
      if (activeProjectId) {
        saveProjectPages(activeProjectId, pagesRef.current);
      }
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

    const targetScrollTop = tabScrollRef.current[newTab] || 0;
    requestAnimationFrame(() => {
      if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTop = targetScrollTop;
      }
    });

    setWordCount(getWordCount(editor.getText()));
    clearHighlight();
  }, [editor, activeTab, activeProjectId, clearHighlight]);

  // Stable callback for child components to read pages on-demand
  const getPages = useCallback(() => pagesRef.current, []);

  // --- Project CRUD ---

  const flushCurrentProject = useCallback(() => {
    if (!editor || !activeProjectId) return;
    // Flush pending save timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    // Save current editor content into pages
    const hasText = editor.getText().trim().length > 0;
    const currentMd = hasText ? editor.getMarkdown() : '';
    const updated = { ...pagesRef.current, [activeTabRef.current]: currentMd };
    pagesRef.current = updated;
    // Persist pages
    saveProjectPages(activeProjectId, updated);
    savePagesToLocalStorage(updated);
    if (IS_TAURI && projectWorkspacePathRef.current) {
      void saveWorkspacePages(projectWorkspacePathRef.current, updated).catch(() => {});
    }
  }, [editor, activeProjectId]);

  const handleProjectSelect = useCallback((projectId) => {
    if (projectId === activeProjectId) return;

    // Flush current project
    flushCurrentProject();

    // Switch to new project
    setProjectRegistry((prev) => {
      const updated = { ...prev, activeProjectId: projectId };
      saveProjectRegistry(updated);
      return updated;
    });

    // Load new project's pages
    const newPages = loadProjectPages(projectId);
    const loaded = newPages ? { ...EMPTY_PAGES, ...newPages } : { ...EMPTY_PAGES };
    setPages(loaded);
    pagesRef.current = loaded;

    // Update editor
    switchingRef.current = true;
    editor.commands.setContent(loaded[activeTabRef.current] || '', { contentType: 'markdown' });
    switchingRef.current = false;
    setWordCount(getWordCount(editor.getText()));
    clearHighlight();
  }, [editor, activeProjectId, flushCurrentProject, clearHighlight]);

  const handleProjectCreate = useCallback(() => {
    // Flush current project first
    flushCurrentProject();

    const { registry } = createProjectInStorage('Untitled');
    setProjectRegistry(registry);

    // Load empty pages for new project
    const empty = { ...EMPTY_PAGES };
    setPages(empty);
    pagesRef.current = empty;

    switchingRef.current = true;
    editor.commands.setContent('', { contentType: 'markdown' });
    switchingRef.current = false;
    setWordCount(0);
    clearHighlight();
  }, [editor, flushCurrentProject, clearHighlight]);

  const handleProjectRename = useCallback((projectId, newName) => {
    const updated = renameProjectInStorage(projectId, newName);
    setProjectRegistry(updated);
  }, []);

  const handleProjectDelete = useCallback((projectId) => {
    const updated = deleteProjectInStorage(projectId);
    setProjectRegistry(updated);

    // If we deleted the active project, load the new active project's content
    if (projectId === activeProjectId) {
      const newPages = loadProjectPages(updated.activeProjectId);
      const loaded = newPages ? { ...EMPTY_PAGES, ...newPages } : { ...EMPTY_PAGES };
      setPages(loaded);
      pagesRef.current = loaded;

      switchingRef.current = true;
      editor.commands.setContent(loaded[activeTabRef.current] || '', { contentType: 'markdown' });
      switchingRef.current = false;
      setWordCount(getWordCount(editor.getText()));
      clearHighlight();
    }
  }, [editor, activeProjectId, clearHighlight]);

  const handleSettingsSaved = useCallback(async (settings) => {
    const nextWorkspacePath = settings?.workspacePath?.trim() || '';
    if (nextWorkspacePath === workspacePathRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      savePagesToLocalStorage(pagesRef.current);
    }

    setWorkspacePath(nextWorkspacePath);
    workspacePathRef.current = nextWorkspacePath;

    // Reconcile workspace folders with project registry
    if (nextWorkspacePath && IS_TAURI) {
      try {
        const folderNames = await listWorkspaceProjects(nextWorkspacePath);
        if (folderNames.length > 0) {
          const reconciled = reconcileWorkspaceProjects(folderNames);
          setProjectRegistry(reconciled);
        }
      } catch {
        // non-critical
      }
    }

    setInitialLoaded(false);
  }, []);

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
    <svg width="14" height="14" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="13" cy="13" r="3" />
      <circle cx="13" cy="13" r="8" />
      <line x1="13" y1="0" x2="13" y2="5" />
      <line x1="13" y1="21" x2="13" y2="26" />
      <line x1="26" y1="13" x2="21" y2="13" />
      <line x1="5" y1="13" x2="0" y2="13" />
      <line x1="22.72" y1="3.32" x2="19.26" y2="6.92" />
      <line x1="7.17" y1="19.46" x2="3.71" y2="23.06" />
      <line x1="22.21" y1="23.12" x2="18.77" y2="19.50" />
      <line x1="6.78" y1="6.87" x2="3.33" y2="3.25" />
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
          <div className={styles.settingsLeft}>
            <button
              className={styles.toggleInline}
              onClick={() => setSettingsVisible(false)}
              aria-label="Hide settings"
            >
              {eyeIcon}
            </button>
          <div className={styles.breadcrumbWrap}>
            <span className={styles.brandLabel}>Hermes</span>
            <span className={styles.breadcrumbSep}>/</span>
            {projectRegistry && (
              <ProjectDropdown
                activeProject={activeProject}
                projects={projectRegistry.projects}
                activeProjectId={activeProjectId}
                onSelect={handleProjectSelect}
                onCreate={handleProjectCreate}
                onRename={handleProjectRename}
                onDelete={handleProjectDelete}
              />
            )}
          </div>
          </div>

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
          </div>
        </div>
      </div>

      {/* Scroll area — only this region scrolls */}
      <div className={styles.scrollArea} ref={scrollAreaRef}>
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
        onSettingsSaved={handleSettingsSaved}
      />

      {/* Floating chat window */}
      <Sentry.ErrorBoundary fallback={<div style={{ position: 'fixed', bottom: 24, left: 24, color: 'var(--text-muted)', fontSize: 13 }}>Chat unavailable</div>}>
        <FocusChatWindow
          getPages={getPages}
          activeTab={activeTab}
          onHighlights={handleHighlights}
          chatStorageKey={chatStorageKey}
          projectWorkspacePath={projectWorkspacePath}
        />
      </Sentry.ErrorBoundary>
    </div>
  );
}
