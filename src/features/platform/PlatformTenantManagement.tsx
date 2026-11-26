import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { PlatformTenant } from "../../api/compilecare";
import {
  activatePlatformTenant,
  closePlatformTenant,
  createPlatformTenant,
  listPlatformTenants,
  provisionInitialTenantAdministrator,
  suspendPlatformTenant
} from "../../api/compilecare";

interface Props {
  baseUrl: string;
  accessToken: string;
  currentIssuer: string;
  onBusyChange: (busy: boolean) => void;
}

type LifecycleAction = "suspend" | "close";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "The platform tenant operation could not be completed.";
}

function slugify(value: string): string {
  return value.normalize("NFKD").toLowerCase().trim()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function statusClass(status: string): string {
  switch (status) {
    case "Active": return "platform-status platform-status-active";
    case "Suspended": return "platform-status platform-status-suspended";
    case "Closed": return "platform-status platform-status-closed";
    default: return "platform-status platform-status-provisioning";
  }
}

export function PlatformTenantManagement({ baseUrl, accessToken, currentIssuer, onBusyChange }: Props) {
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [initialAdminSubjects, setInitialAdminSubjects] = useState<Record<string, string>>({});
  const [confirmTarget, setConfirmTarget] = useState<{ tenant: PlatformTenant; action: LifecycleAction } | null>(null);

  async function refreshTenants() {
    setLoading(true);
    setError("");
    try {
      const result = await listPlatformTenants(baseUrl, accessToken, page);
      setTenants(result.items);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    listPlatformTenants(baseUrl, accessToken, page)
      .then(result => {
        if (!active) return;
        setTenants(result.items);
        setTotalCount(result.totalCount);
        setTotalPages(result.totalPages);
      })
      .catch(cause => { if (active) setError(getErrorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [baseUrl, accessToken, page]);

  async function runOperation(action: () => Promise<void>, message: string) {
    setBusy(true);
    onBusyChange(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      setConfirmTarget(null);
      await refreshTenants();
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const safeName = name.trim();
    const safeSlug = slugify(slug);
    if (!safeName || !safeSlug) {
      setError("Enter a tenant name and a valid URL-safe slug.");
      return;
    }
    await runOperation(async () => {
      await createPlatformTenant(baseUrl, accessToken, safeName, safeSlug);
      setName("");
      setSlug("");
      setSlugTouched(false);
    }, "Tenant created in Provisioning state. Add its initial administrator to activate it.");
  }

  async function provisionAndActivate(tenant: PlatformTenant) {
    const subject = (initialAdminSubjects[tenant.id] ?? "").trim();
    if (!currentIssuer || !subject) {
      setError("Enter the initial administrator's exact OIDC subject.");
      return;
    }
    await runOperation(async () => {
      await provisionInitialTenantAdministrator(baseUrl, accessToken, tenant.id, currentIssuer, subject);
      await activatePlatformTenant(baseUrl, accessToken, tenant.id);
      setInitialAdminSubjects(current => ({ ...current, [tenant.id]: "" }));
    }, "Initial HospitalAdmin provisioned and tenant activated.");
  }

  async function confirmLifecycleChange() {
    if (!confirmTarget) return;
    const target = confirmTarget;
    await runOperation(async () => {
      if (target.action === "suspend") await suspendPlatformTenant(baseUrl, accessToken, target.tenant.id);
      else await closePlatformTenant(baseUrl, accessToken, target.tenant.id);
    }, target.action === "suspend" ? "Tenant suspended." : "Tenant closed permanently.");
  }

  async function activateSuspendedTenant(tenant: PlatformTenant) {
    await runOperation(async () => {
      await activatePlatformTenant(baseUrl, accessToken, tenant.id);
    }, "Tenant reactivated.");
  }

  return <section className="section platform-tenant-section" id="platform-tenants">
    <div className="section-heading"><div><label>COMPILECARE PLATFORM</label><h2>Tenant lifecycle administration</h2><p className="helper-text">Global customer tenant operations. Every action is protected by the persisted PlatformOperator policy and recorded by the API audit pipeline.</p></div></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {success && <p className="registration-success" role="status">{success}</p>}

    <div className="search-panel platform-create-panel">
      <div className="platform-panel-heading"><div><h3>Create a tenant</h3><p className="helper-text">New tenants start in Provisioning. They cannot use tenant-scoped APIs until the initial HospitalAdmin is provisioned and the tenant is activated.</p></div></div>
      <form className="platform-create-form" onSubmit={submitCreate}>
        <div><label htmlFor="platform-tenant-name">Tenant name *</label><input id="platform-tenant-name" value={name} onChange={event=>{setName(event.target.value);if(!slugTouched)setSlug(slugify(event.target.value));}} maxLength={160} required disabled={busy}/></div>
        <div><label htmlFor="platform-tenant-slug">Tenant slug *</label><input id="platform-tenant-slug" value={slug} onChange={event=>{setSlug(event.target.value);setSlugTouched(true);}} maxLength={63} required disabled={busy}/><small>Lowercase letters, numbers and hyphens; maximum 63 characters and must be unique.</small></div>
        <div className="platform-form-actions"><button type="submit" disabled={busy || !name.trim() || !slugify(slug)}>{busy ? "Saving…" : "Create tenant"}</button></div>
      </form>
    </div>

    <div className="platform-list-panel">
      <div className="platform-panel-heading"><div><h3>Registered tenants</h3><p className="helper-text">{totalCount} tenant{totalCount === 1 ? "" : "s"} across the CompileCare platform</p></div><button type="button" className="clinical-secondary" onClick={refreshTenants} disabled={loading || busy}>Refresh</button></div>
      {loading ? <p className="inline-status" role="status">Loading platform tenants…</p> : tenants.length === 0 ? <p className="inline-status">No tenants have been registered yet.</p> :
        <div className="platform-tenant-list">{tenants.map(tenant => <article className="platform-tenant-card" key={tenant.id}>
          <div className="platform-tenant-card-header"><div><h4>{tenant.name}</h4><code>{tenant.slug}</code></div><span className={statusClass(tenant.status)}>{tenant.status}</span></div>
          <dl className="platform-tenant-meta"><div><dt>Tenant ID</dt><dd>{tenant.id}</dd></div><div><dt>Created</dt><dd>{formatDate(tenant.createdAtUtc)}</dd></div><div><dt>Updated</dt><dd>{formatDate(tenant.updatedAtUtc)}</dd></div></dl>
          {tenant.status === "Provisioning" && <div className="platform-provision-panel">
            <p>Create the identity in your configured OIDC provider first, then enter its exact subject. CompileCare creates the tenant membership; it does not create identity-provider users.</p>
            <label htmlFor={`initial-admin-${tenant.id}`}>Initial administrator OIDC subject</label>
            <input id={`initial-admin-${tenant.id}`} value={initialAdminSubjects[tenant.id] ?? ""} onChange={event=>setInitialAdminSubjects(current=>({...current,[tenant.id]:event.target.value}))} maxLength={255} disabled={busy}/>
            <div className="platform-form-actions"><button type="button" onClick={()=>provisionAndActivate(tenant)} disabled={busy || !currentIssuer || !(initialAdminSubjects[tenant.id] ?? "").trim()}>Provision administrator and activate</button><button type="button" className="queue-action-danger" onClick={()=>setConfirmTarget({tenant,action:"close"})} disabled={busy}>Close tenant</button></div>
          </div>}
          {tenant.status === "Active" && <div className="platform-tenant-actions">
            <button type="button" className="clinical-secondary" onClick={()=>setConfirmTarget({tenant,action:"suspend"})} disabled={busy}>Suspend tenant</button>
            <button type="button" className="queue-action-danger" onClick={()=>setConfirmTarget({tenant,action:"close"})} disabled={busy}>Close tenant</button>
          </div>}
          {tenant.status === "Suspended" && <div className="platform-tenant-actions">
            <button type="button" onClick={()=>activateSuspendedTenant(tenant)} disabled={busy}>Reactivate tenant</button>
            <button type="button" className="queue-action-danger" onClick={()=>setConfirmTarget({tenant,action:"close"})} disabled={busy}>Close tenant</button>
          </div>}
          {tenant.status === "Closed" && <p className="platform-terminal-note">Closed tenants are terminal and cannot be reactivated.</p>}
          {confirmTarget?.tenant.id === tenant.id && <div className="platform-confirm" role="group" aria-labelledby={`platform-confirm-${tenant.id}`}>
            <p id={`platform-confirm-${tenant.id}`}>{confirmTarget.action === "close" ? "Permanently close" : "Suspend"} <strong>{tenant.name}</strong>? {confirmTarget.action === "close" ? "This action is terminal and cannot be undone." : "Tenant users will lose access until the tenant is reactivated."}</p>
            <div className="platform-form-actions"><button type="button" className="queue-action-danger" onClick={confirmLifecycleChange} disabled={busy}>{confirmTarget.action === "close" ? "Confirm close" : "Confirm suspension"}</button><button type="button" className="clinical-secondary" onClick={()=>setConfirmTarget(null)} disabled={busy}>Cancel</button></div>
          </div>}
        </article>)}</div>}
      {totalPages > 1 && <div className="pagination"><button type="button" onClick={()=>setPage(current=>Math.max(1,current-1))} disabled={loading||page<=1}>Previous</button><span>Page {page} of {totalPages}</span><button type="button" onClick={()=>setPage(current=>Math.min(totalPages,current+1))} disabled={loading||page>=totalPages}>Next</button></div>}
    </div>
  </section>;
}
