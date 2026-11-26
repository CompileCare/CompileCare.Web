import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, createPatientIdentifierPolicy, getPatientIdentifierPolicy } from "../../api/compilecare";
import type { PatientIdentifierPolicy } from "../../api/compilecare";

interface Props {
  baseUrl: string;
  accessToken: string;
  tenantId: string;
  hospitalId: string;
  hospitalName: string;
  canRead: boolean;
  canManage: boolean;
  onBusyChange: (busy: boolean) => void;
}

function message(error: unknown): string {
  if (error instanceof ApiError) return error.status === 404
    ? "No MRN policy has been configured for this hospital yet."
    : error.message;
  return error instanceof Error ? error.message : "The MRN policy request could not be completed.";
}

export function PatientIdentifierPolicyManagement({
  baseUrl, accessToken, tenantId, hospitalId, hospitalName, canRead, canManage, onBusyChange
}: Props) {
  const [policy, setPolicy] = useState<PatientIdentifierPolicy | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [numberLength, setNumberLength] = useState("6");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    let active = true;
    setPolicy(null);
    setError("");
    setNotice("");
    setNotConfigured(false);
    if (!canRead && !canManage) return () => { active = false; };
    setLoading(true);
    getPatientIdentifierPolicy(baseUrl, accessToken, tenantId, hospitalId)
      .then(value => { if (active) { setPolicy(value); setNotConfigured(false); } })
      .catch(cause => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 404) setNotConfigured(true);
        else setError(message(cause));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [baseUrl, accessToken, tenantId, hospitalId, canRead, canManage]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || saving) return;
    setSaving(true); onBusyChange(true); setError(""); setNotice("");
    try {
      const created = await createPatientIdentifierPolicy(baseUrl, accessToken, tenantId, hospitalId, {
        prefix: prefix.trim().toUpperCase(), numberLength: Number(numberLength)
      });
      setPolicy(created);
      setNotConfigured(false);
      setNotice("MRN policy created. The initial sequence is ready for patient registration.");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false); onBusyChange(false);
    }
  }

  return <section className="section mrn-policy-section" id="mrn-policy">
    <div className="section-heading"><div><label>PATIENT IDENTIFIERS</label><h2>Medical record number policy</h2><p className="helper-text">Configure the hospital-specific MRN format. The initial policy is immutable after creation.</p></div></div>
    <div className="search-panel mrn-policy-panel">
      <div className="workflow-step"><span>MRN</span><div><strong>{hospitalName}</strong><small>Policy applies only to this selected hospital</small></div></div>
      {loading && <p className="inline-status" role="status">Loading the hospital MRN policy…</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p className="registration-success" role="status">{notice}</p>}
      {policy && <div className="mrn-policy-summary" aria-live="polite"><span>Configured MRN format</span><strong>{policy.prefix}{"1".padStart(policy.numberLength, "0")}</strong><small>Prefix: {policy.prefix} · Sequence length: {policy.numberLength} digits</small><p>The policy is active. Replacement is not supported in this release to prevent existing identifiers from becoming ambiguous.</p></div>}
      {!loading && notConfigured && canManage && <form className="mrn-policy-form" onSubmit={handleCreate}>
        <p className="helper-text">Choose a prefix and sequence length. The API validates the format and allows only one policy per hospital.</p>
        <div><label htmlFor="mrn-policy-prefix">MRN prefix</label><input id="mrn-policy-prefix" value={prefix} onChange={event => setPrefix(event.target.value.toUpperCase())} maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9\\-]{0,19}" placeholder="e.g. CC-AKH" required /></div>
        <div><label htmlFor="mrn-policy-length">Sequence digits</label><input id="mrn-policy-length" type="number" min="1" max="12" value={numberLength} onChange={event => setNumberLength(event.target.value)} required /></div>
        <p className="helper-text">Example: CC-AKH000001. The generated identifier must not exceed 40 characters.</p>
        <div className="registration-actions"><button type="submit" disabled={saving || !prefix.trim() || !numberLength}>{saving ? "Creating policy…" : "Create MRN policy"}</button></div>
      </form>}
      {!loading && notConfigured && !canManage && <p className="inline-status">No MRN policy is configured. Ask a HospitalAdmin with MRN policy management permission to create one.</p>}
    </div>
  </section>;
}
