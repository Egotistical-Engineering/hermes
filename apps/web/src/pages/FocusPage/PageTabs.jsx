import styles from './PageTabs.module.css';

const TAB_COLORS = [
  { key: 'coral', hex: '#e07a5f' },
  { key: 'amber', hex: '#e0a05f' },
  { key: 'sage', hex: '#6b9e7a' },
  { key: 'sky', hex: '#5f8fc9' },
  { key: 'lavender', hex: '#9a7ec8' },
];

export const TAB_KEYS = TAB_COLORS.map((t) => t.key);

export const EMPTY_PAGES = Object.fromEntries(TAB_KEYS.map((k) => [k, '']));

export default function PageTabs({ activeTab, onTabChange, pages }) {
  return (
    <div className={styles.tabs}>
      {TAB_COLORS.map(({ key, hex }) => {
        const isActive = key === activeTab;
        const hasContent = !!(pages[key] && pages[key].trim());
        const className = [
          styles.tab,
          isActive ? styles.tabActive : '',
          !isActive && !hasContent ? styles.tabEmpty : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={key}
            className={className}
            style={{ background: hex }}
            onClick={() => onTabChange(key)}
            aria-label={`${key} tab${isActive ? ' (active)' : ''}${hasContent ? '' : ' (empty)'}`}
          />
        );
      })}
    </div>
  );
}
