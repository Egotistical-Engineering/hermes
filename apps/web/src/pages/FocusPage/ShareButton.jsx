import { useCallback, useEffect, useRef, useState } from 'react';
import { publishProject, unpublishProject, updatePublishSettings, generateSlug } from '@hermes/api';
import styles from './ShareButton.module.css';

const TAB_COLORS = {
  coral: '#e07a5f',
  amber: '#e0a05f',
  sage: '#6b9e7a',
  sky: '#5f8fc9',
  lavender: '#9a7ec8',
};

export default function ShareButton({
  projectId,
  projectTitle,
  getPages,
  published,
  shortId,
  slug,
  authorName: initialAuthorName,
  publishedTabs: initialPublishedTabs,
  onPublishChange,
  isOpen,
  onOpenChange,
}) {
  const [open, setOpen] = useState(false);
  const [authorName, setAuthorName] = useState(initialAuthorName || '');
  const [selectedTabs, setSelectedTabs] = useState(initialPublishedTabs || []);
  const [publishing, setPublishing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const wrapRef = useRef(null);

  // Sync external open control
  useEffect(() => {
    if (isOpen) setOpen(true);
  }, [isOpen]);

  // Sync with parent when props change
  useEffect(() => {
    setAuthorName(initialAuthorName || '');
  }, [initialAuthorName]);
  useEffect(() => {
    setSelectedTabs(initialPublishedTabs || []);
  }, [initialPublishedTabs]);

  // Outside click close
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setConfirmUnpublish(false);
        onOpenChange?.(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, onOpenChange]);

  // Escape key close
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        setConfirmUnpublish(false);
        onOpenChange?.(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  // Tabs with content — read on-demand so this component doesn't re-render on every keystroke
  const pages = getPages();
  const tabsWithContent = Object.entries(pages)
    .filter(([, content]) => content?.trim())
    .map(([key]) => key);

  const toggleTab = useCallback((tabKey) => {
    setSelectedTabs((prev) => {
      const next = prev.includes(tabKey)
        ? prev.filter((t) => t !== tabKey)
        : [...prev, tabKey];

      // Auto-save if already published
      if (published && projectId) {
        updatePublishSettings(projectId, { published_tabs: next }).catch((err) => console.error('Tab update failed:', err));
        onPublishChange?.({ publishedTabs: next });
      }

      return next;
    });
  }, [published, projectId, onPublishChange]);

  const handlePublish = useCallback(async () => {
    if (!projectId || publishing) return;
    setPublishing(true);
    try {
      const result = await publishProject(projectId, authorName, selectedTabs);
      onPublishChange?.({
        published: true,
        shortId: result.shortId,
        slug: result.slug,
        authorName: result.authorName,
        publishedTabs: result.publishedTabs,
        publishedAt: result.publishedAt,
      });
    } catch (err) {
      console.error('Publish failed:', err);
    }
    setPublishing(false);
  }, [projectId, authorName, selectedTabs, publishing, onPublishChange]);

  const handleUpdate = useCallback(async () => {
    if (!projectId || updating) return;
    setUpdating(true);
    try {
      const result = await publishProject(projectId, authorName, selectedTabs);
      onPublishChange?.({
        published: true,
        shortId: result.shortId,
        slug: result.slug,
        authorName: result.authorName,
        publishedTabs: result.publishedTabs,
        publishedAt: result.publishedAt,
      });
      setUpdated(true);
      setTimeout(() => setUpdated(false), 2000);
    } catch (err) {
      console.error('Update failed:', err);
    }
    setUpdating(false);
  }, [projectId, authorName, selectedTabs, updating, onPublishChange]);

  const handleUnpublish = useCallback(async () => {
    if (!projectId) return;
    try {
      await unpublishProject(projectId);
      onPublishChange?.({ published: false });
      setConfirmUnpublish(false);
    } catch (err) {
      console.error('Unpublish failed:', err);
    }
  }, [projectId, onPublishChange]);

  const handleAuthorBlur = useCallback(() => {
    if (published && projectId) {
      const newSlug = generateSlug(projectTitle || 'untitled');
      updatePublishSettings(projectId, { author_name: authorName, slug: newSlug }).catch((err) => console.error('Author update failed:', err));
      onPublishChange?.({ authorName, slug: newSlug });
    }
  }, [published, projectId, authorName, projectTitle, onPublishChange]);

  const readUrl = shortId && slug
    ? `${window.location.origin}/read/${shortId}/${slug}`
    : '';

  const handleCopy = useCallback(() => {
    if (!readUrl) return;
    navigator.clipboard.writeText(readUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [readUrl]);

  const shareIcon = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12V14H12V12" />
      <path d="M8 10V2" />
      <path d="M5 5L8 2L11 5" />
    </svg>
  );

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={`${styles.trigger} ${published ? styles.triggerPublished : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={published ? 'Manage published post' : 'Share post'}
      >
        {shareIcon}
      </button>

      {open && (
        <div className={styles.panel}>
          {published ? (
            <>
              <h3 className={styles.heading}>Published</h3>

              <div className={styles.urlRow}>
                <span className={styles.urlDisplay}>{readUrl}</span>
                <button className={styles.copyBtn} onClick={handleCopy}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <a
                className={styles.openLink}
                href={readUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in new tab
              </a>

              <hr className={styles.separator} />

              <div className={styles.field}>
                <label className={styles.label}>Author name</label>
                <input
                  className={styles.input}
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  onBlur={handleAuthorBlur}
                  placeholder="Your name"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Published tabs</label>
                <div className={styles.tabList}>
                  {tabsWithContent.map((tab) => (
                    <label key={tab} className={styles.tabCheck}>
                      <input
                        type="checkbox"
                        checked={selectedTabs.includes(tab)}
                        onChange={() => toggleTab(tab)}
                      />
                      <span
                        className={styles.tabDot}
                        style={{ backgroundColor: TAB_COLORS[tab] || '#999' }}
                      />
                      {tab}
                    </label>
                  ))}
                </div>
              </div>

              <button
                className={styles.updateBtn}
                onClick={handleUpdate}
                disabled={updating}
              >
                {updating ? 'Updating...' : updated ? 'Updated' : 'Update published content'}
              </button>
              {updated && (
                <p className={styles.updateNote}>Readers will see your latest changes.</p>
              )}

              <button
                className={styles.unpublishBtn}
                onClick={() => {
                  if (confirmUnpublish) {
                    handleUnpublish();
                  } else {
                    setConfirmUnpublish(true);
                  }
                }}
              >
                {confirmUnpublish ? 'Confirm unpublish' : 'Unpublish'}
              </button>
              {confirmUnpublish && (
                <p className={styles.warning}>The link will stop working immediately.</p>
              )}
            </>
          ) : (
            <>
              <h3 className={styles.heading}>Share post</h3>

              <div className={styles.field}>
                <label className={styles.label}>Author name</label>
                <input
                  className={styles.input}
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Your name"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Tabs to publish</label>
                <div className={styles.tabList}>
                  {tabsWithContent.map((tab) => (
                    <label key={tab} className={styles.tabCheck}>
                      <input
                        type="checkbox"
                        checked={selectedTabs.includes(tab)}
                        onChange={() => toggleTab(tab)}
                      />
                      <span
                        className={styles.tabDot}
                        style={{ backgroundColor: TAB_COLORS[tab] || '#999' }}
                      />
                      {tab}
                    </label>
                  ))}
                </div>
              </div>

              <button
                className={styles.publishBtn}
                onClick={handlePublish}
                disabled={publishing || selectedTabs.length === 0}
              >
                {publishing ? 'Publishing...' : 'Publish'}
              </button>
              <p className={styles.note}>Anyone with the link can read</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
