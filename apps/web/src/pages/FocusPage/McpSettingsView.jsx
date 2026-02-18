import { useCallback, useEffect, useState } from 'react';
import {
  fetchMcpServers,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  testMcpServer,
} from '@hermes/api';
import styles from './UserMenu.module.css';

export default function McpSettingsView({ session, onBack }) {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add form state
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState('');
  const [addError, setAddError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Test state: { [serverId]: { status, message } }
  const [testResults, setTestResults] = useState({});

  const token = session?.access_token;

  const loadServers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchMcpServers(token);
      setServers(data);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load servers');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAddError('');
    setSubmitting(true);

    let parsedHeaders = {};
    if (headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch {
        setAddError('Headers must be valid JSON');
        setSubmitting(false);
        return;
      }
    }

    try {
      await createMcpServer(token, { name, url, headers: parsedHeaders });
      setName('');
      setUrl('');
      setHeaders('');
      await loadServers();
    } catch (err) {
      setAddError(err.message || 'Failed to add server');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (server) => {
    try {
      await updateMcpServer(token, server.id, { enabled: !server.enabled });
      await loadServers();
    } catch {
      // Silently fail — user can retry
    }
  };

  const handleDelete = async (server) => {
    try {
      await deleteMcpServer(token, server.id);
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[server.id];
        return next;
      });
      await loadServers();
    } catch {
      // Silently fail
    }
  };

  const handleTest = async (server) => {
    setTestResults((prev) => ({
      ...prev,
      [server.id]: { status: 'testing', message: 'Connecting...' },
    }));

    try {
      const result = await testMcpServer(token, server.id);
      if ('tools' in result) {
        setTestResults((prev) => ({
          ...prev,
          [server.id]: {
            status: 'success',
            message: `Connected — ${result.tools.length} tool${result.tools.length !== 1 ? 's' : ''}`,
          },
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [server.id]: { status: 'error', message: result.error },
        }));
      }
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [server.id]: { status: 'error', message: err.message || 'Test failed' },
      }));
    }
  };

  const truncateUrl = (u) => {
    try {
      const parsed = new URL(u);
      const display = parsed.hostname + parsed.pathname;
      return display.length > 35 ? display.slice(0, 35) + '...' : display;
    } catch {
      return u.length > 35 ? u.slice(0, 35) + '...' : u;
    }
  };

  return (
    <div className={styles.mcpView}>
      <div className={styles.mcpTitle}>
        MCP Servers <span className={styles.betaBadge}>beta</span>
      </div>

      {loading ? (
        <div className={styles.mcpEmpty}>Loading...</div>
      ) : error ? (
        <div className={styles.mcpError}>{error}</div>
      ) : (
        <>
          {servers.length === 0 ? (
            <div className={styles.mcpEmpty}>No servers configured</div>
          ) : (
            <div className={styles.mcpServerList}>
              {servers.map((server) => (
                <div key={server.id} className={styles.mcpServerRow}>
                  <div className={styles.mcpServerInfo}>
                    <div className={styles.mcpServerName}>{server.name}</div>
                    <div className={styles.mcpServerUrl}>{truncateUrl(server.url)}</div>
                    {testResults[server.id] && (
                      <div
                        className={
                          testResults[server.id].status === 'success'
                            ? styles.mcpTestSuccess
                            : testResults[server.id].status === 'error'
                            ? styles.mcpTestError
                            : styles.mcpTestPending
                        }
                      >
                        {testResults[server.id].message}
                      </div>
                    )}
                  </div>
                  <div className={styles.mcpServerActions}>
                    <button
                      className={styles.mcpToggleBtn}
                      onClick={() => handleToggle(server)}
                      title={server.enabled ? 'Disable' : 'Enable'}
                    >
                      {server.enabled ? 'On' : 'Off'}
                    </button>
                    <button
                      className={styles.mcpActionBtn}
                      onClick={() => handleTest(server)}
                      title="Test connection"
                    >
                      Test
                    </button>
                    <button
                      className={`${styles.mcpActionBtn} ${styles.mcpDeleteBtn}`}
                      onClick={() => handleDelete(server)}
                      title="Remove server"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {servers.length < 10 && (
            <form className={styles.mcpAddForm} onSubmit={handleAdd}>
              <div className={styles.mcpAddTitle}>Add Server</div>
              <input
                className={styles.mcpInput}
                type="text"
                placeholder="Name (e.g. my-server)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <input
                className={styles.mcpInput}
                type="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
              <textarea
                className={styles.mcpInput}
                placeholder='Headers (JSON, optional)'
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                rows={2}
              />
              {addError && <div className={styles.mcpError}>{addError}</div>}
              <button
                type="submit"
                className={styles.mcpSubmitBtn}
                disabled={submitting}
              >
                {submitting ? 'Adding...' : 'Add Server'}
              </button>
            </form>
          )}
        </>
      )}

      <button className={styles.mcpBackBtn} onClick={onBack}>
        Back
      </button>
    </div>
  );
}
