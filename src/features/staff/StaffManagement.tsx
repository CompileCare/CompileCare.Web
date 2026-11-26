import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError, addStaffAssignment, createStaffProfile, endStaffAssignment,
  listStaffProfiles, setStaffProfileActive, updateStaffProfile
} from "../../api/compilecare";
import type { Department, StaffAssignment, StaffProfile } from "../../api/compilecare";

interface Props {
  baseUrl: string;
  accessToken: string;
  tenantId: string;
  hospitalId: string;
  hospitalName: string;
  departments: Department[];
  canRead: boolean;
  canManage: boolean;
  onBusyChange: (busy: boolean) => void;
}

const today = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
};

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "This staff record or assignment conflicts with an existing record. Refresh and review the current assignments.";
    return error.message;
  }
  return error instanceof Error ? error.message : "The staff request could not be completed.";
}

function fullName(staff: StaffProfile): string {
  return [staff.givenName, staff.middleName, staff.familyName].filter(Boolean).join(" ");
}

export function StaffManagement({
  baseUrl, accessToken, tenantId, hospitalId, hospitalName, departments, canRead, canManage, onBusyChange
}: Props) {
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [staffCode, setStaffCode] = useState("");
  const [givenName, setGivenName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [designation, setDesignation] = useState("");
  const [initialDepartmentId, setInitialDepartmentId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [editingId, setEditingId] = useState("");
  const [editGivenName, setEditGivenName] = useState("");
  const [editMiddleName, setEditMiddleName] = useState("");
  const [editFamilyName, setEditFamilyName] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const [assignmentStaffId, setAssignmentStaffId] = useState("");
  const [assignmentDepartmentId, setAssignmentDepartmentId] = useState("");
  const [assignmentDate, setAssignmentDate] = useState(today());
  const [endingAssignment, setEndingAssignment] = useState<{ staffId: string; assignment: StaffAssignment } | null>(null);
  const [assignmentEndDate, setAssignmentEndDate] = useState(today());
  const [confirmDeactivateId, setConfirmDeactivateId] = useState("");

  const visibleStaff = useMemo(() => staff.filter(profile =>
    profile.assignments.some(assignment => assignment.hospitalId === hospitalId)
  ), [staff, hospitalId]);

  async function refresh(nextQuery = appliedQuery) {
    if (!canRead) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const result = await listStaffProfiles(baseUrl, accessToken, tenantId, nextQuery || undefined);
      setStaff(result.items);
      setAppliedQuery(nextQuery);
      setConfirmDeactivateId("");
    } catch (cause) { setError(message(cause)); setStaff([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(""); }, [baseUrl, accessToken, tenantId, hospitalId, canRead]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || saving) return;
    setSaving(true); onBusyChange(true); setError(""); setNotice("");
    try {
      await createStaffProfile(baseUrl, accessToken, tenantId, {
        staffCode: staffCode.trim(), givenName: givenName.trim(), middleName: middleName.trim() || null,
        familyName: familyName.trim() || null, providerDesignation: designation.trim() || null,
        hospitalId, departmentId: initialDepartmentId || null, effectiveFrom
      });
      setStaffCode(""); setGivenName(""); setMiddleName(""); setFamilyName(""); setDesignation("");
      setInitialDepartmentId(""); setEffectiveFrom(today()); setCreateOpen(false);
      await refresh(appliedQuery);
      setNotice("Staff profile created and assigned to the selected hospital.");
    } catch (cause) { setError(message(cause)); }
    finally { setSaving(false); onBusyChange(false); }
  }

  function beginEdit(profile: StaffProfile) {
    setEditingId(profile.id);
    setEditGivenName(profile.givenName);
    setEditMiddleName(profile.middleName ?? "");
    setEditFamilyName(profile.familyName ?? "");
    setEditDesignation(profile.providerDesignation ?? "");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, profile: StaffProfile) {
    event.preventDefault();
    if (!canManage || saving) return;
    setSaving(true); onBusyChange(true); setError("");
    try {
      await updateStaffProfile(baseUrl, accessToken, tenantId, profile.id, {
        givenName: editGivenName.trim(), middleName: editMiddleName.trim() || null,
        familyName: editFamilyName.trim() || null, providerDesignation: editDesignation.trim() || null
      });
      setEditingId(""); await refresh(appliedQuery); setNotice("Staff profile updated.");
    } catch (cause) { setError(message(cause)); }
    finally { setSaving(false); onBusyChange(false); }
  }

  async function toggleActive(profile: StaffProfile) {
    if (!canManage || saving) return;
    if (profile.isActive && confirmDeactivateId !== profile.id) {
      setConfirmDeactivateId(profile.id);
      return;
    }
    setSaving(true); onBusyChange(true); setError("");
    try {
      await setStaffProfileActive(baseUrl, accessToken, tenantId, profile.id, !profile.isActive);
      setConfirmDeactivateId(""); await refresh(appliedQuery);
      setNotice(profile.isActive ? "Staff profile deactivated. Open-ended active assignments were ended by the API." : "Staff profile reactivated.");
    } catch (cause) { setError(message(cause)); }
    finally { setSaving(false); onBusyChange(false); }
  }

  async function addAssignment(event: FormEvent<HTMLFormElement>, profile: StaffProfile) {
    event.preventDefault();
    if (!canManage || saving || !assignmentDepartmentId) return;
    setSaving(true); onBusyChange(true); setError("");
    try {
      await addStaffAssignment(baseUrl, accessToken, tenantId, profile.id, {
        hospitalId, departmentId: assignmentDepartmentId, effectiveFrom: assignmentDate
      });
      setAssignmentStaffId(""); setAssignmentDepartmentId(""); setAssignmentDate(today());
      await refresh(appliedQuery); setNotice("Department assignment added.");
    } catch (cause) { setError(message(cause)); }
    finally { setSaving(false); onBusyChange(false); }
  }

  async function endAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !endingAssignment || saving) return;
    setSaving(true); onBusyChange(true); setError("");
    try {
      await endStaffAssignment(baseUrl, accessToken, tenantId, endingAssignment.staffId,
        endingAssignment.assignment.id, assignmentEndDate);
      setEndingAssignment(null); await refresh(appliedQuery); setNotice("Staff assignment ended.");
    } catch (cause) { setError(message(cause)); }
    finally { setSaving(false); onBusyChange(false); }
  }

  return <section className="section staff-management-section" id="staff-management">
    <div className="section-heading"><div><label>WORKFORCE</label><h2>Staff and provider directory</h2><p className="helper-text">Manage staff profiles and effective-dated hospital/department assignments. Credential verification and clinical privileging are separate workflows and are not implied by a staff profile.</p></div></div>

    {canManage && <div className="search-panel staff-create-panel">
      <div className="staff-toolbar"><div><strong>Add a staff profile</strong><small>Creates a tenant-scoped profile and its initial assignment to {hospitalName}.</small></div><button type="button" onClick={() => setCreateOpen(value => !value)}>{createOpen ? "Close form" : "New staff profile"}</button></div>
      {createOpen && <form className="staff-form" onSubmit={create}>
        <div><label htmlFor="staff-code">Staff code *</label><input id="staff-code" value={staffCode} onChange={event => setStaffCode(event.target.value)} maxLength={40} required /></div>
        <div><label htmlFor="staff-given-name">Given name *</label><input id="staff-given-name" value={givenName} onChange={event => setGivenName(event.target.value)} maxLength={100} required /></div>
        <div><label htmlFor="staff-middle-name">Middle name</label><input id="staff-middle-name" value={middleName} onChange={event => setMiddleName(event.target.value)} maxLength={100} /></div>
        <div><label htmlFor="staff-family-name">Family name</label><input id="staff-family-name" value={familyName} onChange={event => setFamilyName(event.target.value)} maxLength={100} /></div>
        <div><label htmlFor="staff-designation">Provider designation (optional)</label><input id="staff-designation" value={designation} onChange={event => setDesignation(event.target.value)} maxLength={100} placeholder="e.g. Consultant" /></div>
        <div><label htmlFor="staff-initial-department">Initial department assignment</label><select id="staff-initial-department" value={initialDepartmentId} onChange={event => setInitialDepartmentId(event.target.value)}><option value="">Hospital-wide assignment</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div><label htmlFor="staff-effective-from">Effective from *</label><input id="staff-effective-from" type="date" value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)} required /></div>
        <div className="staff-form-actions"><button type="submit" disabled={saving || !staffCode.trim() || !givenName.trim()}>{saving ? "Creating…" : "Create staff profile"}</button></div>
      </form>}
    </div>}

    {canRead && <div className="search-panel staff-directory-panel">
      <form className="staff-search" onSubmit={event => { event.preventDefault(); void refresh(query.trim()); }}>
        <div><label htmlFor="staff-search-query">Search staff</label><input id="staff-search-query" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Staff code or name" /></div>
        <button type="submit" disabled={loading}>{loading ? "Searching…" : "Search directory"}</button>
        <button type="button" className="secondary-action" onClick={() => { setQuery(""); void refresh(""); }} disabled={loading}>Clear</button>
      </form>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p className="registration-success" role="status">{notice}</p>}
      <p className="result-count">{visibleStaff.length} staff profile{visibleStaff.length === 1 ? "" : "s"} in {hospitalName}</p>
      {visibleStaff.length === 0 && !loading && !error && <p className="inline-status">No staff profiles were found for this hospital. Create a profile or adjust the search.</p>}
      <div className="staff-record-list">
        {visibleStaff.map(profile => <article className="staff-record" key={profile.id}>
          <div className="staff-record-header">
            <div><strong>{fullName(profile)}</strong><small>{profile.staffCode} · {profile.providerDesignation || "Non-provider staff"}</small></div>
            <span className={profile.isActive ? "staff-status staff-active" : "staff-status"}>{profile.isActive ? "Active" : "Inactive"}</span>
          </div>
          {editingId === profile.id ? <form className="staff-form staff-edit-form" onSubmit={event => void saveEdit(event, profile)}>
            <div><label htmlFor={`edit-given-${profile.id}`}>Given name *</label><input id={`edit-given-${profile.id}`} value={editGivenName} onChange={event => setEditGivenName(event.target.value)} required maxLength={100} /></div>
            <div><label htmlFor={`edit-middle-${profile.id}`}>Middle name</label><input id={`edit-middle-${profile.id}`} value={editMiddleName} onChange={event => setEditMiddleName(event.target.value)} maxLength={100} /></div>
            <div><label htmlFor={`edit-family-${profile.id}`}>Family name</label><input id={`edit-family-${profile.id}`} value={editFamilyName} onChange={event => setEditFamilyName(event.target.value)} maxLength={100} /></div>
            <div><label htmlFor={`edit-designation-${profile.id}`}>Provider designation</label><input id={`edit-designation-${profile.id}`} value={editDesignation} onChange={event => setEditDesignation(event.target.value)} maxLength={100} /></div>
            <div className="staff-form-actions"><button type="submit" disabled={saving || !editGivenName.trim()}>Save profile</button><button type="button" className="secondary-action" onClick={() => setEditingId("")}>Discard</button></div>
          </form> : <div className="staff-assignment-list">
            <strong>Hospital assignments</strong>
            {profile.assignments.filter(item => item.hospitalId === hospitalId).map(assignment => <div className="staff-assignment" key={assignment.id}>
              <div><span>{departments.find(item => item.id === assignment.departmentId)?.name ?? "Hospital-wide"}</span><small>{assignment.effectiveFrom} → {assignment.effectiveTo ?? "Ongoing"}</small></div>
              <span className={assignment.isActive ? "staff-status staff-active" : "staff-status"}>{assignment.isActive ? "Active" : "Ended"}</span>
              {canManage && assignment.isActive && !assignment.effectiveTo && <button type="button" className="secondary-action" onClick={() => { setEndingAssignment({ staffId: profile.id, assignment }); setAssignmentEndDate(today()); }}>End assignment</button>}
            </div>)}
          </div>}
          {canManage && <div className="staff-record-actions">
            {!editingId && <button type="button" onClick={() => beginEdit(profile)}>Edit profile</button>}
            <button type="button" onClick={() => void toggleActive(profile)} disabled={saving}>{profile.isActive ? confirmDeactivateId === profile.id ? "Confirm deactivation" : "Deactivate" : "Reactivate"}</button>
            {confirmDeactivateId === profile.id && <button type="button" className="secondary-action" onClick={() => setConfirmDeactivateId("")}>Keep active</button>}
            {profile.isActive && assignmentStaffId !== profile.id && <button type="button" onClick={() => { setAssignmentStaffId(profile.id); setAssignmentDepartmentId(""); setAssignmentDate(today()); }}>Add department assignment</button>}
          </div>}
          {canManage && assignmentStaffId === profile.id && <form className="staff-assignment-form" onSubmit={event => void addAssignment(event, profile)}>
            <label htmlFor={`assignment-department-${profile.id}`}>Department</label>
            <select id={`assignment-department-${profile.id}`} value={assignmentDepartmentId} onChange={event => setAssignmentDepartmentId(event.target.value)} required><option value="">Select department</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <label htmlFor={`assignment-date-${profile.id}`}>Effective from</label>
            <input id={`assignment-date-${profile.id}`} type="date" value={assignmentDate} onChange={event => setAssignmentDate(event.target.value)} required />
            <div><button type="submit" disabled={saving || !assignmentDepartmentId}>Add assignment</button><button type="button" className="secondary-action" onClick={() => setAssignmentStaffId("")}>Close</button></div>
          </form>}
          {endingAssignment?.staffId === profile.id && <form className="staff-assignment-form" onSubmit={endAssignment}>
            <label htmlFor={`assignment-end-${endingAssignment.assignment.id}`}>Assignment end date</label>
            <input id={`assignment-end-${endingAssignment.assignment.id}`} type="date" min={endingAssignment.assignment.effectiveFrom} value={assignmentEndDate} onChange={event => setAssignmentEndDate(event.target.value)} required />
            <div><button type="submit" disabled={saving}>Confirm end assignment</button><button type="button" className="secondary-action" onClick={() => setEndingAssignment(null)}>Keep assignment</button></div>
          </form>}
        </article>)}
      </div>
    </div>}
  </section>;
}
