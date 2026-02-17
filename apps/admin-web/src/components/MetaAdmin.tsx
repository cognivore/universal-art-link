import React, { useState, useEffect, useCallback } from 'react';
import { metaApi, type TenantInfo, type DomainInfo } from '../api.js';

// ── Tenant list ─────────────────────────────────────────────────────

const TenantList: React.FC<{
  tenants: TenantInfo[];
  selected: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}> = ({ tenants, selected, onSelect, onRefresh }) => (
  <div className="tenant-list">
    <div className="tenant-list-header">
      <h3>Tenants ({tenants.length})</h3>
      <button type="button" className="nav-add" onClick={onRefresh} title="Refresh">↻</button>
    </div>
    {tenants.map((t) => (
      <button
        key={t.id}
        type="button"
        className={`tenant-item ${selected === t.id ? 'tenant-item--active' : ''}`}
        onClick={() => onSelect(t.id)}
      >
        <span className="tenant-slug">{t.slug}</span>
        <span className={`status-dot status-dot--${t.status}`} />
        <span className="tenant-domain">{t.primaryDomain ?? 'no domain'}</span>
      </button>
    ))}
  </div>
);

// ── Create tenant form ──────────────────────────────────────────────

const CreateTenantForm: React.FC<{ onCreated: () => void }> = ({ onCreated }) => {
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [domain, setDomain] = useState('');
  const [mode, setMode] = useState<'self_host' | 'hosted'>('self_host');
  const [provision, setProvision] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await metaApi.createTenant({
        slug,
        ownerEmail: email,
        domain: domain || undefined,
        mode,
        provision,
      });
      setSuccess(`Created tenant "${result.tenant.slug}" with owner ${result.owner.email}`);
      setSlug('');
      setEmail('');
      setDomain('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tenant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="create-tenant-form" onSubmit={handleSubmit}>
      <h3>Create New Tenant</h3>

      <label>
        Slug (URL identifier)
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="my-site"
          required
        />
      </label>

      <label>
        Owner Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="owner@example.com"
          required
        />
      </label>

      <label>
        Domain (optional)
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="mysite.okashi-school.com"
        />
      </label>

      <label>
        Mode
        <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="self_host">Self-host (single owner)</option>
          <option value="hosted">Hosted (multi-tenant)</option>
        </select>
      </label>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={provision}
          onChange={(e) => setProvision(e.target.checked)}
        />
        Auto-provision DNS + Caddy
      </label>

      {error && <p className="error-msg">{error}</p>}
      {success && <p className="success-msg">{success}</p>}

      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Creating...' : 'Create Tenant'}
      </button>
    </form>
  );
};

// ── Tenant detail ───────────────────────────────────────────────────

const TenantDetail: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);
  const [domainError, setDomainError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTenant(await metaApi.getTenant(tenantId));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const addDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain) return;
    setAddingDomain(true);
    setDomainError('');
    try {
      await metaApi.addDomain(tenantId, newDomain);
      setNewDomain('');
      await load();
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAddingDomain(false);
    }
  };

  if (loading) return <p>Loading...</p>;
  if (!tenant) return <p>Tenant not found.</p>;

  return (
    <div className="tenant-detail">
      <h3>{tenant.slug}</h3>

      <dl className="detail-grid">
        <dt>ID</dt><dd><code>{tenant.id}</code></dd>
        <dt>Status</dt>
        <dd><span className={`status-badge status-badge--${tenant.status === 'active' ? 'success' : 'warning'}`}>{tenant.status}</span></dd>
        <dt>Mode</dt><dd>{tenant.mode}</dd>
        <dt>Primary Domain</dt><dd>{tenant.primaryDomain ?? '—'}</dd>
      </dl>

      <h4>Domains</h4>
      {tenant.domains && tenant.domains.length > 0 ? (
        <table className="mini-table">
          <thead><tr><th>Hostname</th><th>Status</th><th>Added</th></tr></thead>
          <tbody>
            {tenant.domains.map((d: DomainInfo) => (
              <tr key={d.id}>
                <td><code>{d.hostname}</code></td>
                <td><span className={`status-dot status-dot--${d.status}`} /> {d.status}</td>
                <td>{new Date(d.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty-state">No domains configured</p>
      )}

      <form className="inline-form" onSubmit={addDomain}>
        <input
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="newdomain.com"
        />
        <button type="submit" disabled={addingDomain}>
          {addingDomain ? 'Adding...' : '+ Add Domain'}
        </button>
      </form>
      {domainError && <p className="error-msg">{domainError}</p>}

      <h4>Stripe</h4>
      {tenant.stripe ? (
        <dl className="detail-grid">
          <dt>Mode</dt><dd>{tenant.stripe.mode}</dd>
          {tenant.stripe.accountId && <><dt>Account</dt><dd><code>{tenant.stripe.accountId}</code></dd></>}
        </dl>
      ) : (
        <p className="empty-state">No Stripe connection</p>
      )}
    </div>
  );
};

// ── Main MetaAdmin panel ────────────────────────────────────────────

export const MetaAdmin: React.FC = () => {
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'list' | 'create'>('list');

  const loadTenants = useCallback(async () => {
    try {
      setTenants(await metaApi.listTenants());
    } catch {
      // meta_admin check may fail silently
    }
  }, []);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  return (
    <div className="panel meta-admin">
      <h2>Platform Admin</h2>

      <div className="meta-tabs">
        <button
          type="button"
          className={tab === 'list' ? 'meta-tab--active' : ''}
          onClick={() => setTab('list')}
        >
          Tenants
        </button>
        <button
          type="button"
          className={tab === 'create' ? 'meta-tab--active' : ''}
          onClick={() => setTab('create')}
        >
          + New Tenant
        </button>
      </div>

      {tab === 'create' && (
        <CreateTenantForm onCreated={() => { loadTenants(); setTab('list'); }} />
      )}

      {tab === 'list' && (
        <div className="meta-split">
          <TenantList
            tenants={tenants}
            selected={selectedId}
            onSelect={setSelectedId}
            onRefresh={loadTenants}
          />
          <div className="meta-detail">
            {selectedId ? (
              <TenantDetail tenantId={selectedId} />
            ) : (
              <p className="empty-state">Select a tenant to view details</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
