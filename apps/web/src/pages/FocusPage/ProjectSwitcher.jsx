import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWritingProjects, createWritingProject, updateWritingProject, deleteWritingProject } from '@hermes/api';
import { relativeTime } from '@hermes/domain';
import useAuth from '../../hooks/useAuth';
import styles from './ProjectSwitcher.module.css';

const INITIAL_VISIBLE = 3;

export default function ProjectSwitcher({ projectId, projectTitle, onDropdownOpen, onDropdownClose, onProjectRenamed, getMarkdown }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const wrapperRef = useRef(null);
  const renameInputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [projects, setProjects] = useState(null);
  const [creating, setCreating] = useState(false);

  // Inline action states
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(null);

  // Lazy-fetch projects on first open
  const openDropdown = useCallback(() => {
    setOpen(true);
    onDropdownOpen?.();
    if (projects === null) {
      fetchWritingProjects()
        .then(setProjects)
        .catch(() => setProjects([]));
    }
  }, [projects, onDropdownOpen]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setExpanded(false);
    setRenaming(null);
    setConfirmingDelete(null);
    onDropdownClose?.();
  }, [onDropdownClose]);

  const toggleDropdown = useCallback(() => {
    if (open) closeDropdown();
    else openDropdown();
  }, [open, openDropdown, closeDropdown]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, closeDropdown]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (renaming) { setRenaming(null); return; }
        if (confirmingDelete) { setConfirmingDelete(null); return; }
        closeDropdown();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, closeDropdown, renaming, confirmingDelete]);

  // Auto-focus rename input
  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  // Create new project
  const handleCreate = async () => {
    if (creating || !session?.user?.id) return;
    setCreating(true);
    try {
      const project = await createWritingProject('New Project', session.user.id);
      closeDropdown();
      navigate(`/projects/${project.id}`);
    } catch {
      // Fail silently
    } finally {
      setCreating(false);
    }
  };

  // Navigate to a project
  const handleSelect = (id) => {
    closeDropdown();
    navigate(`/projects/${id}`);
  };

  // Rename
  const startRename = (e, project) => {
    e.stopPropagation();
    setRenameValue(project.title || '');
    setRenaming(project.id);
  };

  const commitRename = async (id) => {
    const trimmed = renameValue.trim();
    if (!trimmed || !projects) { setRenaming(null); return; }

    try {
      await updateWritingProject(id, { title: trimmed });
      setProjects(projects.map((p) => p.id === id ? { ...p, title: trimmed } : p));
      onProjectRenamed?.(id, trimmed);
    } catch {
      // Fail silently
    }
    setRenaming(null);
  };

  const handleRenameKeyDown = (e, id) => {
    if (e.key === 'Enter') { e.preventDefault(); commitRename(id); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRenaming(null); }
  };

  // Delete
  const startDelete = (e, id) => {
    e.stopPropagation();
    setConfirmingDelete(id);
  };

  const commitDelete = async (id) => {
    try {
      await deleteWritingProject(id);
      const updated = projects.filter((p) => p.id !== id);
      setProjects(updated);
      setConfirmingDelete(null);

      // If deleting the current project, navigate to first available or dashboard
      if (id === projectId) {
        const next = updated.find((p) => p.id !== id);
        closeDropdown();
        navigate(next ? `/projects/${next.id}` : '/');
      }
    } catch {
      setConfirmingDelete(null);
    }
  };

  // Filter out current project
  const otherProjects = projects ? projects.filter((p) => p.id !== projectId) : [];
  const visibleProjects = expanded ? otherProjects : otherProjects.slice(0, INITIAL_VISIBLE);
  const hasMore = otherProjects.length > INITIAL_VISIBLE;

  const renderProjectItem = (p) => {
    // Delete confirmation mode
    if (confirmingDelete === p.id) {
      return (
        <div key={p.id} className={styles.confirmRow}>
          <div className={styles.confirmLabel}>Delete this project?</div>
          <div className={styles.confirmActions}>
            <button
              className={styles.confirmCancel}
              onClick={(e) => { e.stopPropagation(); setConfirmingDelete(null); }}
            >
              Cancel
            </button>
            <button
              className={styles.confirmDelete}
              onClick={(e) => { e.stopPropagation(); commitDelete(p.id); }}
            >
              Delete
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={p.id}
        className={styles.projectItem}
        role="button"
        tabIndex={0}
        onClick={() => handleSelect(p.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSelect(p.id); }}
      >
        <div className={styles.projectItemContent}>
          {renaming === p.id ? (
            <input
              ref={renameInputRef}
              className={styles.renameInput}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => handleRenameKeyDown(e, p.id)}
              onBlur={() => commitRename(p.id)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <div className={styles.projectItemTitle}>{p.title || 'New Project'}</div>
              <div className={styles.projectItemTime}>Updated {relativeTime(p.updatedAt)}</div>
            </>
          )}
        </div>

        <div className={styles.itemActions}>
          <button
            className={styles.actionIconBtn}
            onClick={(e) => startRename(e, p)}
            title="Rename"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          </button>
          <button
            className={`${styles.actionIconBtn} ${styles.actionIconDanger}`}
            onClick={(e) => startDelete(e, p.id)}
            title="Delete"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div className={styles.trigger}>
        <button className={styles.triggerBtn} onClick={toggleDropdown}>
          <span className={styles.labelDefault}>Hermes</span>
          <span className={styles.labelHover}>Projects</span>
        </button>
        <span className={styles.sep}>/</span>
        <span className={styles.titleWrap}>
          <span className={styles.projectTitle}>{projectTitle || 'New Project'}</span>
          {getMarkdown && (
            <button
              className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                const md = getMarkdown();
                if (md) {
                  navigator.clipboard.writeText(md).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  });
                }
              }}
              title={copied ? 'Copied!' : 'Copy markdown'}
            >
              {copied ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5l3.5 3.5 6.5-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10.5 5.5V3.5a1.5 1.5 0 00-1.5-1.5H3.5A1.5 1.5 0 002 3.5V9a1.5 1.5 0 001.5 1.5h2" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              )}
            </button>
          )}
        </span>
      </div>

      {open && (
        <div className={styles.menu}>
          <div className={styles.menuHeader}>
            <span className={styles.menuHeaderLabel}>Projects</span>
            <button
              className={styles.createBtn}
              onClick={handleCreate}
              disabled={creating}
              title="New project"
            >
              +
            </button>
          </div>

          {projects === null ? (
            <div className={styles.menuLoading}>Loading...</div>
          ) : otherProjects.length === 0 ? (
            <div className={styles.menuEmpty}>No other projects</div>
          ) : (
            <div className={`${styles.projectList} ${expanded ? styles.projectListScrollable : ''}`}>
              {visibleProjects.map(renderProjectItem)}
            </div>
          )}

          {hasMore && !expanded && (
            <button className={styles.viewMore} onClick={() => setExpanded(true)}>
              View More Projects
            </button>
          )}
        </div>
      )}
    </div>
  );
}
