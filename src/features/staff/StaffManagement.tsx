import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  addStaffAssignment,
  createStaffProfile,
  endStaffAssignment,
  listDepartments,
  listStaffProfiles,
  setStaffProfileActive,
  updateStaffProfile
} from "../../api/compilecare";
import type { Department, Hospital, StaffAssignment, StaffProfile, StaffProfileUpdateInput } from "../../api/compilecare";

interface Scope {
  scopeType: string;
  hospitalId: string | null;
  departmentId: string | null;
}

interface Props {
  baseUrl: string;
  accessToken: string;
  tenantId: string;
  permissions: string[];
  scopes: Scope[];
  hospitals: Hospital[];
  onBusyChange: (busy: boolean) => void;
}

type Confirmation =
  | { action: "deactivate" | "reactivate"; staff: StaffProfile }
  | { action: "end-assignment"; staff: StaffProfile; assignment: StaffAssignment };

function today(): string {
  const value = new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayName(profile: StaffProfile): string {
  return [profile.givenName, profile.middleName, profile.familyName].filter(Boolean).join(" ");
}

function formatDate(value: string | null): string {
  if (!value) return "Ongoing";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "The staff operation could not be completed.";
}

export function StaffManagement({ baseUrl, accessToken, tenantId, permissions, scopes, hospitals, onBusyChange }: Props) {
  const canManage = permissions.includes("staff.manage");
  const tenantWide = scopes.some(scope => scope.scopeType === "Tenant");
  const canManageHospital = (hospitalId: string) => tenantWide ||
    scopes.some(scope => scope.scopeType === "Hospital" && scope.hospitalId === hospitalId);

  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [departmentsByHospital, setDepartmentsByHospital] = useState<Record<string, Department[]>>({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const [staffCode, setStaffCode] = useState("");
  const [givenName, setGivenName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [designation, setDesignation] = useState("");
  const [createHospitalId, setCreateHospitalId] = useState(hospitals[0]?.id ?? "");
  const [createDepartmentId, setCreateDepartmentId] = useState("");
  const [createEffectiveFrom, setCreateEffectiveFrom] = useState(today());

  const [editValues, setEditValues] = useState<StaffProfileUpdateInput>({
    givenName: "", middleName: null, familyName: null, providerDesignation: null
  });

  const [assignmentStaffId, setAssignmentStaffId] = useState<string | null>(null);
  const [assignmentHospitalId, setAssignmentHospitalId] = useState(hospitals[0]?.id ?? "");
  const [assignmentDepartmentId, setAssignmentDepartmentId] = useState("");
  const [assignmentEffectiveFrom, setAssignmentEffectiveFrom] = useState(today());
  const [assignmentEndDate, setAssignmentEndDate] = useState(today());

  const departmentsForCreate = departmentsByHospital[createHospitalId] ?? [];
  const departmentsForAssignment = departmentsByHospital[assignmentHospitalId] ?? [];

  const visibleHospitalIds = useMemo(() => new Set(hospitals.map(hospital => hospital.id)), [hospitals]);

  useEffect(() => {
    if (!hospitals.some(hospital => hospital.id === createHospitalId)) {
      setCreateHospitalId(hospitals[0]?.id ?? "");
      setCreateDepartmentId("");
    }
    if (!hospitals.some(hospital => hospital.id === assignmentHospitalId)) {
      setAssignmentHospitalId(hospitals[0]?.id ?? "");
      setAssignmentDepartmentId("");
    }
  }, [hospitals, createHospitalId, assignmentHospitalId]);

  async function refreshStaff() {
    setLoading(true);
    setError("");
    try {
      const result = await listStaffProfiles(baseUrl, accessToken, tenantId, appliedQuery, page, 50);
      setStaff(result.items);
      setTotalCount(result.totalCount);
      setTotalPages(result.totalPages);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    listStaffProfiles(baseUrl, accessToken, tenantId, appliedQuery, page, 50)
      .then(result => {
        if (!active) return;
        setStaff(result.items);
        setTotalCount(result.totalCount);
        setTotalPages(result.totalPages);
      })
      .catch(cause => { if (active) setError(errorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [baseUrl, accessToken, tenantId, appliedQuery, page]);

  useEffect(() => {
    let active = true;
    const requiredIds = new Set<string>([
      ...hospitals.map(hospital => hospital.id),
      ...staff.flatMap(profile => profile.assignments.map(assignment => assignment.hospitalId))
    ]);
    const missing = [...requiredIds].filter(id => visibleHospitalIds.has(id) && !departmentsByHospital[id]);
    if (missing.length === 0) return;
    Promise.all(missing.map(async hospitalId => {
      const result = await listDepartments(baseUrl, accessToken, tenantId, hospitalId);
      return [hospitalId, result.items] as const;
    })).then(entries => {
      if (!active) return;
      setDepartmentsByHospital(current => {
        const next = { ...current };
        for (const [hospitalId, departments] of entries) next[hospitalId] = departments;
        return next;
      });
    }).catch(() => {
      // The staff API has already scope-filtered the returned assignments.
      // A department label is best-effort metadata; the server remains authoritative.
    });
    return () => { active = false; };
  }, [baseUrl, accessToken, tenantId, hospitals, staff, visibleHospitalIds, departmentsByHospital]);

  function hospitalName(id: string): string {
    return hospitals.find(hospital => hospital.id === id)?.name ?? "Hospital";
  }

  function assignmentLocation(assignment: StaffAssignment): string {
    if (!assignment.departmentId) return `${hospitalName(assignment.hospitalId)} · Hospital-wide`;
    const department = (departmentsByHospital[assignment.hospitalId] ?? [])
      .find(item => item.id === assignment.departmentId);
    return `${hospitalName(assignment.hospitalId)} · ${department?.name ?? "Department"}`;
  }

  async function runOperation(action: () => Promise<void>, message: string) {
    setBusy(true);
    onBusyChange(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      setConfirmation(null);
      setEditingId(null);
      setAssignmentStaffId(null);
      setShowCreate(false);
      await refreshStaff();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedQuery(searchTerm.trim());
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createHospitalId) {
      setError("Select an accessible hospital for the initial staff assignment.");
      return;
    }
    if (!canManageHospital(createHospitalId) && !createDepartmentId) {
      setError("Select a department within your assigned scope for the initial staff assignment.");
      return;
    }
    await runOperation(async () => {
      await createStaffProfile(baseUrl, accessToken, tenantId, {
        staffCode: staffCode.trim().toUpperCase(),
        givenName: givenName.trim(),
        middleName: middleName.trim() || null,
        familyName: familyName.trim() || null,
        providerDesignation: designation.trim() || null,
        hospitalId: createHospitalId,
        departmentId: createDepartmentId || null,
        effectiveFrom: createEffectiveFrom || null
      });
      setStaffCode(""); setGivenName(""); setMiddleName(""); setFamilyName(""); setDesignation("");
      setCreateDepartmentId(""); setCreateEffectiveFrom(today());
    }, "Staff profile created with its initial effective-dated assignment.");
  }

  async function submitUpdate(profile: StaffProfile) {
    await runOperation(async () => {
      await updateStaffProfile(baseUrl, accessToken, tenantId, profile.id, {
        givenName: editValues.givenName.trim(),
        middleName: editValues.middleName?.trim() || null,
        familyName: editValues.familyName?.trim() || null,
        providerDesignation: editValues.providerDesignation?.trim() || null
      });
    }, "Staff profile updated.");
  }

  async function submitAssignment(profile: StaffProfile) {
    if (!assignmentHospitalId) {
      setError("Select an accessible hospital for this assignment.");
      return;
    }
    if (!canManageHospital(assignmentHospitalId) && !assignmentDepartmentId) {
      setError("Select a department within your assigned scope.");
      return;
    }
    await runOperation(async () => {
      await addStaffAssignment(baseUrl, accessToken, tenantId, profile.id, {
        hospitalId: assignmentHospitalId,
        departmentId: assignmentDepartmentId || null,
        effectiveFrom: assignmentEffectiveFrom
      });
    }, "Staff assignment added.");
  }

  async function confirmAction() {
    if (!confirmation) return;
    const target = confirmation;
    await runOperation(async () => {
      if (target.action === "deactivate") {
        await setStaffProfileActive(baseUrl, accessToken, tenantId, target.staff.id, false);
      } else if (target.action === "reactivate") {
        await setStaffProfileActive(baseUrl, accessToken, tenantId, target.staff.id, true);
      } else {
        await endStaffAssignment(baseUrl, accessToken, tenantId, target.staff.id, target.assignment.id, assignmentEndDate);
      }
    }, target.action === "deactivate" ? "Staff profile deactivated; active assignments were ended." :
      target.action === "reactivate" ? "Staff profile reactivated. Previous assignments remain ended." :
      "Staff assignment ended.");
  }

  return <section className="section staff-management-section" id="staff">
    <div className="section-heading"><div><label>PEOPLE & PROVIDERS</label><h2>Staff directory</h2><p className="helper-text">Manage staff profiles and effective-dated hospital or department assignments. This directory does not create login accounts or verify professional credentials.</p></div></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {success && <p className="registration-success" role="status">{success}</p>}

    <div className="search-panel staff-search-panel">
      <form className="staff-search-form" onSubmit={submitSearch}>
        <div><label htmlFor="staff-search">Search staff code or name</label><input id="staff-search" value={searchTerm} onChange={event=>setSearchTerm(event.target.value)} placeholder="e.g. EMP-001 or Asha Patil"/></div>
        <button type="submit" disabled={loading}>Search</button>
        {canManage && <button type="button" className="clinical-secondary" onClick={()=>{setShowCreate(value=>!value);setEditingId(null);setAssignmentStaffId(null);}} disabled={busy}>{showCreate ? "Cancel" : "Add staff"}</button>}
      </form>
      <p className="helper-text">{totalCount} staff profile{totalCount === 1 ? "" : "s"} in your accessible organization scope</p>
    </div>

    {showCreate && canManage && <form className="staff-form-panel" onSubmit={submitCreate}>
      <div className="staff-form-heading"><div><h3>Create staff profile</h3><p className="helper-text">Every new profile starts with an initial hospital or department assignment.</p></div></div>
      <div className="staff-form-grid">
        <div><label htmlFor="staff-code">Staff code *</label><input id="staff-code" value={staffCode} onChange={event=>setStaffCode(event.target.value)} maxLength={40} required disabled={busy}/></div>
        <div><label htmlFor="staff-given-name">Given name *</label><input id="staff-given-name" value={givenName} onChange={event=>setGivenName(event.target.value)} maxLength={100} required disabled={busy}/></div>
        <div><label htmlFor="staff-middle-name">Middle name</label><input id="staff-middle-name" value={middleName} onChange={event=>setMiddleName(event.target.value)} maxLength={100} disabled={busy}/></div>
        <div><label htmlFor="staff-family-name">Family name</label><input id="staff-family-name" value={familyName} onChange={event=>setFamilyName(event.target.value)} maxLength={100} disabled={busy}/></div>
        <div><label htmlFor="staff-designation">Provider designation</label><input id="staff-designation" value={designation} onChange={event=>setDesignation(event.target.value)} maxLength={100} placeholder="e.g. Consultant, Nurse, Radiographer" disabled={busy}/><small>Descriptive only; credential verification and approved designation catalogues are not part of this workflow.</small></div>
        <div><label htmlFor="staff-create-hospital">Hospital *</label><select id="staff-create-hospital" value={createHospitalId} onChange={event=>{setCreateHospitalId(event.target.value);setCreateDepartmentId("");}} required disabled={busy||hospitals.length===0}><option value="">Select hospital</option>{hospitals.map(hospital=><option key={hospital.id} value={hospital.id}>{hospital.name}</option>)}</select></div>
        <div><label htmlFor="staff-create-department">Department {canManageHospital(createHospitalId) ? "(optional)" : "*"}</label><select id="staff-create-department" value={createDepartmentId} onChange={event=>setCreateDepartmentId(event.target.value)} disabled={busy||!createHospitalId}><option value="">{canManageHospital(createHospitalId) ? "Hospital-wide assignment" : "Select department"}</option>{departmentsForCreate.map(department=><option key={department.id} value={department.id}>{department.name}</option>)}</select></div>
        <div><label htmlFor="staff-create-date">Effective from *</label><input id="staff-create-date" type="date" value={createEffectiveFrom} onChange={event=>setCreateEffectiveFrom(event.target.value)} required disabled={busy}/></div>
      </div>
      <div className="staff-form-actions"><button type="submit" disabled={busy||!staffCode.trim()||!givenName.trim()||!createHospitalId||(!canManageHospital(createHospitalId)&&!createDepartmentId)}>Create staff profile</button></div>
    </form>}

    {loading ? <p className="inline-status" role="status">Loading staff directory…</p> : staff.length === 0 ? <p className="inline-status">No staff profiles match this search in your accessible scope.</p> :
      <div className="staff-list">{staff.map(profile=><article className="staff-card" key={profile.id}>
        <div className="staff-card-header"><div><div className="staff-identity"><h3>{displayName(profile)}</h3><span className={profile.isActive ? "staff-state staff-state-active" : "staff-state staff-state-inactive"}>{profile.isActive ? "Active" : "Inactive"}</span></div><p className="staff-code">{profile.staffCode}{profile.providerDesignation ? ` · ${profile.providerDesignation}` : ""}</p></div>
          {canManage && profile.canManageWithinScope && <div className="staff-card-actions">
            <button type="button" className="clinical-secondary" onClick={()=>{setEditingId(editingId===profile.id?null:profile.id);setEditValues({givenName:profile.givenName,middleName:profile.middleName,familyName:profile.familyName,providerDesignation:profile.providerDesignation});setAssignmentStaffId(null);}} disabled={busy}>Edit profile</button>
            {profile.isActive ? <button type="button" className="queue-action-danger" onClick={()=>setConfirmation({action:"deactivate",staff:profile})} disabled={busy}>Deactivate</button> : <button type="button" onClick={()=>setConfirmation({action:"reactivate",staff:profile})} disabled={busy}>Reactivate</button>}
          </div>}
        </div>
        <div className="staff-assignment-heading"><h4>Hospital assignments</h4>{canManage&&profile.canManageWithinScope&&profile.isActive&&<button type="button" className="clinical-secondary" onClick={()=>{setAssignmentStaffId(assignmentStaffId===profile.id?null:profile.id);setAssignmentHospitalId(hospitals[0]?.id??"");setAssignmentDepartmentId("");setAssignmentEffectiveFrom(today());setEditingId(null);}} disabled={busy}>Add assignment</button>}</div>
        {!profile.canManageWithinScope && canManage && <p className="inline-status">Read-only: this profile has assignments outside your organization management scope.</p>}{profile.assignments.length === 0 ? <p className="inline-status">No assignments are visible in your current scope.</p> :
          <ul className="staff-assignment-list">{profile.assignments.map(assignment=><li key={assignment.id}>
            <div><strong>{assignmentLocation(assignment)}</strong><span>{formatDate(assignment.effectiveFrom)} – {formatDate(assignment.effectiveTo)}</span></div>
            <div className="staff-assignment-actions"><span className={assignment.isActive ? "staff-state staff-state-active" : "staff-state staff-state-inactive"}>{assignment.isActive ? "Active" : "Ended"}</span>{canManage&&profile.canManageWithinScope&&profile.isActive&&assignment.isActive&&<button type="button" className="queue-action-danger" onClick={()=>{setAssignmentEndDate(today());setConfirmation({action:"end-assignment",staff:profile,assignment});}} disabled={busy}>End assignment</button>}</div>
          </li>)}</ul>}
        {editingId===profile.id&&canManage&&profile.canManageWithinScope&&<form className="staff-inline-form" onSubmit={event=>{event.preventDefault();void submitUpdate(profile);}}>
          <h4>Edit staff profile</h4>
          <div className="staff-form-grid"><div><label htmlFor={`edit-given-${profile.id}`}>Given name *</label><input id={`edit-given-${profile.id}`} value={editValues.givenName} onChange={event=>setEditValues(current=>({...current,givenName:event.target.value}))} required disabled={busy}/></div><div><label htmlFor={`edit-middle-${profile.id}`}>Middle name</label><input id={`edit-middle-${profile.id}`} value={editValues.middleName??""} onChange={event=>setEditValues(current=>({...current,middleName:event.target.value||null}))} disabled={busy}/></div><div><label htmlFor={`edit-family-${profile.id}`}>Family name</label><input id={`edit-family-${profile.id}`} value={editValues.familyName??""} onChange={event=>setEditValues(current=>({...current,familyName:event.target.value||null}))} disabled={busy}/></div><div><label htmlFor={`edit-designation-${profile.id}`}>Provider designation</label><input id={`edit-designation-${profile.id}`} value={editValues.providerDesignation??""} onChange={event=>setEditValues(current=>({...current,providerDesignation:event.target.value||null}))} disabled={busy}/></div></div>
          <div className="staff-form-actions"><button type="submit" disabled={busy||!editValues.givenName.trim()}>Save changes</button><button type="button" className="clinical-secondary" onClick={()=>setEditingId(null)} disabled={busy}>Cancel</button></div>
        </form>}
        {assignmentStaffId===profile.id&&canManage&&profile.canManageWithinScope&&<form className="staff-inline-form" onSubmit={event=>{event.preventDefault();void submitAssignment(profile);}}>
          <h4>Add effective-dated assignment</h4>
          <div className="staff-form-grid"><div><label htmlFor={`assignment-hospital-${profile.id}`}>Hospital *</label><select id={`assignment-hospital-${profile.id}`} value={assignmentHospitalId} onChange={event=>{setAssignmentHospitalId(event.target.value);setAssignmentDepartmentId("");}} required disabled={busy}><option value="">Select hospital</option>{hospitals.map(hospital=><option key={hospital.id} value={hospital.id}>{hospital.name}</option>)}</select></div><div><label htmlFor={`assignment-department-${profile.id}`}>Department {canManageHospital(assignmentHospitalId) ? "(optional)" : "*"}</label><select id={`assignment-department-${profile.id}`} value={assignmentDepartmentId} onChange={event=>setAssignmentDepartmentId(event.target.value)} disabled={busy||!assignmentHospitalId}><option value="">{canManageHospital(assignmentHospitalId) ? "Hospital-wide assignment" : "Select department"}</option>{departmentsForAssignment.map(department=><option key={department.id} value={department.id}>{department.name}</option>)}</select></div><div><label htmlFor={`assignment-date-${profile.id}`}>Effective from *</label><input id={`assignment-date-${profile.id}`} type="date" value={assignmentEffectiveFrom} onChange={event=>setAssignmentEffectiveFrom(event.target.value)} required disabled={busy}/></div></div>
          <div className="staff-form-actions"><button type="submit" disabled={busy||!assignmentHospitalId||(!canManageHospital(assignmentHospitalId)&&!assignmentDepartmentId)}>Add assignment</button><button type="button" className="clinical-secondary" onClick={()=>setAssignmentStaffId(null)} disabled={busy}>Cancel</button></div>
        </form>}
        {confirmation?.staff.id===profile.id&&canManage&&profile.canManageWithinScope&&<div className="staff-confirm" role="group" aria-labelledby={`staff-confirm-${profile.id}`}>
          <p id={`staff-confirm-${profile.id}`}>{confirmation.action==="deactivate" ? `Deactivate ${displayName(profile)}? All active assignments will be ended; reactivation will not restore them.` : confirmation.action==="reactivate" ? `Reactivate ${displayName(profile)}? You must add new assignments before scheduling this staff member.` : `End the assignment for ${displayName(profile)}?`}</p>
          {confirmation.action==="end-assignment"&&<div><label htmlFor={`assignment-end-date-${profile.id}`}>Effective to *</label><input id={`assignment-end-date-${profile.id}`} type="date" min={confirmation.assignment.effectiveFrom} value={assignmentEndDate} onChange={event=>setAssignmentEndDate(event.target.value)} disabled={busy}/></div>}
          <div className="staff-form-actions"><button type="button" className="queue-action-danger" onClick={confirmAction} disabled={busy|| (confirmation.action==="end-assignment" && assignmentEndDate<confirmation.assignment.effectiveFrom)}>Confirm</button><button type="button" className="clinical-secondary" onClick={()=>setConfirmation(null)} disabled={busy}>Cancel</button></div>
        </div>}
      </article>)}</div>}
    {totalPages>1&&<div className="pagination"><button type="button" onClick={()=>setPage(current=>Math.max(1,current-1))} disabled={loading||page<=1}>Previous</button><span>Page {page} of {totalPages}</span><button type="button" onClick={()=>setPage(current=>Math.min(totalPages,current+1))} disabled={loading||page>=totalPages}>Next</button></div>}
  </section>;
}
