import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  createBed,
  createDepartment,
  createHospital,
  createRoom,
  createWard,
  deleteBed,
  deleteDepartment,
  deleteHospital,
  deleteRoom,
  deleteWard,
  listBeds,
  listRooms,
  listWards,
  updateBed,
  updateDepartment,
  updateHospital,
  updateRoom,
  updateWard
} from "../../api/compilecare";
import type { Bed, Department, Hospital, OrganizationScope, Room, Ward } from "../../api/compilecare";

type DeleteKind = "hospital" | "department" | "ward" | "room" | "bed";
type DeleteTarget = { kind: DeleteKind; id: string; label: string };

interface Props {
  baseUrl: string;
  accessToken: string;
  tenantId: string;
  hospital: Hospital | undefined;
  departments: Department[];
  permissions: string[];
  scopes: OrganizationScope[];
  onRefreshHospitals: (preferredHospitalId?: string) => Promise<void>;
  onRefreshDepartments: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "This item has dependent records or changed since it was loaded. Refresh the hierarchy and resolve its dependencies before deleting it.";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "The facility request could not be completed. Try again.";
}

export function FacilityManagement({
  baseUrl, accessToken, tenantId, hospital, departments, permissions, scopes,
  onRefreshHospitals, onRefreshDepartments, onBusyChange
}: Props) {
  const [departmentId, setDepartmentId] = useState("");
  const [wardId, setWardId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [wards, setWards] = useState<Ward[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [wardsLoading, setWardsLoading] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [bedsLoading, setBedsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const [newHospitalName, setNewHospitalName] = useState("");
  const [newHospitalCode, setNewHospitalCode] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalCode, setHospitalCode] = useState("");
  const [editingHospital, setEditingHospital] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [newDepartmentCode, setNewDepartmentCode] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [departmentCode, setDepartmentCode] = useState("");
  const [editingDepartment, setEditingDepartment] = useState(false);
  const [newWardName, setNewWardName] = useState("");
  const [wardName, setWardName] = useState("");
  const [editingWard, setEditingWard] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [editingRoom, setEditingRoom] = useState(false);
  const [newBedNumber, setNewBedNumber] = useState("");
  const [newBedActive, setNewBedActive] = useState(true);
  const [editingBedId, setEditingBedId] = useState("");
  const [bedNumber, setBedNumber] = useState("");
  const [bedActive, setBedActive] = useState(true);

  const canWrite = permissions.includes("facility.write");
  const canDelete = permissions.includes("facility.delete");
  const tenantWide = scopes.some(scope => scope.scopeType === "Tenant");
  const canManageHospital = canWrite && !!hospital &&
    (tenantWide || scopes.some(scope => scope.scopeType === "Hospital" && scope.hospitalId === hospital.id));
  const canCreateHospital = canWrite && tenantWide;
  const department = departments.find(item => item.id === departmentId);
  const ward = wards.find(item => item.id === wardId);
  const room = rooms.find(item => item.id === roomId);

  function setMutationBusy(value: boolean) {
    setBusy(value);
    onBusyChange(value);
  }

  useEffect(() => {
    setDepartmentId(current => departments.some(item => item.id === current)
      ? current : departments.length === 1 ? departments[0].id : "");
    setWardId("");
    setRoomId("");
    setWards([]);
    setRooms([]);
    setBeds([]);
  }, [hospital?.id, departments]);

  useEffect(() => {
    setHospitalName(hospital?.name ?? "");
    setHospitalCode(hospital?.code ?? "");
    setEditingHospital(false);
  }, [hospital?.id, hospital?.name, hospital?.code]);

  useEffect(() => {
    if (!departmentId) {
      setWards([]); setWardId(""); setRooms([]); setRoomId(""); setBeds([]);
      return;
    }
    let active = true;
    setWardsLoading(true);
    listWards(baseUrl, accessToken, tenantId, departmentId)
      .then(page => {
        if (!active) return;
        setWards(page.items);
        setWardId(current => page.items.some(item => item.id === current)
          ? current : page.items.length === 1 ? page.items[0].id : "");
      })
      .catch(cause => { if (active) setError(getErrorMessage(cause)); })
      .finally(() => { if (active) setWardsLoading(false); });
    return () => { active = false; };
  }, [baseUrl, accessToken, tenantId, departmentId]);

  useEffect(() => {
    if (!wardId) {
      setRooms([]); setRoomId(""); setBeds([]);
      return;
    }
    let active = true;
    setRoomsLoading(true);
    listRooms(baseUrl, accessToken, tenantId, wardId)
      .then(page => {
        if (!active) return;
        setRooms(page.items);
        setRoomId(current => page.items.some(item => item.id === current)
          ? current : page.items.length === 1 ? page.items[0].id : "");
      })
      .catch(cause => { if (active) setError(getErrorMessage(cause)); })
      .finally(() => { if (active) setRoomsLoading(false); });
    return () => { active = false; };
  }, [baseUrl, accessToken, tenantId, wardId]);

  useEffect(() => {
    if (!roomId) { setBeds([]); return; }
    let active = true;
    setBedsLoading(true);
    listBeds(baseUrl, accessToken, tenantId, roomId)
      .then(page => { if (active) setBeds(page.items); })
      .catch(cause => { if (active) setError(getErrorMessage(cause)); })
      .finally(() => { if (active) setBedsLoading(false); });
    return () => { active = false; };
  }, [baseUrl, accessToken, tenantId, roomId]);

  async function mutate(action: () => Promise<void>, message: string) {
    setMutationBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      setDeleteTarget(null);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setMutationBusy(false);
    }
  }

  async function submitNewHospital(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateHospital || !newHospitalName.trim()) return;
    await mutate(async () => {
      const created = await createHospital(baseUrl, accessToken, tenantId, newHospitalName.trim(), newHospitalCode.trim() || null);
      setNewHospitalName(""); setNewHospitalCode("");
      await onRefreshHospitals(created.id);
    }, "Hospital created.");
  }

  async function submitHospital(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hospital || !canManageHospital || !hospitalName.trim()) return;
    await mutate(async () => {
      await updateHospital(baseUrl, accessToken, tenantId, hospital.id, { name: hospitalName.trim(), code: hospitalCode.trim() || null });
      await onRefreshHospitals(hospital.id);
      setEditingHospital(false);
    }, "Hospital details updated.");
  }

  async function submitNewDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hospital || !canManageHospital || !newDepartmentName.trim()) return;
    await mutate(async () => {
      const created = await createDepartment(baseUrl, accessToken, tenantId, hospital.id, newDepartmentName.trim(), newDepartmentCode.trim() || null);
      setNewDepartmentName(""); setNewDepartmentCode("");
      await onRefreshDepartments();
      setDepartmentId(created.id);
    }, "Department created.");
  }

  async function submitDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hospital || !department || !canWrite || !departmentName.trim()) return;
    await mutate(async () => {
      await updateDepartment(baseUrl, accessToken, tenantId, hospital.id, department.id, { name: departmentName.trim(), code: departmentCode.trim() || null });
      await onRefreshDepartments();
      setEditingDepartment(false);
    }, "Department details updated.");
  }

  async function submitNewWard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!department || !canWrite || !newWardName.trim()) return;
    await mutate(async () => {
      const created = await createWard(baseUrl, accessToken, tenantId, department.id, newWardName.trim());
      setNewWardName("");
      const page = await listWards(baseUrl, accessToken, tenantId, department.id);
      setWards(page.items); setWardId(created.id);
    }, "Ward created.");
  }

  async function submitWard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!department || !ward || !canWrite || !wardName.trim()) return;
    await mutate(async () => {
      await updateWard(baseUrl, accessToken, tenantId, department.id, ward.id, wardName.trim());
      const page = await listWards(baseUrl, accessToken, tenantId, department.id);
      setWards(page.items); setEditingWard(false);
    }, "Ward details updated.");
  }

  async function submitNewRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ward || !canWrite || !newRoomName.trim()) return;
    await mutate(async () => {
      const created = await createRoom(baseUrl, accessToken, tenantId, ward.id, newRoomName.trim());
      setNewRoomName("");
      const page = await listRooms(baseUrl, accessToken, tenantId, ward.id);
      setRooms(page.items); setRoomId(created.id);
    }, "Room created.");
  }

  async function submitRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ward || !room || !canWrite || !roomName.trim()) return;
    await mutate(async () => {
      await updateRoom(baseUrl, accessToken, tenantId, ward.id, room.id, roomName.trim());
      const page = await listRooms(baseUrl, accessToken, tenantId, ward.id);
      setRooms(page.items); setEditingRoom(false);
    }, "Room details updated.");
  }

  async function submitNewBed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || !canWrite || !newBedNumber.trim()) return;
    await mutate(async () => {
      await createBed(baseUrl, accessToken, tenantId, room.id, { number: newBedNumber.trim(), isActive: newBedActive });
      setNewBedNumber(""); setNewBedActive(true);
      const page = await listBeds(baseUrl, accessToken, tenantId, room.id);
      setBeds(page.items);
    }, "Bed created.");
  }

  async function submitBed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || !editingBedId || !canWrite || !bedNumber.trim()) return;
    await mutate(async () => {
      await updateBed(baseUrl, accessToken, tenantId, room.id, editingBedId, { number: bedNumber.trim(), isActive: bedActive });
      const page = await listBeds(baseUrl, accessToken, tenantId, room.id);
      setBeds(page.items); setEditingBedId("");
    }, "Bed details updated.");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    await mutate(async () => {
      switch (target.kind) {
        case "hospital":
          await deleteHospital(baseUrl, accessToken, tenantId, target.id);
          await onRefreshHospitals();
          break;
        case "department":
          if (!hospital) return;
          await deleteDepartment(baseUrl, accessToken, tenantId, hospital.id, target.id);
          await onRefreshDepartments();
          setDepartmentId("");
          break;
        case "ward":
          if (!department) return;
          await deleteWard(baseUrl, accessToken, tenantId, department.id, target.id);
          setWards(items => items.filter(item => item.id !== target.id));
          setWardId("");
          break;
        case "room":
          if (!ward) return;
          await deleteRoom(baseUrl, accessToken, tenantId, ward.id, target.id);
          setRooms(items => items.filter(item => item.id !== target.id));
          setRoomId("");
          break;
        case "bed":
          if (!room) return;
          await deleteBed(baseUrl, accessToken, tenantId, room.id, target.id);
          setBeds(items => items.filter(item => item.id !== target.id));
          setEditingBedId("");
          break;
      }
    }, target.label + " deleted.");
  }

  function askDelete(kind: DeleteKind, id: string, label: string) {
    setError(""); setSuccess("");
    setDeleteTarget({ kind, id, label });
  }

  return <section className="section facilities-section" id="facilities">
    <div className="section-heading"><div><label>FACILITY ADMINISTRATION</label><h2>Facility hierarchy</h2><p className="helper-text">Manage the hospital structure from hospitals through departments, wards, rooms and beds. Every change is saved by the API and remains tenant- and membership-scoped.</p></div></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {success && <p className="registration-success" role="status">{success}</p>}

    {hospital ? <div className="search-panel facility-hospital-card">
      <div className="facility-card-heading"><div><label>ACTIVE HOSPITAL</label><h3>{hospital.name}</h3><p>{hospital.code ? "Code · " + hospital.code : "No hospital code configured"}</p></div><span className="facility-count">{departments.length} departments</span></div>
      {canManageHospital && editingHospital ? <form className="facility-inline-form" onSubmit={submitHospital}>
        <div><label htmlFor="facility-hospital-name">Hospital name *</label><input id="facility-hospital-name" value={hospitalName} maxLength={200} onChange={event=>setHospitalName(event.target.value)} required disabled={busy}/></div>
        <div><label htmlFor="facility-hospital-code">Hospital code</label><input id="facility-hospital-code" value={hospitalCode} maxLength={50} onChange={event=>setHospitalCode(event.target.value)} disabled={busy}/></div>
        <div className="facility-form-actions"><button type="submit" disabled={busy||!hospitalName.trim()}>Save hospital</button><button type="button" className="clinical-secondary" onClick={()=>setEditingHospital(false)} disabled={busy}>Cancel</button></div>
      </form> : canManageHospital && <div className="facility-form-actions"><button type="button" className="clinical-secondary" onClick={()=>setEditingHospital(true)} disabled={busy}>Edit hospital</button>{canDelete&&<button type="button" className="queue-action-danger" onClick={()=>askDelete("hospital",hospital.id,hospital.name)} disabled={busy}>Delete hospital</button>}</div>}
    </div> : <div className="search-panel facility-hospital-empty"><h3>No hospital selected</h3><p className="inline-status">Choose an accessible hospital in the active organization context, or create the first hospital if your membership has tenant-wide facility permissions.</p></div>}

    {canCreateHospital && <div className="search-panel facility-create-hospital"><h3>Add a hospital</h3><form className="facility-inline-form" onSubmit={submitNewHospital}>
      <div><label htmlFor="facility-new-hospital-name">Hospital name *</label><input id="facility-new-hospital-name" value={newHospitalName} maxLength={200} onChange={event=>setNewHospitalName(event.target.value)} required disabled={busy}/></div>
      <div><label htmlFor="facility-new-hospital-code">Hospital code</label><input id="facility-new-hospital-code" value={newHospitalCode} maxLength={50} onChange={event=>setNewHospitalCode(event.target.value)} disabled={busy}/></div>
      <div className="facility-form-actions"><button type="submit" disabled={busy||!newHospitalName.trim()}>Create hospital</button></div>
    </form></div>}

    {hospital && <div className="facility-hierarchy-grid">
      <section className="search-panel facility-level">
        <div className="facility-level-heading"><div><label>LEVEL 01</label><h3>Departments</h3></div><span>{departments.length}</span></div>
        <label htmlFor="facility-department-select">Select department</label>
        <select id="facility-department-select" value={departmentId} onChange={event=>{setDepartmentId(event.target.value);setWardId("");setRoomId("");}} disabled={departments.length===0||busy}><option value="">Choose department</option>{departments.map(item=><option key={item.id} value={item.id}>{item.name}{item.code ? " · " + item.code : ""}</option>)}</select>
        {department && <div className="facility-selected-item"><strong>{department.name}</strong><span>{department.code||"No code"}</span>{canWrite&&!editingDepartment&&<button type="button" className="clinical-secondary" onClick={()=>{setDepartmentName(department.name);setDepartmentCode(department.code??"");setEditingDepartment(true);}}>Edit</button>}{canDelete&&<button type="button" className="queue-action-danger" onClick={()=>askDelete("department",department.id,department.name)} disabled={busy}>Delete</button>}</div>}
        {editingDepartment&&department&&<form className="facility-inline-form" onSubmit={submitDepartment}><div><label htmlFor="facility-department-name">Department name *</label><input id="facility-department-name" value={departmentName} maxLength={200} onChange={event=>setDepartmentName(event.target.value)} required disabled={busy}/></div><div><label htmlFor="facility-department-code">Department code</label><input id="facility-department-code" value={departmentCode} maxLength={50} onChange={event=>setDepartmentCode(event.target.value)} disabled={busy}/></div><div className="facility-form-actions"><button type="submit" disabled={busy||!departmentName.trim()}>Save department</button><button type="button" className="clinical-secondary" onClick={()=>setEditingDepartment(false)} disabled={busy}>Cancel</button></div></form>}
        {canManageHospital&&<form className="facility-create-form" onSubmit={submitNewDepartment}><label htmlFor="facility-new-department-name">Add department</label><input id="facility-new-department-name" value={newDepartmentName} maxLength={200} onChange={event=>setNewDepartmentName(event.target.value)} placeholder="e.g. General Medicine" disabled={busy} required/><input aria-label="New department code" value={newDepartmentCode} maxLength={50} onChange={event=>setNewDepartmentCode(event.target.value)} placeholder="Department code (optional)" disabled={busy}/><button type="submit" disabled={busy||!newDepartmentName.trim()}>Create department</button></form>}
        {departments.length===0&&<p className="inline-status">No departments are available for this hospital.</p>}
      </section>

      <section className="search-panel facility-level">
        <div className="facility-level-heading"><div><label>LEVEL 02</label><h3>Wards</h3></div><span>{wards.length}</span></div>
        <label htmlFor="facility-ward-select">Select ward</label>
        <select id="facility-ward-select" value={wardId} onChange={event=>{setWardId(event.target.value);setRoomId("");}} disabled={!department||wardsLoading||wards.length===0||busy}><option value="">Choose ward</option>{wards.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
        {wardsLoading&&<p className="inline-status" role="status">Loading wards…</p>}
        {ward&&<div className="facility-selected-item"><strong>{ward.name}</strong>{canWrite&&!editingWard&&<button type="button" className="clinical-secondary" onClick={()=>{setWardName(ward.name);setEditingWard(true);}}>Edit</button>}{canDelete&&<button type="button" className="queue-action-danger" onClick={()=>askDelete("ward",ward.id,ward.name)} disabled={busy}>Delete</button>}</div>}
        {editingWard&&ward&&<form className="facility-inline-form" onSubmit={submitWard}><div><label htmlFor="facility-ward-name">Ward name *</label><input id="facility-ward-name" value={wardName} maxLength={200} onChange={event=>setWardName(event.target.value)} required disabled={busy}/></div><div className="facility-form-actions"><button type="submit" disabled={busy||!wardName.trim()}>Save ward</button><button type="button" className="clinical-secondary" onClick={()=>setEditingWard(false)} disabled={busy}>Cancel</button></div></form>}
        {department&&canWrite&&<form className="facility-create-form" onSubmit={submitNewWard}><label htmlFor="facility-new-ward-name">Add ward</label><input id="facility-new-ward-name" value={newWardName} maxLength={200} onChange={event=>setNewWardName(event.target.value)} placeholder="e.g. General Ward" disabled={busy} required/><button type="submit" disabled={busy||!newWardName.trim()}>Create ward</button></form>}
        {department&&!wardsLoading&&wards.length===0&&<p className="inline-status">No wards are configured for this department.</p>}
      </section>

      <section className="search-panel facility-level">
        <div className="facility-level-heading"><div><label>LEVEL 03</label><h3>Rooms</h3></div><span>{rooms.length}</span></div>
        <label htmlFor="facility-room-select">Select room</label>
        <select id="facility-room-select" value={roomId} onChange={event=>setRoomId(event.target.value)} disabled={!ward||roomsLoading||rooms.length===0||busy}><option value="">Choose room</option>{rooms.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
        {roomsLoading&&<p className="inline-status" role="status">Loading rooms…</p>}
        {room&&<div className="facility-selected-item"><strong>{room.name}</strong>{canWrite&&!editingRoom&&<button type="button" className="clinical-secondary" onClick={()=>{setRoomName(room.name);setEditingRoom(true);}}>Edit</button>}{canDelete&&<button type="button" className="queue-action-danger" onClick={()=>askDelete("room",room.id,room.name)} disabled={busy}>Delete</button>}</div>}
        {editingRoom&&room&&<form className="facility-inline-form" onSubmit={submitRoom}><div><label htmlFor="facility-room-name">Room name *</label><input id="facility-room-name" value={roomName} maxLength={200} onChange={event=>setRoomName(event.target.value)} required disabled={busy}/></div><div className="facility-form-actions"><button type="submit" disabled={busy||!roomName.trim()}>Save room</button><button type="button" className="clinical-secondary" onClick={()=>setEditingRoom(false)} disabled={busy}>Cancel</button></div></form>}
        {ward&&canWrite&&<form className="facility-create-form" onSubmit={submitNewRoom}><label htmlFor="facility-new-room-name">Add room</label><input id="facility-new-room-name" value={newRoomName} maxLength={200} onChange={event=>setNewRoomName(event.target.value)} placeholder="e.g. Room 101" disabled={busy} required/><button type="submit" disabled={busy||!newRoomName.trim()}>Create room</button></form>}
        {ward&&!roomsLoading&&rooms.length===0&&<p className="inline-status">No rooms are configured for this ward.</p>}
      </section>

      <section className="search-panel facility-level">
        <div className="facility-level-heading"><div><label>LEVEL 04</label><h3>Beds</h3></div><span>{beds.length}</span></div>
        {room&&canWrite&&<form className="facility-create-form" onSubmit={submitNewBed}><label htmlFor="facility-new-bed-number">Add bed</label><input id="facility-new-bed-number" value={newBedNumber} maxLength={50} onChange={event=>setNewBedNumber(event.target.value)} placeholder="Bed number" disabled={busy} required/><label className="facility-checkbox"><input type="checkbox" checked={newBedActive} onChange={event=>setNewBedActive(event.target.checked)} disabled={busy}/> Active</label><button type="submit" disabled={busy||!newBedNumber.trim()}>Create bed</button></form>}
        {bedsLoading&&<p className="inline-status" role="status">Loading beds…</p>}
        {room&&beds.length>0&&<div className="facility-bed-list">{beds.map(item=><article className="facility-bed-row" key={item.id}>
          {editingBedId===item.id?<form className="facility-bed-edit" onSubmit={submitBed}><label htmlFor={"facility-bed-number-"+item.id}>Bed number</label><input id={"facility-bed-number-"+item.id} value={bedNumber} maxLength={50} onChange={event=>setBedNumber(event.target.value)} required disabled={busy}/><label className="facility-checkbox"><input type="checkbox" checked={bedActive} onChange={event=>setBedActive(event.target.checked)} disabled={busy}/> Active</label><button type="submit" disabled={busy||!bedNumber.trim()}>Save</button><button type="button" className="clinical-secondary" onClick={()=>setEditingBedId("")} disabled={busy}>Cancel</button></form>
          :<><div><strong>{item.number}</strong><span className={item.isActive?"facility-bed-active":"facility-bed-inactive"}>{item.isActive?"Active":"Inactive"}</span></div>{canWrite&&<button type="button" className="clinical-secondary" onClick={()=>{setEditingBedId(item.id);setBedNumber(item.number);setBedActive(item.isActive);}}>Edit</button>}{canDelete&&<button type="button" className="queue-action-danger" onClick={()=>askDelete("bed",item.id,item.number)} disabled={busy}>Delete</button>}</>}
        </article>)}</div>}
        {room&&!bedsLoading&&beds.length===0&&<p className="inline-status">No beds are configured for this room.</p>}
      </section>
    </div>}

    {deleteTarget&&<div className="facility-delete-confirm" role="alertdialog" aria-labelledby="facility-delete-title" aria-describedby="facility-delete-description">
      <div><strong id="facility-delete-title">Delete {deleteTarget.label}?</strong><p id="facility-delete-description">This action cannot be undone. The API rejects deletion when child facilities depend on this record.</p></div>
      <div className="facility-form-actions"><button type="button" className="queue-action-danger" onClick={confirmDelete} disabled={busy}>{busy?"Deleting…":"Confirm delete"}</button><button type="button" className="clinical-secondary" onClick={()=>setDeleteTarget(null)} disabled={busy}>Cancel</button></div>
    </div>}
  </section>;
}
