import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import styles from './App.module.css';
import useAuth from './hooks/useAuth';
import EnvironmentBanner from './components/EnvironmentBanner/EnvironmentBanner';

const FocusPage = lazy(() => import('./pages/FocusPage/FocusPage'));
const ReadPage = lazy(() => import('./pages/ReadPage/ReadPage'));
const AuthConfirmPage = lazy(() => import('./pages/AuthConfirmPage/AuthConfirmPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage/ResetPasswordPage'));
const SignupPage = lazy(() => import('./pages/SignupPage/SignupPage'));
const LoginPage = lazy(() => import('./pages/LoginPage/LoginPage'));
const UpgradePage = lazy(() => import('./pages/UpgradePage/UpgradePage'));

function NotFound() {
  return (
    <main style={{ padding: 'var(--content-padding)', textAlign: 'center', marginTop: '80px' }}>
      <h1 style={{ fontSize: 'var(--font-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', marginBottom: '8px' }}>Page not found</h1>
      <p style={{ fontSize: 'var(--font-base)', color: 'var(--text-muted)' }}>The page you&apos;re looking for doesn&apos;t exist.</p>
    </main>
  );
}

function RedirectToLatestProject() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) {
      // Not logged in — show the editor with no project (freeform mode)
      setFallback(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { fetchWritingProjects, createWritingProject, seedEssayProject, seedWelcomeProject, WELCOME_PAGES } = await import('@hermes/api');
        const projects = await fetchWritingProjects();
        if (cancelled) return;

        if (projects.length > 0) {
          navigate(`/projects/${projects[0].id}`, { replace: true });
        } else {
          // First login — seed Welcome + Essay projects
          // Check if the user wrote custom content before signing up
          let customPages;
          try {
            const raw = localStorage.getItem('hermes-welcome-pages');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const hasCustomContent = Object.keys(parsed).some(
                  (key) => parsed[key] !== (WELCOME_PAGES[key] ?? ''),
                );
                if (hasCustomContent) customPages = parsed;
              }
            }
          } catch { /* malformed localStorage — fall through to default seed */ }

          let welcomeProject;
          try { welcomeProject = await seedWelcomeProject(session.user.id, customPages); } catch { /* continue */ }
          try { await seedEssayProject(session.user.id); } catch { /* continue */ }
          if (cancelled) return;

          // Clean up localStorage after successful migration
          if (welcomeProject && customPages) {
            try { localStorage.removeItem('hermes-welcome-pages'); } catch { /* ignore */ }
          }

          if (welcomeProject) {
            navigate(`/projects/${welcomeProject.id}`, { replace: true });
          } else {
            const project = await createWritingProject('Your First Project', session.user.id);
            if (cancelled) return;
            navigate(`/projects/${project.id}`, { replace: true });
          }
        }
      } catch {
        if (!cancelled) setFallback(true);
      }
    })();

    return () => { cancelled = true; };
  }, [session, navigate]);

  // Non-logged-in users get the editor with no project
  if (fallback) return <FocusPage />;
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '120px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: '40%', height: 24, background: 'var(--bg-hover)', borderRadius: 4 }} />
        <div style={{ width: '80%', height: 14, background: 'var(--bg-hover)', borderRadius: 4 }} />
        <div style={{ width: '60%', height: 14, background: 'var(--bg-hover)', borderRadius: 4 }} />
      </div>
    </main>
  );
}

export default function App() {
  return (
    <div className={styles.app}>
      <EnvironmentBanner />
      <Suspense fallback={
        <main style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
          <div style={{ maxWidth: 700, margin: '0 auto', padding: '120px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ width: '40%', height: 24, background: 'var(--bg-hover)', borderRadius: 4 }} />
            <div style={{ width: '80%', height: 14, background: 'var(--bg-hover)', borderRadius: 4 }} />
            <div style={{ width: '60%', height: 14, background: 'var(--bg-hover)', borderRadius: 4 }} />
          </div>
        </main>
      }>
        <Routes>
          <Route path="/" element={<RedirectToLatestProject />} />
          <Route path="/projects/:projectId" element={<FocusPage />} />
          <Route path="/read/:shortId/:slug" element={<ReadPage />} />
          <Route path="/read/:shortId" element={<ReadPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<Navigate to="/" replace />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/upgrade" element={<UpgradePage />} />
          <Route path="/auth/confirm" element={<AuthConfirmPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
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
