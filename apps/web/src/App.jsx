import { Toaster } from 'react-hot-toast';
import styles from './App.module.css';
import FocusPage from './pages/FocusPage/FocusPage';

export default function App() {
  return (
    <div className={styles.app}>
      <FocusPage />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            fontSize: 'var(--font-sm)',
          },
        }}
      />
    </div>
  );
}
