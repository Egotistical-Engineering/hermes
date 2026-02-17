import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchPublishedEssay } from '@hermes/api';
import MarkdownText from '../../components/MarkdownText/MarkdownText';
import styles from './ReadPage.module.css';

const TAB_COLORS = {
  coral: '#e07a5f',
  amber: '#e0a05f',
  sage: '#6b9e7a',
  sky: '#5f8fc9',
  lavender: '#9a7ec8',
};

function formatDate(isoDate) {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function ReadPage() {
  const { shortId, slug } = useParams();
  const navigate = useNavigate();
  const [essay, setEssay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(null);

  useEffect(() => {
    if (!shortId) return;

    let cancelled = false;

    fetchPublishedEssay(shortId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setEssay(null);
          setLoading(false);
          return;
        }

        // Redirect to canonical URL if slug doesn't match
        if (slug !== data.slug) {
          navigate(`/read/${data.shortId}/${data.slug}`, { replace: true });
          return;
        }

        setEssay(data);
        // Default to first published tab
        if (data.publishedTabs.length > 0) {
          setActiveTab(data.publishedTabs[0]);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setEssay(null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [shortId, slug, navigate]);

  if (loading) {
    return <div className={styles.centered}>Loading...</div>;
  }

  if (!essay) {
    return (
      <div className={styles.centered}>
        <div className={styles.notFound}>
          <h1>Not Found</h1>
          <p>This post may have been unpublished or doesn&apos;t exist.</p>
        </div>
      </div>
    );
  }

  const visibleTabs = essay.publishedTabs.filter((tab) => essay.pages[tab]?.trim());
  const showTabs = visibleTabs.length > 1;
  const currentContent = activeTab ? essay.pages[activeTab] || '' : '';

  return (
    <div className={styles.page}>
      <article className={styles.article}>
        <header className={styles.header}>
          <h1 className={styles.title}>{essay.title}</h1>
          <div className={styles.meta}>
            {essay.authorName && <span>{essay.authorName}</span>}
            {essay.publishedAt && <span>{formatDate(essay.publishedAt)}</span>}
          </div>
        </header>

        {showTabs && (
          <div className={styles.tabs}>
            {visibleTabs.map((tab) => (
              <button
                key={tab}
                className={`${styles.tab} ${tab === activeTab ? styles.tabActive : ''}`}
                style={{ backgroundColor: TAB_COLORS[tab] || '#999' }}
                onClick={() => setActiveTab(tab)}
                aria-label={`${tab} tab${tab === activeTab ? ' (active)' : ''}`}
              />
            ))}
          </div>
        )}

        <div className={styles.body}>
          <MarkdownText value={currentContent} />
        </div>

        <footer className={styles.footer}>
          Written with <a href="https://dearhermes.com" target="_blank" rel="noopener noreferrer">Hermes</a>
        </footer>
      </article>
    </div>
  );
}
