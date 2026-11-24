import { useEffect,useState } from "react";
import type { FormEvent } from "react";
import { Route,Routes,useNavigate } from "react-router-dom";
import type { User } from "oidc-client-ts";
import { isAuthenticationConfigured,userManager } from "../auth/oidc";
import {
  ApiError,
  getCurrentUserTenantContexts,
  getHospitals,
  searchPatients,
  checkPatientDuplicateCandidates,
  registerPatient,
  assignPatientMedicalRecordNumber,
  listDepartments,
  listAvailabilitySessions,
  getAppointmentSlots,
  bookAppointment,
  checkInAppointment,
  createWalkIn,
  listQueue,
  type PatientRegistrationInput,
  type PatientDuplicateCheck,
  type Hospital,
  type Patient,
  type UserTenantContext,
  type Department,
  type AvailabilitySession,
  type AppointmentSlot,
  type Appointment,
  type QueueEntry
} from "../api/compilecare";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const localDateToday = () => { const d=new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); };

function Callback() {
  const navigate = useNavigate();
  const [error,setError] = useState("");

  useEffect(() => {
    const manager = userManager;
    if (!manager) { setError("Authentication is not configured."); return; }
    let active = true;
    manager.signinCallback()
      .then(() => { if (active) navigate("/",{replace:true}); })
      .catch(() => { if (active) setError("Sign-in could not be completed. Return to the workspace and try again."); });
    return () => { active = false; };
  },[navigate]);

  return <main className="callback" role="status">{error || "Completing secure sign-in…"}</main>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "The request could not be completed. Try again.";
}

function patientName(patient: Patient): string {
  return [patient.givenName,patient.middleName,patient.familyName].filter(Boolean).join(" ");
}

