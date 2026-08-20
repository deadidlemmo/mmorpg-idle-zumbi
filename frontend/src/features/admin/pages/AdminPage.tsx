import {
  Activity,
  ArrowLeft,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAdminSummary,
  getAdminUsers,
  setAdminUserSuspension,
  type AdminSummary,
  type AdminUser,
} from '../api/admin.api';
import '../styles/admin.css';

function formatDate(value?: string | null) {
  if (!value) return 'Nunca';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AdminPage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [summaryResponse, usersResponse] = await Promise.all([
        getAdminSummary(),
        getAdminUsers(appliedSearch),
      ]);
      setSummary(summaryResponse);
      setUsers(usersResponse.users);
    } catch {
      setError('Nao foi possivel carregar os dados administrativos.');
    } finally {
      setIsLoading(false);
    }
  }, [appliedSearch]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const metricCards = useMemo(() => {
    if (!summary) return [];
    const counts = summary.counts;
    return [
      { label: 'Contas', value: counts.users, icon: Users },
      { label: 'Personagens', value: counts.characters, icon: ShieldCheck },
      {
        label: 'Atividades ativas',
        value:
          counts.activeAutoCombats +
          counts.activeGathering +
          counts.activeCrafting +
          counts.activeIncursions +
          counts.activeWorldBossParticipants,
        icon: Activity,
      },
      { label: 'Suspensas', value: counts.suspendedUsers, icon: ShieldOff },
    ];
  }, [summary]);

  async function saveSuspension() {
    if (!selectedUser) return;
    setIsSaving(true);
    setError(null);

    try {
      await setAdminUserSuspension(
        selectedUser.id,
        !selectedUser.isSuspended,
        reason,
      );
      setSelectedUser(null);
      setReason('');
      await load();
    } catch {
      setError('Nao foi possivel atualizar a conta.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <Link className="admin-back" to="/characters">
            <ArrowLeft size={17} /> Personagens
          </Link>
          <h1>Operacao do jogo</h1>
          <p>Contas, atividades e trilha de auditoria.</p>
        </div>
        <button className="admin-icon-button" type="button" onClick={() => void load()} title="Atualizar">
          <RefreshCw size={18} />
        </button>
      </header>

      {error ? <div className="form-error-box">{error}</div> : null}

      <section className="admin-metrics" aria-label="Resumo operacional">
        {metricCards.map(({ label, value, icon: Icon }) => (
          <article className="admin-metric" key={label}>
            <Icon size={18} />
            <strong>{new Intl.NumberFormat('pt-BR').format(value)}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div>
            <h2>Contas</h2>
            <p>Suspensoes revogam imediatamente todos os tokens ativos.</p>
          </div>
          <form
            className="admin-search"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedSearch(search.trim());
            }}
          >
            <Search size={17} />
            <input
              value={search}
              placeholder="Buscar e-mail"
              onChange={(event) => setSearch(event.target.value)}
            />
          </form>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Conta</th>
                <th>Personagens</th>
                <th>Ultimo acesso</th>
                <th>Status</th>
                <th aria-label="Acoes" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.email}</strong>
                    <span>{user.role}</span>
                  </td>
                  <td>{user._count.characters}</td>
                  <td>{formatDate(user.lastLoginAt)}</td>
                  <td>
                    <span className={user.isSuspended ? 'admin-status is-suspended' : 'admin-status'}>
                      {user.isSuspended ? 'Suspensa' : 'Ativa'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="admin-row-action"
                      type="button"
                      onClick={() => {
                        setSelectedUser(user);
                        setReason(user.suspensionReason ?? '');
                      }}
                    >
                      {user.isSuspended ? 'Restaurar' : 'Suspender'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && users.length === 0 ? (
            <p className="admin-empty">Nenhuma conta encontrada.</p>
          ) : null}
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div>
            <h2>Auditoria recente</h2>
            <p>Mutacoes sensiveis registradas no backend.</p>
          </div>
        </div>
        <div className="admin-audit-list">
          {summary?.recentAuditLogs.map((log) => (
            <article key={log.id}>
              <strong>{log.action}</strong>
              <span>{log.actor?.email ?? 'Sistema'}</span>
              <time>{formatDate(log.createdAt)}</time>
            </article>
          ))}
        </div>
      </section>

      {selectedUser ? (
        <div className="admin-modal-backdrop" role="presentation">
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
            <h2 id="admin-modal-title">
              {selectedUser.isSuspended ? 'Restaurar conta' : 'Suspender conta'}
            </h2>
            <p>{selectedUser.email}</p>
            {!selectedUser.isSuspended ? (
              <label>
                Motivo
                <textarea
                  value={reason}
                  maxLength={300}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            ) : null}
            <div className="admin-modal-actions">
              <button type="button" onClick={() => setSelectedUser(null)} disabled={isSaving}>
                Cancelar
              </button>
              <button type="button" className="is-danger" onClick={() => void saveSuspension()} disabled={isSaving || (!selectedUser.isSuspended && !reason.trim())}>
                Confirmar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
