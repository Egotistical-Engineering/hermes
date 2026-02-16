import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import styles from './App.module.css';
import useAuth from './hooks/useAuth';

const FocusPage = lazy(() => import('./pages/FocusPage/FocusPage'));
const LoginPage = lazy(() => import('./pages/LoginPage/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage/SignupPage'));
const AuthConfirmPage = lazy(() => import('./pages/AuthConfirmPage/AuthConfirmPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage/ResetPasswordPage'));

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
        const { fetchWritingProjects, createWritingProject, seedEssayProject } = await import('@hermes/api');
        const projects = await fetchWritingProjects();
        if (cancelled) return;

        if (projects.length > 0) {
          navigate(`/projects/${projects[0].id}`, { replace: true });
        } else {
          try { await seedEssayProject(session.user.id); } catch { /* continue */ }
          const project = await createWritingProject('Your First Project', session.user.id);
          if (cancelled) return;
          navigate(`/projects/${project.id}`, { replace: true });
        }
      } catch {
        if (!cancelled) setFallback(true);
      }
    })();

    return () => { cancelled = true; };
  }, [session, navigate]);

  // Non-logged-in users get the editor with no project
  if (fallback) return <FocusPage />;
  return <main />;
}

export default function App() {
  return (
    <div className={styles.app}>
      <Suspense fallback={<main />}>
        <Routes>
          <Route path="/" element={<RedirectToLatestProject />} />
          <Route path="/projects/:projectId" element={<FocusPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
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