function Workspace() {
  const [user,setUser] = useState<User|null>(null);
  const [sessionLoading,setSessionLoading] = useState(true);
  const [contexts,setContexts] = useState<UserTenantContext[]>([]);
  const [contextsLoading,setContextsLoading] = useState(false);
  const [contextsError,setContextsError] = useState("");
  const [selectedTenantId,setSelectedTenantId] = useState("");
  const [hospitals,setHospitals] = useState<Hospital[]>([]);
  const [hospitalsLoading,setHospitalsLoading] = useState(false);
  const [hospitalsError,setHospitalsError] = useState("");
  const [selectedHospitalId,setSelectedHospitalId] = useState("");
  const [patientQuery,setPatientQuery] = useState("");
  const [patients,setPatients] = useState<Patient[]>([]);
  const [patientTotal,setPatientTotal] = useState(0);
  const [patientPage,setPatientPage] = useState(1);
  const [patientTotalPages,setPatientTotalPages] = useState(0);
  const [searchLoading,setSearchLoading] = useState(false);
  const [searchError,setSearchError] = useState("");
  const [hasSearched,setHasSearched] = useState(false);
  const [registrationGivenName,setRegistrationGivenName] = useState("");
  const [registrationMiddleName,setRegistrationMiddleName] = useState("");
  const [registrationFamilyName,setRegistrationFamilyName] = useState("");
  const [registrationDob,setRegistrationDob] = useState("");
  const [duplicateCheck,setDuplicateCheck] = useState<PatientDuplicateCheck|null>(null);
  const [duplicateLoading,setDuplicateLoading] = useState(false);
  const [duplicateError,setDuplicateError] = useState("");
  const [duplicateAcknowledged,setDuplicateAcknowledged] = useState(false);
  const [registrationLoading,setRegistrationLoading] = useState(false);
  const [registrationError,setRegistrationError] = useState("");

  const [registrationSuccess,setRegistrationSuccess] = useState("");
  const [departments,setDepartments] = useState<Department[]>([]);
  const [departmentsLoading,setDepartmentsLoading] = useState(false);
  const [departmentsError,setDepartmentsError] = useState("");
  const [selectedDepartmentId,setSelectedDepartmentId] = useState("");
  const [selectedPatient,setSelectedPatient] = useState<Patient|null>(null);
  const [appointmentDate,setAppointmentDate] = useState(localDateToday());
  const [availabilitySessions,setAvailabilitySessions] = useState<AvailabilitySession[]>([]);
  const [availabilityLoading,setAvailabilityLoading] = useState(false);
  const [availabilityError,setAvailabilityError] = useState("");
  const [selectedSessionId,setSelectedSessionId] = useState("");
  const [slots,setSlots] = useState<AppointmentSlot[]>([]);
  const [slotsLoading,setSlotsLoading] = useState(false);
  const [selectedSlotStart,setSelectedSlotStart] = useState("");
  const [appointmentReason,setAppointmentReason] = useState("");
  const [bookingLoading,setBookingLoading] = useState(false);
  const [bookingError,setBookingError] = useState("");
  const [bookedAppointment,setBookedAppointment] = useState<Appointment|null>(null);
  const [checkInLoading,setCheckInLoading] = useState(false);
  const [checkInError,setCheckInError] = useState("");
  const [queueEntry,setQueueEntry] = useState<QueueEntry|null>(null);
  const [walkInLoading,setWalkInLoading] = useState(false);
  const [walkInError,setWalkInError] = useState("");
  const [queueEntries,setQueueEntries] = useState<QueueEntry[]>([]);
  const [queueLoading,setQueueLoading] = useState(false);
  const [queueError,setQueueError] = useState("");
  const [queueDate,setQueueDate] = useState(localDateToday());
  const [hospitalTimeZone,setHospitalTimeZone] = useState("Asia/Kolkata");

  useEffect(() => {
    const manager = userManager;
    if (!manager) { setSessionLoading(false); return; }
    let active = true;
    manager.getUser()
      .then(value => { if (active) setUser(value); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setSessionLoading(false); });
    const loaded = (value: User) => setUser(value);
    const unloaded = () => setUser(null);
    manager.events.addUserLoaded(loaded);
    manager.events.addUserUnloaded(unloaded);
    return () => {
      active = false;
      manager.events.removeUserLoaded(loaded);
      manager.events.removeUserUnloaded(unloaded);
    };
  },[]);

  useEffect(() => {
    if (!user) {
      setContexts([]);
      setSelectedTenantId("");
      setHospitals([]);
      setSelectedHospitalId("");
      clearRegistrationDraft();
      return;
    }
    if (!apiBaseUrl) {
      setContextsError("Set VITE_API_BASE_URL to connect this workspace to CompileCare.Api.");
      return;
    }
    let active = true;
    setContextsLoading(true);
    setContextsError("");
    getCurrentUserTenantContexts(apiBaseUrl,user.access_token)
      .then(page => {
        if (!active) return;
        setContexts(page.items);
        setSelectedTenantId(current =>
          current && page.items.some(item => item.tenantId === current)
            ? current
            : page.items.length === 1 ? page.items[0].tenantId : "");
      })
      .catch(error => { if (active) setContextsError(getErrorMessage(error)); })
      .finally(() => { if (active) setContextsLoading(false); });
    return () => { active = false; };
  },[user]);

  useEffect(() => {
    if (!user || !selectedTenantId || !apiBaseUrl) {
      setHospitals([]);
      setSelectedHospitalId("");
      return;
    }
    let active = true;
    setHospitalsLoading(true);
    setHospitalsError("");
    setSelectedHospitalId("");
    setPatients([]);
    setHasSearched(false);
    getHospitals(apiBaseUrl,user.access_token,selectedTenantId)
      .then(page => {
        if (!active) return;
        setHospitals(page.items);
        setSelectedHospitalId(page.items.length === 1 ? page.items[0].id : "");
      })
      .catch(error => { if (active) setHospitalsError(getErrorMessage(error)); })
      .finally(() => { if (active) setHospitalsLoading(false); });
    return () => { active = false; };
  },[user,selectedTenantId]);


  useEffect(() => {
    if (!user || !apiBaseUrl || !selectedTenantId || !selectedHospitalId) {
      setDepartments([]); setSelectedDepartmentId(""); return;
    }
    let active=true;
    setDepartmentsLoading(true); setDepartmentsError("");
    listDepartments(apiBaseUrl,user.access_token,selectedTenantId,selectedHospitalId)
      .then(page=>{if(active){setDepartments(page.items);setSelectedDepartmentId(current=>page.items.some(x=>x.id===current)?current:page.items.length===1?page.items[0].id:"");}})
      .catch(error=>{if(active)setDepartmentsError(getErrorMessage(error));})
      .finally(()=>{if(active)setDepartmentsLoading(false);});
    return ()=>{active=false;};
  },[user,selectedTenantId,selectedHospitalId]);

  const selectedContext = contexts.find(value => value.tenantId === selectedTenantId);
  const selectedDepartment = departments.find(x=>x.id===selectedDepartmentId);
  const selectedSession = availabilitySessions.find(x=>x.id===selectedSessionId);

  async function loadAvailability() {
    if(!user||!apiBaseUrl||!selectedTenantId||!selectedHospitalId||!selectedDepartmentId)return;
    setAvailabilityLoading(true);setAvailabilityError("");setAvailabilitySessions([]);setSelectedSessionId("");setSlots([]);setSelectedSlotStart("");setBookingError("");setBookedAppointment(null);setQueueEntry(null);
    try {
      const page=await listAvailabilitySessions(apiBaseUrl,user.access_token,selectedTenantId,selectedHospitalId,appointmentDate,selectedDepartmentId);
      setAvailabilitySessions(page.items);
      if(page.items.length===0)setAvailabilityError("No provider availability is published for this department and date.");
    } catch(error){setAvailabilityError(getErrorMessage(error));}
    finally{setAvailabilityLoading(false);}
  }

  async function selectAvailabilitySession(sessionId:string) {
    setSelectedSessionId(sessionId);setSlots([]);setSelectedSlotStart("");setAvailabilityError("");
    if(!user||!apiBaseUrl||!selectedTenantId||!selectedHospitalId||!sessionId)return;
    setSlotsLoading(true);
    try{setSlots(await getAppointmentSlots(apiBaseUrl,user.access_token,selectedTenantId,selectedHospitalId,sessionId));}
    catch(error){setAvailabilityError(getErrorMessage(error));}
    finally{setSlotsLoading(false);}
  }

  async function handleBookAppointment(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!user||!apiBaseUrl||!selectedTenantId||!selectedHospitalId||!selectedPatient||!selectedSession||!selectedSlotStart)return;
    setBookingLoading(true);setBookingError("");setBookedAppointment(null);setQueueEntry(null);
    try{
      const result=await bookAppointment(apiBaseUrl,user.access_token,selectedTenantId,selectedHospitalId,{
        availabilitySessionId:selectedSession.id,patientId:selectedPatient.id,slotStartsAtUtc:selectedSlotStart,reason:appointmentReason.trim()||null
      });
      setBookedAppointment(result);
    }catch(error){setBookingError(getErrorMessage(error));}
    finally{setBookingLoading(false);}
  }

  async function handleAppointmentCheckIn() {
    if(!user||!apiBaseUrl||!selectedTenantId||!selectedHospitalId||!bookedAppointment)return;
    setCheckInLoading(true);setCheckInError("");
    try{setQueueEntry(await checkInAppointment(apiBaseUrl,user.access_token,selectedTenantId,selectedHospitalId,bookedAppointment.id));}
    catch(error){setCheckInError(getErrorMessage(error));}
    finally{setCheckInLoading(false);}
  }

  async function handleWalkIn() {
    if(!user||!apiBaseUrl||!selectedTenantId||!selectedHospitalId||!selectedPatient||!selectedDepartmentId)return;
    setWalkInLoading(true);setWalkInError("");
    try{
      const entry=await createWalkIn(apiBaseUrl,user.access_token,selectedTenantId,selectedHospitalId,{departmentId:selectedDepartmentId,patientId:selectedPatient.id,timeZoneId:hospitalTimeZone});
      setQueueEntry(entry);
      await loadQueue();
    }catch(error){setWalkInError(getErrorMessage(error));}
    finally{setWalkInLoading(false);}
  }

  async function loadQueue() {
    if(!user||!apiBaseUrl||!selectedTenantId||!selectedHospitalId||!selectedDepartmentId)return;
    setQueueLoading(true);setQueueError("");
    try{const page=await listQueue(apiBaseUrl,user.access_token,selectedTenantId,selectedHospitalId,selectedDepartmentId,queueDate);setQueueEntries(page.items);}
    catch(error){setQueueEntries([]);setQueueError(getErrorMessage(error));}
    finally{setQueueLoading(false);}
  }


  async function handlePatientSearch(pageNumber = 1) {
    if (!user || !apiBaseUrl || !selectedTenantId || !selectedHospitalId) return;
    if (patientQuery.trim().length < 2) {
      setSearchError("Enter at least two characters to search.");
      setPatients([]);
      setPatientTotal(0);
      setPatientTotalPages(0);
      setHasSearched(false);
      return;
    }
    setSearchLoading(true);
    setSearchError("");
    setHasSearched(false);
    setPatientPage(pageNumber);
    try {
      const page = await searchPatients(
        apiBaseUrl,user.access_token,selectedTenantId,selectedHospitalId,patientQuery,pageNumber);
      setPatients(page.items);
      setPatientTotal(page.totalCount);
      setPatientTotalPages(page.totalPages);
      setHasSearched(true);
    } catch (error) {
      setPatients([]);
      setPatientTotal(0);
      setPatientTotalPages(0);
      setSearchError(getErrorMessage(error));
    } finally {
      setSearchLoading(false);
    }
  }

  function registrationInput(): PatientRegistrationInput {
    return {
      givenName: registrationGivenName.trim(),
      middleName: registrationMiddleName.trim() || null,
      familyName: registrationFamilyName.trim() || null,
      dateOfBirth: registrationDob || null
    };
  }

  function resetRegistrationReview() {
    setDuplicateCheck(null);
    setDuplicateError("");
    setDuplicateAcknowledged(false);
    setRegistrationError("");
    setRegistrationSuccess("");
  }

  function clearRegistrationDraft() {
    setRegistrationGivenName("");
    setRegistrationMiddleName("");
    setRegistrationFamilyName("");
    setRegistrationDob("");
    setDuplicateCheck(null);
    setDuplicateError("");
    setDuplicateAcknowledged(false);
    setRegistrationError("");
    setRegistrationSuccess("");
  }

  async function handleDuplicateCheck() {
    if (!user || !apiBaseUrl || !selectedTenantId || !selectedHospitalId) return;
    if (!registrationGivenName.trim()) {
      setDuplicateError("Given name is required before checking for possible duplicates.");
      return;
    }
    setDuplicateLoading(true);
    setDuplicateError("");
    setRegistrationError("");
    setRegistrationSuccess("");
    setDuplicateAcknowledged(false);
    try {
      const result = await checkPatientDuplicateCandidates(
        apiBaseUrl,user.access_token,selectedTenantId,selectedHospitalId,registrationInput());
      setDuplicateCheck(result);
    } catch (error) {
      setDuplicateCheck(null);
      setDuplicateError(getErrorMessage(error));
    } finally {
      setDuplicateLoading(false);
    }
  }

  async function handlePatientRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !apiBaseUrl || !selectedTenantId || !selectedHospitalId) return;
    if (!duplicateCheck || !duplicateAcknowledged) {
      setRegistrationError("Complete the duplicate review and confirm that this is a new patient before registering.");
      return;
    }
    setRegistrationLoading(true);
    setRegistrationError("");
    setRegistrationSuccess("");
    try {
      const patient = await registerPatient(
        apiBaseUrl,user.access_token,selectedTenantId,selectedHospitalId,registrationInput());
      try {
        const identifier = await assignPatientMedicalRecordNumber(
          apiBaseUrl,user.access_token,selectedTenantId,selectedHospitalId,patient.id);
        setRegistrationSuccess(`Patient ${patientName(patient)} was registered successfully and MRN ${identifier.value} was assigned.`);
      } catch {
        setRegistrationSuccess(`Patient ${patientName(patient)} was registered successfully. MRN assignment is pending; ask an authorized administrator to verify the hospital MRN policy and your identifier permissions.`);
      }
      setPatients([]);
      setHasSearched(false);
      setPatientTotal(0);
      setPatientTotalPages(0);
      setRegistrationGivenName("");
      setRegistrationMiddleName("");
      setRegistrationFamilyName("");
      setRegistrationDob("");
      setDuplicateCheck(null);
      setDuplicateAcknowledged(false);
    } catch (error) {
      setRegistrationError(getErrorMessage(error));
    } finally {
      setRegistrationLoading(false);
    }
  }

  function changeTenant(tenantId: string) {
    setSelectedTenantId(tenantId);
    setSelectedPatient(null); setAvailabilitySessions([]); setSlots([]); setBookedAppointment(null); setQueueEntry(null); setQueueEntries([]);
    setSelectedHospitalId("");
    setHospitals([]);
    setPatients([]);
    setPatientTotal(0);
    setPatientTotalPages(0);
    setPatientPage(1);
    setPatientQuery("");
    setHasSearched(false);
    setSearchError("");
    clearRegistrationDraft();
  }

  function changeHospital(hospitalId: string) {
    setSelectedHospitalId(hospitalId);
    setSelectedPatient(null); setAvailabilitySessions([]); setSlots([]); setBookedAppointment(null); setQueueEntry(null); setQueueEntries([]);
    setPatients([]);
    setPatientTotal(0);
    setPatientTotalPages(0);
    setPatientPage(1);
    setPatientQuery("");
    setHasSearched(false);
    setSearchError("");
    clearRegistrationDraft();
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><b>C</b><span>CompileCare<small>HOSPITAL WORKSPACE</small></span></div>
      <nav aria-label="Primary navigation">
        <p>WORKSPACE</p>
        <a className="selected" href="#reception">Reception</a>
        <a href="#appointments">Appointments</a>
        <a href="#queue">Queue</a>
      </nav>
      <footer>Secure by design<br/><small>Tenant-scoped access</small></footer>
    </aside>
    <main className="content" id="reception">
      <header>
        <div><label>HOSPITAL OPERATIONS</label><h1>Reception workspace</h1></div>
        <div className="session">
          {sessionLoading ? "Checking session…" : user ?
            <><span>{String(user.profile.name ?? user.profile.preferred_username ?? "Signed-in user")}</span>
            <button onClick={() => userManager?.signoutRedirect()}>Sign out</button></> :
            <button disabled={!isAuthenticationConfigured} onClick={() => userManager?.signinRedirect()}>Sign in</button>}
        </div>
      </header>

      {!isAuthenticationConfigured && <div className="notice" role="status"><b>Authentication setup required.</b> Configure the OIDC environment variables before enabling staff sign-in.</div>}
      {user && !apiBaseUrl && <div className="notice" role="alert">Set VITE_API_BASE_URL to connect this workspace to CompileCare.Api.</div>}
      {user && apiBaseUrl && <>
        <section className="context-panel">
          <div><label>ACTIVE ORGANIZATION</label><h2>Select your hospital context</h2><p>Only active memberships assigned to your validated sign-in are listed.</p></div>
          <div className="context-controls">
            <label htmlFor="tenant-select">Tenant</label>
            <select id="tenant-select" value={selectedTenantId} onChange={event => changeTenant(event.target.value)} disabled={contextsLoading || contexts.length === 0 || duplicateLoading || registrationLoading}>
              <option value="">Select a tenant</option>
              {contexts.map(context => <option key={context.tenantId} value={context.tenantId}>{context.tenantName} · {context.role}</option>)}
            </select>
            <label htmlFor="hospital-select">Hospital</label>
            <select id="hospital-select" value={selectedHospitalId} onChange={event => changeHospital(event.target.value)} disabled={!selectedTenantId || hospitalsLoading || hospitals.length === 0 || duplicateLoading || registrationLoading}>
              <option value="">Select a hospital</option>
              {hospitals.map(hospital => <option key={hospital.id} value={hospital.id}>{hospital.name}{hospital.code ? ` · ${hospital.code}` : ""}</option>)}
            </select>
          </div>
          {contextsLoading && <p className="inline-status" role="status">Loading your active tenant memberships…</p>}
          {contextsError && <p className="inline-error" role="alert">{contextsError}</p>}
          {!contextsLoading && !contextsError && contexts.length === 0 && <p className="inline-status">No active tenant membership was found for this identity. Contact your CompileCare administrator.</p>}
          {selectedContext && <p className="context-scope">Role: <strong>{selectedContext.role}</strong> · {selectedContext.scopes.map(scope => scope.scopeType).join(", ")} scope</p>}
          {hospitalsLoading && <p className="inline-status" role="status">Loading hospitals available to this membership…</p>}
          {hospitalsError && <p className="inline-error" role="alert">{hospitalsError}</p>}
          {selectedTenantId && !hospitalsLoading && !hospitalsError && hospitals.length === 0 && <p className="inline-status">No hospitals are available in the selected tenant or within your assigned scope.</p>}
        </section>

        <section className="section reception-section">
          <div className="section-heading"><div><label>RECEPTION</label><h2>Find a registered patient</h2></div></div>
          <div className="search-panel">
            <label htmlFor="patient-search">Patient name</label>
            <div className="search-row">
              <input id="patient-search" type="search" value={patientQuery} onChange={event => { setPatientQuery(event.target.value); setSelectedPatient(null); setHasSearched(false); setPatients([]); setPatientTotal(0); setPatientTotalPages(0); setSearchError(""); }} placeholder="Search by given or family name" disabled={!selectedHospitalId || searchLoading}/>
              <button onClick={() => handlePatientSearch()} disabled={!selectedHospitalId || searchLoading || patientQuery.trim().length < 2}>{searchLoading ? "Searching…" : "Search patients"}</button>
            </div>
            <p className="helper-text">Search is limited to the selected hospital. Results are not stored in browser storage.</p>
            {searchError && <p className="inline-error" role="alert">{searchError}</p>}
            {hasSearched && <p className="result-count" role="status">Showing {patientTotal === 0 ? 0 : (patientPage - 1) * 25 + 1}–{Math.min(patientPage * 25,patientTotal)} of {patientTotal} matching patients</p>}
            {hasSearched && patients.length === 0 && <p className="inline-status">No matching patients were found.</p>}
            {patients.length > 0 && <div className="patient-results" aria-label="Patient search results">
              {patients.map(patient => <article className={"patient-result patient-result-selectable "+(selectedPatient?.id===patient.id?"patient-result-active":"")} key={patient.id} role="button" tabIndex={0} aria-pressed={selectedPatient?.id===patient.id} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setSelectedPatient(patient);setBookedAppointment(null);setQueueEntry(null);setBookingError("");setWalkInError("");}}} onClick={() => { setSelectedPatient(patient); setBookedAppointment(null); setQueueEntry(null); setBookingError(""); setWalkInError(""); }}>
                <div><strong>{patientName(patient)}</strong><span>{patient.dateOfBirth ? `Date of birth: ${patient.dateOfBirth}` : "Date of birth not recorded"}</span></div>
                <small>Registered patient</small>
              </article>)}
            </div>}
            {hasSearched && patientTotalPages > 1 && <div className="pagination"><button onClick={() => handlePatientSearch(patientPage - 1)} disabled={searchLoading || patientPage <= 1}>Previous</button><span>Page {patientPage} of {patientTotalPages}</span><button onClick={() => handlePatientSearch(patientPage + 1)} disabled={searchLoading || patientPage >= patientTotalPages}>Next</button></div>}
          </div>
        </section>


        <section className="section appointment-section" id="appointments">
          <div className="section-heading"><div><label>APPOINTMENTS</label><h2>Book a consultation</h2><p className="helper-text">Select a patient from the search results above, then choose a published provider slot.</p></div></div>
          <div className="search-panel">
            <div className="workflow-step"><span>01</span><div><strong>Patient</strong><small>{selectedPatient?patientName(selectedPatient):"Choose a patient from the search results"}</small></div></div>
            <div className="appointment-grid">
              <div><label htmlFor="appointment-department">Department</label><select id="appointment-department" value={selectedDepartmentId} onChange={e=>{setSelectedDepartmentId(e.target.value);setAvailabilitySessions([]);setSlots([]);setSelectedSessionId("");setSelectedSlotStart("");setQueueEntries([]);setBookedAppointment(null);setQueueEntry(null);}} disabled={departmentsLoading||departments.length===0}><option value="">Select department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}{d.code?" · "+d.code:""}</option>)}</select></div>
              <div><label htmlFor="appointment-date">Appointment date</label><input id="appointment-date" type="date" min={localDateToday()} value={appointmentDate} onChange={e=>{setAppointmentDate(e.target.value);setAvailabilitySessions([]);setSlots([]);setSelectedSessionId("");setSelectedSlotStart("");}} /></div>
            </div>
            {departmentsLoading&&<p className="inline-status" role="status">Loading departments available to your hospital context…</p>}{departmentsError&&<p className="inline-error" role="alert">{departmentsError}</p>}
            <div className="registration-actions"><button type="button" onClick={loadAvailability} disabled={!selectedPatient||!selectedDepartmentId||!appointmentDate||availabilityLoading}>{availabilityLoading?"Finding availability…":"Find available appointments"}</button></div>
            {availabilityError&&<p className="inline-error" role="alert">{availabilityError}</p>}
            {availabilitySessions.length>0&&<div className="slot-panel">
              <label htmlFor="availability-session">Provider availability</label>
              <select id="availability-session" value={selectedSessionId} onChange={e=>selectAvailabilitySession(e.target.value)}><option value="">Choose a provider session</option>{availabilitySessions.map(session=><option key={session.id} value={session.id}>Session · {new Date(session.startsAtUtc).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",timeZone:session.timeZoneId})}–{new Date(session.endsAtUtc).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",timeZone:session.timeZoneId})}</option>)}</select>
              {slotsLoading&&<p className="inline-status" role="status">Loading available slots…</p>}{selectedSessionId&&!slotsLoading&&slots.length===0&&<p className="inline-status">No slots are available in this session.</p>}
              {slots.length>0&&<div className="slot-grid" role="group" aria-label="Available appointment slots">{slots.map(slot=><button type="button" key={slot.startsAtUtc} className={selectedSlotStart===slot.startsAtUtc?"slot-selected":""} disabled={!slot.isAvailable} onClick={()=>setSelectedSlotStart(slot.startsAtUtc)}>{new Date(slot.startsAtUtc).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",timeZone:selectedSession?.timeZoneId})}<small>{slot.isAvailable?"Available":"Unavailable"}</small></button>)}</div>}
            </div>}
            {selectedSlotStart&&<form onSubmit={handleBookAppointment} className="booking-review">
              <div className="review-summary"><strong>Review appointment</strong><span>{selectedPatient?patientName(selectedPatient):""} · {selectedDepartment?.name}</span><span>{new Date(selectedSlotStart).toLocaleString([],{dateStyle:"medium",timeStyle:"short",timeZone:selectedSession?.timeZoneId})} ({selectedSession?.timeZoneId})</span></div>
              <label htmlFor="appointment-reason">Visit reason (optional)</label><input id="appointment-reason" maxLength={250} value={appointmentReason} onChange={e=>setAppointmentReason(e.target.value)} placeholder="e.g. Follow-up" />
              {bookingError&&<p className="inline-error" role="alert">{bookingError}</p>}
              <div className="registration-actions"><button type="submit" disabled={bookingLoading}>{bookingLoading?"Confirming booking…":"Confirm appointment"}</button></div>
            </form>}
            {bookedAppointment&&<div className="arrival-success" role="status"><div><strong>Appointment confirmed</strong><span>Reference {bookedAppointment.id.slice(0,8)} · {bookedAppointment.status}</span></div><button type="button" onClick={handleAppointmentCheckIn} disabled={checkInLoading||!!queueEntry}>{checkInLoading?"Checking in…":queueEntry?"Checked in":"Check in patient"}</button></div>}
            {checkInError&&<p className="inline-error" role="alert">{checkInError}</p>}
            {queueEntry&&<div className="token-card" role="status"><small>QUEUE TOKEN</small><strong>{queueEntry.tokenNumber.toString().padStart(2,"0")}</strong><span>{queueEntry.status} · {queueEntry.queueDateLocal}</span></div>}
          </div>
        </section>

        <section className="section walkin-section">
          <div className="section-heading"><div><label>WALK-IN ARRIVAL</label><h2>Register a walk-in</h2><p className="helper-text">Walk-ins are registered directly into the department queue. The API assigns the token.</p></div></div>
          <div className="search-panel walkin-panel">
            <div className="workflow-step"><span>02</span><div><strong>Selected patient</strong><small>{selectedPatient?patientName(selectedPatient):"Select a patient from search results"}</small></div></div>
            <div className="walkin-action"><div><strong>{selectedDepartment?.name||"Choose a department above"}</strong><label htmlFor="walkin-timezone">Hospital time zone</label><input id="walkin-timezone" value={hospitalTimeZone} onChange={e=>setHospitalTimeZone(e.target.value)} maxLength={100} /></div><button type="button" onClick={handleWalkIn} disabled={!selectedPatient||!selectedDepartmentId||walkInLoading}>{walkInLoading?"Registering…":"Add to queue"}</button></div>
            {walkInError&&<p className="inline-error" role="alert">{walkInError}</p>}
          </div>
        </section>

        <section className="section queue-section" id="queue">
          <div className="section-heading"><div><label>LIVE OPERATIONS</label><h2>Department queue</h2></div></div>
          <div className="search-panel">
            <div className="appointment-grid"><div><label htmlFor="queue-department">Department</label><select id="queue-department" value={selectedDepartmentId} onChange={e=>setSelectedDepartmentId(e.target.value)}><option value="">Select department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div><div><label htmlFor="queue-date">Queue date</label><input id="queue-date" type="date" value={queueDate} onChange={e=>{setQueueDate(e.target.value);setQueueEntries([]);}} /></div></div>
            <div className="registration-actions"><button type="button" onClick={loadQueue} disabled={!selectedDepartmentId||queueLoading}>{queueLoading?"Refreshing queue…":"Refresh queue"}</button></div>
            {queueError&&<p className="inline-error" role="alert">{queueError}</p>}
            {queueEntries.length>0?<div className="queue-list">{queueEntries.map(entry=><div className="queue-row" key={entry.id}><strong>#{entry.tokenNumber.toString().padStart(2,"0")}</strong><span>{entry.status}</span><small>{new Date(entry.checkedInAtUtc).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</small></div>)}</div>:!queueLoading&&!queueError&&<p className="inline-status">Queue is empty or has not been loaded for this department and date.</p>}
          </div>
        </section>

        <section className="section registration-section">
          <div className="section-heading">
            <div><label>PATIENT REGISTRATION</label><h2>Register a new patient</h2></div>
          </div>
          <form className="search-panel" onSubmit={handlePatientRegistration}>
            <p className="helper-text">Patient master and hospital registration are created together by the API. Contact details are intentionally not collected in this initial workflow.</p>
            <div className="registration-grid">
              <div><label htmlFor="registration-given-name">Given name *</label><input id="registration-given-name" value={registrationGivenName} maxLength={100} onChange={event => { setRegistrationGivenName(event.target.value); resetRegistrationReview(); }} disabled={!selectedHospitalId || registrationLoading} required /></div>
              <div><label htmlFor="registration-middle-name">Middle name</label><input id="registration-middle-name" value={registrationMiddleName} maxLength={100} onChange={event => { setRegistrationMiddleName(event.target.value); resetRegistrationReview(); }} disabled={!selectedHospitalId || registrationLoading} /></div>
              <div><label htmlFor="registration-family-name">Family name</label><input id="registration-family-name" value={registrationFamilyName} maxLength={100} onChange={event => { setRegistrationFamilyName(event.target.value); resetRegistrationReview(); }} disabled={!selectedHospitalId || registrationLoading} /></div>
              <div><label htmlFor="registration-dob">Date of birth (if known)</label><input id="registration-dob" type="date" max={new Date().toISOString().slice(0,10)} value={registrationDob} onChange={event => { setRegistrationDob(event.target.value); resetRegistrationReview(); }} disabled={!selectedHospitalId || registrationLoading} /></div>
            </div>
            <div className="registration-actions">
              <button type="button" onClick={handleDuplicateCheck} disabled={!selectedHospitalId || !registrationGivenName.trim() || duplicateLoading || registrationLoading}>
                {duplicateLoading ? "Checking…" : "Check for possible duplicates"}
              </button>
            </div>
            {duplicateError && <p className="inline-error" role="alert">{duplicateError}</p>}
            {duplicateCheck && <div className="duplicate-review" aria-live="polite">
              <strong>{duplicateCheck.evaluated ? "Duplicate review completed" : "Manual identity review required"}</strong>
              <p>{duplicateCheck.evaluationMessage || (duplicateCheck.candidates.length ? "Review the possible matches below. Do not create a second record if this is the same person." : "No candidates were returned by the hospital-local check. This does not prove that no duplicate exists.")}</p>
              {duplicateCheck.candidates.length > 0 && <div className="duplicate-candidates">
                {duplicateCheck.candidates.map(candidate => <article key={candidate.patientId}>
                  <strong>{[candidate.givenName,candidate.middleName,candidate.familyName].filter(Boolean).join(" ")}</strong>
                  <span>DOB: {candidate.dateOfBirth}</span>
                  <small>Match signals: {candidate.matchSignals.join(", ")}</small>
                </article>)}
              </div>}
              {duplicateCheck.hasMoreCandidates && <p className="inline-error">More possible candidates exist than are displayed. Stop and follow the hospital identity-review procedure before creating a record.</p>}
              <label className="review-confirmation">
                <input type="checkbox" checked={duplicateAcknowledged} onChange={event => setDuplicateAcknowledged(event.target.checked)} disabled={duplicateCheck.hasMoreCandidates || registrationLoading} />
                I reviewed the result and followed the hospital identity-check procedure. This is a new patient, not an existing candidate.
              </label>
            </div>}
            {registrationError && <p className="inline-error" role="alert">{registrationError}</p>}
            {registrationSuccess && <p className="registration-success" role="status">{registrationSuccess}</p>}
            <div className="registration-actions">
              <button type="submit" disabled={!duplicateCheck || !duplicateAcknowledged || duplicateCheck.hasMoreCandidates || registrationLoading}>
                {registrationLoading ? "Registering…" : "Register patient"}
              </button>
            </div>
          </form>
        </section>
      </>}

      {!user && !sessionLoading && <section className="hero"><label>YOUR HOSPITAL, ONE WORKSPACE</label><h2>Good care starts with<br/><em>connected workflows.</em></h2><p>Sign in with your hospital identity to access the work areas assigned to you.</p><div className="symbol" aria-hidden="true">✚</div></section>}
      <footer className="pagefoot">CompileCare · Hospital information workspace <span>API authorization is enforced on every request.</span></footer>
    </main>
  </div>;
}

export function App() {
  return <Routes><Route path="/auth/callback" element={<Callback/>}/><Route path="*" element={<Workspace/>}/></Routes>;
}
