import { useEffect,useState } from "react";
import type { FormEvent } from "react";
import { Route,Routes,useNavigate } from "react-router-dom";
import type { User } from "oidc-client-ts";
import { isAuthenticationConfigured,userManager } from "../auth/oidc";
import { BillingWorkspace } from "../features/billing/BillingWorkspace";
import { PatientSearchResults } from "../features/reception/PatientSearchResults";
import { AppointmentSlotGrid } from "../features/appointments/AppointmentSlotGrid";
import { QueueEntryRow } from "../features/queue/QueueEntryRow";
import { ClinicalQueueRow } from "../features/clinical/ClinicalQueueRow";
import { FacilityManagement } from "../features/facilities/FacilityManagement";
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
  transitionQueueEntry,
  getOpdEncounterForQueue,
  getDepartmentPatient,
  createOpdEncounterFromQueue,
  updateOpdEncounterNote,
  signOpdEncounter,
  addOpdEncounterAmendment,
  closeOpdEncounter,
  cancelOpdEncounter,
  bootstrapPlatformOperator,
  createPlatformTenant,
  provisionInitialTenantAdministrator,
  activatePlatformTenant,
  createHospital,
  createDepartment,
  type OpdEncounter,
  type OpdEncounterNoteInput,
  type PatientRegistrationInput,
  type PatientDuplicateCheck,
  type Hospital,
  type Patient,
  type UserTenantContext,
  type Department,
  type AvailabilitySession,
  type AppointmentSlot,
  type Appointment,
  type QueueEntry,
  type QueueAction
} from "../api/compilecare";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const localPlatformBootstrapEnabled = import.meta.env.VITE_ENABLE_PLATFORM_BOOTSTRAP === "true";
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

function SilentCallback() {
  const [error,setError] = useState("");
  useEffect(() => {
    const manager = userManager;
    if (!manager) { setError("Authentication is not configured."); return; }
    manager.signinSilentCallback()
      .catch(() => setError("Session renewal could not be completed. Sign in again."));
  },[]);
  return <main className="callback" role="status">{error || "Renewing secure session…"}</main>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "The request could not be completed. Try again.";
}

function patientName(patient: Patient): string {
  return [patient.givenName,patient.middleName,patient.familyName].filter(Boolean).join(" ");
}


function ClinicalWorkspace({baseUrl,accessToken,tenantId,hospitalId,departments,permissions,onBusyChange}:{baseUrl:string;accessToken:string;tenantId:string;hospitalId:string;departments:Department[];permissions:string[];onBusyChange:(busy:boolean)=>void}) {
  const [departmentId,setDepartmentId]=useState("");
  const [queueDate,setQueueDate]=useState(localDateToday());
  const [queue,setQueue]=useState<QueueEntry[]>([]);
  const [loadingQueue,setLoadingQueue]=useState(false);
  const [queueError,setQueueError]=useState("");
  const [encounter,setEncounter]=useState<OpdEncounter|null>(null);
  const [clinicalPatient,setClinicalPatient]=useState<Patient|null>(null);
  const [identityConfirmed,setIdentityConfirmed]=useState(false);
  const [openingId,setOpeningId]=useState("");
  const [actionBusy,setActionBusy]=useState(false);
  const [actionError,setActionError]=useState("");
  const [actionSuccess,setActionSuccess]=useState("");
  const [chiefComplaint,setChiefComplaint]=useState("");
  const [history,setHistory]=useState("");
  const [examination,setExamination]=useState("");
  const [assessment,setAssessment]=useState("");
  const [plan,setPlan]=useState("");
  const [cancelReason,setCancelReason]=useState("");
  const [amendmentReason,setAmendmentReason]=useState("");
  const [amendmentContent,setAmendmentContent]=useState("");

  useEffect(()=>{setDepartmentId(current=>departments.some(x=>x.id===current)?current:departments.length===1?departments[0].id:"");},[departments]);
  const clinicalQueue=queue.filter(x=>x.status==="InProgress"||x.status==="Completed");
  const canManageEncounter=permissions.includes("encounter.manage");
  const canSignEncounter=permissions.includes("encounter.sign");
  const canAmendEncounter=permissions.includes("encounter.amend");
  const editable=encounter?.status==="InProgress"&&identityConfirmed&&canManageEncounter;
  const setBusy=(busy:boolean)=>{setActionBusy(busy);onBusyChange(busy);};
  function applyEncounter(value:OpdEncounter,patientValue:Patient|null=clinicalPatient,resetIdentity=false){
    setEncounter(value);setClinicalPatient(patientValue);if(resetIdentity)setIdentityConfirmed(false);setChiefComplaint(value.chiefComplaint??"");setHistory(value.history??"");
    setExamination(value.examination??"");setAssessment(value.assessment??"");setPlan(value.plan??"");
    setCancelReason("");setActionError("");setActionSuccess("");
  }
  async function refreshQueue(){
    setLoadingQueue(true);setQueueError("");setEncounter(null);setClinicalPatient(null);setIdentityConfirmed(false);
    try{const result=await listQueue(baseUrl,accessToken,tenantId,hospitalId,departmentId,queueDate);setQueue(result.items);}
    catch(error){setQueue([]);setQueueError(getErrorMessage(error));}
    finally{setLoadingQueue(false);}
  }
  async function openEncounter(entry:QueueEntry){
    setOpeningId(entry.id);setBusy(true);setActionError("");setActionSuccess("");
    try{
      let value:OpdEncounter;
      try{value=await getOpdEncounterForQueue(baseUrl,accessToken,tenantId,hospitalId,entry.id);}
      catch(error){
        if(!(error instanceof ApiError)||error.status!==404)throw error;
        if(entry.status!=="InProgress"||!canManageEncounter)throw error;
        try{value=await createOpdEncounterFromQueue(baseUrl,accessToken,tenantId,hospitalId,entry.id);}
        catch(createError){
          if(!(createError instanceof ApiError)||createError.status!==409)throw createError;
          try{value=await getOpdEncounterForQueue(baseUrl,accessToken,tenantId,hospitalId,entry.id);}
          catch(resumeError){if(resumeError instanceof ApiError&&resumeError.status===404)throw createError;throw resumeError;}
        }
      }
      const verifiedPatient=await getDepartmentPatient(baseUrl,accessToken,tenantId,hospitalId,entry.departmentId,value.patientId);
      applyEncounter(value,verifiedPatient,true);
    }catch(error){setActionError(getErrorMessage(error));}
    finally{setOpeningId("");setBusy(false);}
  }
  function noteInput():OpdEncounterNoteInput{
    return {chiefComplaint:chiefComplaint.trim()||null,history:history.trim()||null,examination:examination.trim()||null,assessment:assessment.trim()||null,plan:plan.trim()||null};
  }
  async function saveDraft(){
    if(!encounter||!editable)return;
    setBusy(true);setActionError("");setActionSuccess("");
    try{applyEncounter(await updateOpdEncounterNote(baseUrl,accessToken,tenantId,hospitalId,encounter.id,noteInput()));setActionSuccess("Draft note saved.");}
    catch(error){setActionError(getErrorMessage(error));}
    finally{setBusy(false);}
  }
  async function signEncounter(){
    if(!encounter||!editable)return;
    if(!chiefComplaint.trim()||!assessment.trim()){setActionError("Chief complaint and assessment are required before signing.");return;}
    setBusy(true);setActionError("");setActionSuccess("");
    try{
      const saved=await updateOpdEncounterNote(baseUrl,accessToken,tenantId,hospitalId,encounter.id,noteInput());
      const signed=await signOpdEncounter(baseUrl,accessToken,tenantId,hospitalId,saved.id);
      applyEncounter(signed);setActionSuccess("Encounter signed. The original note is now read-only.");
    }catch(error){setActionError(getErrorMessage(error));}
    finally{setBusy(false);}
  }
  async function closeEncounter(){
    if(!encounter||encounter.status!=="Signed")return;
    setBusy(true);setActionError("");setActionSuccess("");
    try{applyEncounter(await closeOpdEncounter(baseUrl,accessToken,tenantId,hospitalId,encounter.id));setActionSuccess("Encounter closed.");}
    catch(error){setActionError(getErrorMessage(error));}
    finally{setBusy(false);}
  }
  async function cancelEncounter(){
    if(!encounter||!editable)return;
    if(!cancelReason.trim()){setActionError("A cancellation reason is required.");return;}
    setBusy(true);setActionError("");setActionSuccess("");
    try{applyEncounter(await cancelOpdEncounter(baseUrl,accessToken,tenantId,hospitalId,encounter.id,{reason:cancelReason.trim()}));setActionSuccess("Unsigned encounter cancelled.");}
    catch(error){setActionError(getErrorMessage(error));}
    finally{setBusy(false);}
  }
  async function addAmendment(){
    if(!encounter||!(encounter.status==="Signed"||encounter.status==="Closed"))return;
    if(!amendmentReason.trim()||!amendmentContent.trim()){setActionError("Both amendment reason and content are required.");return;}
    setBusy(true);setActionError("");setActionSuccess("");
    try{
      applyEncounter(await addOpdEncounterAmendment(baseUrl,accessToken,tenantId,hospitalId,encounter.id,{reason:amendmentReason.trim(),content:amendmentContent.trim()}));
      setAmendmentReason("");setAmendmentContent("");setActionSuccess("Append-only amendment added.");
    }catch(error){setActionError(getErrorMessage(error));}
    finally{setBusy(false);}
  }
  return <section className="section clinical-section" id="clinical">
    <div className="section-heading"><div><label>CLINICAL WORKSPACE</label><h2>Outpatient consultations</h2><p className="helper-text">Clinical records are separate from queue operations. Only authorized ClinicalUser memberships can access this workspace.</p></div></div>
    <div className="search-panel clinical-panel">
      <div className="appointment-grid">
        <div><label htmlFor="clinical-department">Department</label><select id="clinical-department" value={departmentId} onChange={e=>{setDepartmentId(e.target.value);setQueue([]);setEncounter(null);}} disabled={actionBusy||loadingQueue}><option value="">Select department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}{d.code?" · "+d.code:""}</option>)}</select></div>
        <div><label htmlFor="clinical-queue-date">Queue date</label><input id="clinical-queue-date" type="date" value={queueDate} onChange={e=>{setQueueDate(e.target.value);setQueue([]);setEncounter(null);}} disabled={actionBusy||loadingQueue}/></div>
      </div>
      <div className="registration-actions"><button type="button" onClick={refreshQueue} disabled={!departmentId||loadingQueue||actionBusy}>{loadingQueue?"Loading clinical queue…":"Refresh clinical queue"}</button></div>
      <p className="helper-text">The queue view contains operational tokens only. Patient identity and clinical details are not exposed in queue rows.</p>
      {queueError&&<p className="inline-error" role="alert">{queueError}</p>}
      {queue.length>0?<div className="clinical-queue" aria-label="Clinical queue and recent completed visits">
        {clinicalQueue.map(entry=><ClinicalQueueRow
          key={entry.id}
          entry={entry}
          opening={openingId===entry.id}
          disabled={actionBusy||loadingQueue}
          onOpen={openEncounter}
        />)}
        {clinicalQueue.length===0&&<p className="inline-status">No in-progress consultations or completed visits are available for this department and date.</p>}
      </div>:!loadingQueue&&!queueError&&<p className="inline-status">Refresh the clinical queue to see in-progress consultations and completed visits.</p>}
    </div>
    {encounter&&<div className="search-panel encounter-panel">
      <div className="encounter-heading"><div><label>ENCOUNTER RECORD</label><h3>Consultation note</h3><p className="helper-text">Started {new Date(encounter.startedAtUtc).toLocaleString()}</p></div><span className={"queue-status queue-status-"+encounter.status.toLowerCase()}>{encounter.status}</span></div>
      {clinicalPatient&&<div className="clinical-patient-banner"><div><small>HOSPITAL REGISTRATION</small><strong>{patientName(clinicalPatient)}</strong><span>{clinicalPatient.dateOfBirth?"Date of birth: "+clinicalPatient.dateOfBirth:"Date of birth not recorded"}</span></div><span>Patient identity loaded from the selected hospital</span><label className="clinical-identity-confirm"><input type="checkbox" checked={identityConfirmed} onChange={e=>setIdentityConfirmed(e.target.checked)} disabled={actionBusy}/> I have verified the patient identity before documenting</label></div>}
      <p className="helper-text">Patient identity is retrieved through the hospital-scoped patient API. Do not copy clinical note text into general logs, URLs or support messages.</p>
      {!identityConfirmed&&<p className="inline-status" role="status">Verify the patient identity above to view or edit this encounter note.</p>}
      {identityConfirmed&&<>
      <div className="clinical-note-grid">
        <div><label htmlFor="clinical-chief">Chief complaint *</label><textarea id="clinical-chief" rows={3} maxLength={500} value={chiefComplaint} onChange={e=>setChiefComplaint(e.target.value)} disabled={!editable||actionBusy}/><small>{chiefComplaint.length}/500</small></div>
        <div><label htmlFor="clinical-history">History</label><textarea id="clinical-history" rows={4} maxLength={4000} value={history} onChange={e=>setHistory(e.target.value)} disabled={!editable||actionBusy}/><small>{history.length}/4000</small></div>
        <div><label htmlFor="clinical-examination">Examination</label><textarea id="clinical-examination" rows={4} maxLength={4000} value={examination} onChange={e=>setExamination(e.target.value)} disabled={!editable||actionBusy}/><small>{examination.length}/4000</small></div>
        <div><label htmlFor="clinical-assessment">Assessment *</label><textarea id="clinical-assessment" rows={3} maxLength={2000} value={assessment} onChange={e=>setAssessment(e.target.value)} disabled={!editable||actionBusy}/><small>{assessment.length}/2000</small></div>
        <div className="clinical-plan"><label htmlFor="clinical-plan">Plan</label><textarea id="clinical-plan" rows={4} maxLength={4000} value={plan} onChange={e=>setPlan(e.target.value)} disabled={!editable||actionBusy}/><small>{plan.length}/4000</small></div>
      </div>
      {editable&&<div className="clinical-actions">{canManageEncounter&&<button type="button" className="clinical-secondary" onClick={saveDraft} disabled={actionBusy}>{actionBusy?"Saving…":"Save draft"}</button>}{canSignEncounter&&<button type="button" onClick={signEncounter} disabled={actionBusy||!chiefComplaint.trim()||!assessment.trim()}>Review and sign</button>}</div>}
      {editable&&<div className="clinical-cancel"><label htmlFor="clinical-cancel-reason">Cancellation reason (required to cancel an unsigned encounter)</label><input id="clinical-cancel-reason" value={cancelReason} maxLength={250} onChange={e=>setCancelReason(e.target.value)} disabled={actionBusy}/><button type="button" className="queue-action-danger" onClick={cancelEncounter} disabled={actionBusy||!cancelReason.trim()}>Cancel encounter</button></div>}
      {encounter.status==="Signed"&&canManageEncounter&&<div className="clinical-actions"><button type="button" onClick={closeEncounter} disabled={actionBusy}>{actionBusy?"Closing…":"Close encounter"}</button></div>}
      {(encounter.status==="Signed"||encounter.status==="Closed")&&<div className="amendment-panel">
        <h4>Amendment history</h4>
        {encounter.amendments.length>0?encounter.amendments.map(item=><article className="amendment-item" key={item.id}><strong>{item.reason}</strong><p>{item.content}</p><small>Added {new Date(item.createdAtUtc).toLocaleString()}</small></article>):<p className="inline-status">No amendments have been added.</p>}
        {canAmendEncounter&&<><label htmlFor="amendment-reason">Amendment reason</label><input id="amendment-reason" value={amendmentReason} maxLength={250} onChange={e=>setAmendmentReason(e.target.value)} disabled={actionBusy}/>
        <label htmlFor="amendment-content">Addendum / correction</label><textarea id="amendment-content" rows={3} maxLength={4000} value={amendmentContent} onChange={e=>setAmendmentContent(e.target.value)} disabled={actionBusy}/>
        <button type="button" onClick={addAmendment} disabled={actionBusy||!amendmentReason.trim()||!amendmentContent.trim()}>Add append-only amendment</button></>}
      </div>}
      </>}
      {actionError&&<p className="inline-error" role="alert">{actionError}</p>}
      {actionSuccess&&<p className="registration-success" role="status">{actionSuccess}</p>}
    </div>}
  </section>;
}


function PlatformOnboarding({user,onComplete}:{user:User;onComplete:()=>Promise<void>}) {
  const [secret,setSecret]=useState("");
  const [tenantName,setTenantName]=useState("");
  const [tenantSlug,setTenantSlug]=useState("");
  const [hospitalName,setHospitalName]=useState("");
  const [hospitalCode,setHospitalCode]=useState("");
  const [departmentName,setDepartmentName]=useState("General Medicine");
  const [departmentCode,setDepartmentCode]=useState("GEN");
  const [tenantId,setTenantId]=useState("");
  const [hospitalId,setHospitalId]=useState("");
  const [step,setStep]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const authority=import.meta.env.VITE_OIDC_AUTHORITY as string|undefined;

  async function run(action:()=>Promise<void>) {
    setBusy(true);setError("");setMessage("");
    try{await action();}catch(e){setError(getErrorMessage(e));}
    finally{setBusy(false);}
  }
  const accessToken=user.access_token;
  const subject=String(user.profile.sub??"");

  return <section className="section onboarding-section">
    <div className="section-heading"><div><label>FIRST-TIME SETUP</label><h2>Set up your hospital organization</h2><p className="helper-text">This guided local setup uses the authenticated identity and protected CompileCare provisioning APIs. No database records are inserted directly.</p></div></div>
    <div className="search-panel">
      <h3>Step 1 · Register the first platform operator</h3>
      <p className="helper-text">Enter the one-time secret configured as PLATFORM_BOOTSTRAP_SECRET in CompileCare.Local/local/.env. This endpoint is available only in Development and only once.</p>
      <label htmlFor="platform-bootstrap-secret">One-time local bootstrap secret</label>
      <input id="platform-bootstrap-secret" type="password" autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)} disabled={step>0||busy}/>
      <button type="button" onClick={()=>run(async()=>{
        if(!secret.trim())throw new Error("Enter the local bootstrap secret.");
        try {
          await bootstrapPlatformOperator(apiBaseUrl??"",accessToken,secret);
          setMessage("Platform operator provisioned for the signed-in identity.");
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            setMessage("Platform bootstrap was already completed. The next step will verify whether this identity is an authorized platform operator.");
          } else {
            throw e;
          }
        }
        setStep(1);
      })} disabled={step>0||busy||!secret.trim()}> {busy?"Working…":"Bootstrap platform operator"} </button>
      <div className="divider"/>
      <h3>Step 2 · Create the hospital tenant</h3>
      <div className="registration-grid">
        <div><label htmlFor="onboarding-tenant-name">Tenant / hospital group name</label><input id="onboarding-tenant-name" value={tenantName} onChange={e=>setTenantName(e.target.value)} disabled={step>1||busy}/></div>
        <div><label htmlFor="onboarding-tenant-slug">Unique tenant slug</label><input id="onboarding-tenant-slug" value={tenantSlug} onChange={e=>setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))} placeholder="example-hospital-group" disabled={step>1||busy}/></div>
      </div>
      <button type="button" onClick={()=>run(async()=>{
        if(step<1)throw new Error("Complete platform operator bootstrap first.");
        const tenant=await createPlatformTenant(apiBaseUrl??"",accessToken,tenantName.trim(),tenantSlug.trim());
        setTenantId(tenant.id);setStep(2);setMessage(`Tenant created in ${tenant.status} state: ${tenant.name}.`);
      })} disabled={step!==1||busy||!tenantName.trim()||!tenantSlug.trim()}>Create tenant</button>
      <div className="divider"/>
      <h3>Step 3 · Assign yourself as the initial tenant administrator</h3>
      <p className="helper-text">The membership is bound to the validated OIDC issuer and subject of this sign-in. The tenant is activated only after initial administrator provisioning succeeds.</p>
      <button type="button" onClick={()=>run(async()=>{
        if(!tenantId||!authority||!subject)throw new Error("Tenant or validated OIDC identity is missing.");
        await provisionInitialTenantAdministrator(apiBaseUrl??"",accessToken,tenantId,authority,subject);
        await activatePlatformTenant(apiBaseUrl??"",accessToken,tenantId);
        setStep(3);setMessage("Initial HospitalAdmin membership created and tenant activated.");
      })} disabled={step!==2||busy}>Provision initial administrator and activate tenant</button>
      <div className="divider"/>
      <h3>Step 4 · Register the first hospital and department</h3>
      <div className="registration-grid">
        <div><label htmlFor="onboarding-hospital-name">Hospital name</label><input id="onboarding-hospital-name" value={hospitalName} onChange={e=>setHospitalName(e.target.value)} disabled={step>3||busy}/></div>
        <div><label htmlFor="onboarding-hospital-code">Hospital code (optional)</label><input id="onboarding-hospital-code" value={hospitalCode} onChange={e=>setHospitalCode(e.target.value)} disabled={step>3||busy}/></div>
        <div><label htmlFor="onboarding-department-name">First department</label><input id="onboarding-department-name" value={departmentName} onChange={e=>setDepartmentName(e.target.value)} disabled={step>3||busy}/></div>
        <div><label htmlFor="onboarding-department-code">Department code (optional)</label><input id="onboarding-department-code" value={departmentCode} onChange={e=>setDepartmentCode(e.target.value)} disabled={step>3||busy}/></div>
      </div>
      <button type="button" onClick={()=>run(async()=>{
        if(!tenantId||step!==3)throw new Error("Complete tenant activation first.");
        const hospital=await createHospital(apiBaseUrl??"",accessToken,tenantId,hospitalName.trim(),hospitalCode.trim()||null);
        setHospitalId(hospital.id);
        await createDepartment(apiBaseUrl??"",accessToken,tenantId,hospital.id,departmentName.trim(),departmentCode.trim()||null);
        setStep(4);setMessage(`Hospital ${hospital.name} and its first department were created.`);
        await onComplete();
      })} disabled={step!==3||busy||!hospitalName.trim()||!departmentName.trim()}>Create hospital and department</button>
      {error&&<p className="inline-error" role="alert">{error}</p>}
      {message&&<p className="registration-success" role="status">{message}</p>}
      {step===4&&<p className="inline-status">Setup complete. Your active hospital context is being loaded.</p>}
      <small className="helper-text">Tenant ID: {tenantId||"Not created"} · Hospital ID: {hospitalId||"Not created"}</small>
    </div>
  </section>;
}

function Workspace() {
  const [user,setUser] = useState<User|null>(null);
  const [sessionLoading,setSessionLoading] = useState(true);
  const [authError,setAuthError] = useState("");
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
  const [queueActionError,setQueueActionError] = useState("");
  const [queueActionLoadingId,setQueueActionLoadingId] = useState("");
  const [queueActionReason,setQueueActionReason] = useState("");
  const [queueDate,setQueueDate] = useState(localDateToday());
  const [hospitalTimeZone,setHospitalTimeZone] = useState("Asia/Kolkata");
  const [clinicalBusy,setClinicalBusy] = useState(false);
  const [facilityBusy,setFacilityBusy] = useState(false);
  const [activeSection,setActiveSection] = useState("");

  useEffect(() => {
    const manager = userManager;
    if (!manager) { setSessionLoading(false); return; }
    let active = true;
    manager.getUser()
      .then(async value => {
        if (!active) return;
        if (value?.expired) {
          setAuthError("Your sign-in session expired. Sign in again to continue.");
          await manager.removeUser();
          return;
        }
        setUser(value);
      })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setSessionLoading(false); });
    const loaded = (value: User) => { setAuthError(""); setUser(value); };
    const unloaded = () => setUser(null);
    const expired = () => {
      setAuthError("Your sign-in session expired. Sign in again to continue.");
      setUser(null);
      void manager.removeUser();
    };
    const renewError = () => setAuthError("Your session could not be renewed. Sign in again to continue.");
    manager.events.addUserLoaded(loaded);
    manager.events.addUserUnloaded(unloaded);
    manager.events.addAccessTokenExpired(expired);
    manager.events.addSilentRenewError(renewError);
    return () => {
      active = false;
      manager.events.removeUserLoaded(loaded);
      manager.events.removeUserUnloaded(unloaded);
      manager.events.removeAccessTokenExpired(expired);
      manager.events.removeSilentRenewError(renewError);
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
  const selectedHospital = hospitals.find(value => value.id === selectedHospitalId);
  const hasPermission = (permission:string) => selectedContext?.permissions?.includes(permission) ?? false;
  const isClinicalWorkspace = hasPermission("encounter.read");
  const canReadPatients = hasPermission("patient.read");
  const canRegisterPatients = hasPermission("patient.register") && hasPermission("patient.duplicate.review");
  const canManageAppointments = hasPermission("appointment.manage");
  const canReadQueue = hasPermission("queue.read");
  const canManageQueue = hasPermission("queue.manage");
  const canReadBilling = hasPermission("billing.invoice.read") || hasPermission("billing.invoice.manage");
  const canReadFacilities = hasPermission("facility.read");
  const selectedDepartment = departments.find(x=>x.id===selectedDepartmentId);
  const selectedSession = availabilitySessions.find(x=>x.id===selectedSessionId);
  const isWorkflowBusy = duplicateLoading||registrationLoading||availabilityLoading||slotsLoading||bookingLoading||checkInLoading||walkInLoading||queueLoading||!!queueActionLoadingId||clinicalBusy||facilityBusy;
  const allowedSectionKey = [
    isClinicalWorkspace ? "clinical" : "",
    canReadPatients ? "reception" : "",
    canRegisterPatients ? "patient-registration" : "",
    canManageAppointments ? "appointments" : "",
    canReadQueue && !isClinicalWorkspace ? "queue" : "",
    canReadBilling ? "billing" : "",
    canReadFacilities ? "facilities" : ""
  ].filter(Boolean).join("|");
  const defaultActiveSection = allowedSectionKey.split("|")[0] || "";
  const activeWorkspaceTitle = activeSection === "appointments" ? "Appointments" : activeSection === "queue" ? "Queue operations" : activeSection === "billing" ? "Billing" : activeSection === "facilities" ? "Facility management" : activeSection === "patient-registration" ? "Patient registration" : activeSection === "clinical" || isClinicalWorkspace ? "Clinical workspace" : activeSection === "reception" || canReadPatients || !user ? "Reception workspace" : "Hospital workspace";

  useEffect(() => {
    const syncActiveSection = () => {
      const section = window.location.hash.slice(1);
      const allowedSections = allowedSectionKey ? allowedSectionKey.split("|") : [];
      setActiveSection(allowedSections.includes(section) ? section : defaultActiveSection);
    };
    syncActiveSection();
    window.addEventListener("hashchange", syncActiveSection);
    return () => window.removeEventListener("hashchange", syncActiveSection);
  },[allowedSectionKey,defaultActiveSection]);

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
    }catch(error){
      if(error instanceof ApiError&&error.status===409){
        setSelectedSlotStart("");
        try{
          const refreshedSlots=await getAppointmentSlots(apiBaseUrl,user.access_token,selectedTenantId,selectedHospitalId,selectedSession.id);
          setSlots(refreshedSlots);
          setBookingError("That time was just booked or is no longer available. Availability has been refreshed; choose another available slot.");
        }catch(refreshError){
          setSlots([]);
          setAvailabilityError(getErrorMessage(refreshError));
          setBookingError("That time is no longer available. Refresh availability before choosing another slot.");
        }
      }else{
        setBookingError(getErrorMessage(error));
      }
    }
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

  async function handleQueueAction(entry:QueueEntry,action:QueueAction) {
    if(!user||!apiBaseUrl||!selectedTenantId||!selectedHospitalId)return;
    const needsReason=action==="cancel"||action==="noshow";
    if(needsReason&&!queueActionReason.trim()){
      setQueueActionError("Enter a reason before cancelling or marking a patient as no-show.");
      return;
    }
    setQueueActionLoadingId(entry.id);setQueueActionError("");
    try{
      const updated=await transitionQueueEntry(apiBaseUrl,user.access_token,selectedTenantId,selectedHospitalId,entry.id,action,
        needsReason?{reason:queueActionReason.trim()}:{ });
      setQueueEntries(current=>current.map(item=>item.id===updated.id?updated:item));
      setQueueActionReason("");
    }catch(error){setQueueActionError(getErrorMessage(error));}
    finally{setQueueActionLoadingId("");}
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

  async function refreshHospitals(preferredHospitalId?: string) {
    if (!user || !apiBaseUrl || !selectedTenantId) return;
    const page = await getHospitals(apiBaseUrl,user.access_token,selectedTenantId);
    setHospitals(page.items);
    setSelectedHospitalId(current =>
      preferredHospitalId && page.items.some(item => item.id === preferredHospitalId)
        ? preferredHospitalId
        : page.items.some(item => item.id === current)
          ? current
          : page.items.length === 1 ? page.items[0].id : "");
  }

  async function refreshDepartments() {
    if (!user || !apiBaseUrl || !selectedTenantId || !selectedHospitalId) {
      setDepartments([]);
      setSelectedDepartmentId("");
      return;
    }
    const page = await listDepartments(apiBaseUrl,user.access_token,selectedTenantId,selectedHospitalId);
    setDepartments(page.items);
    setSelectedDepartmentId(current =>
      page.items.some(item => item.id === current)
        ? current
        : page.items.length === 1 ? page.items[0].id : "");
  }

  return <div className="shell">
    <a className="skip-link" href="#workspace-main">Skip to main content</a>
    <aside className="sidebar">
      <div className="brand"><b>C</b><span>CompileCare<small>HOSPITAL WORKSPACE</small></span></div>
      <nav aria-label="Primary navigation">
        <p>WORKSPACE</p>
        {isClinicalWorkspace&&<a className={activeSection==="clinical"?"selected":undefined} aria-current={activeSection==="clinical"?"location":undefined} href="#clinical">Clinical workspace</a>}{canReadPatients&&<a className={activeSection==="reception"?"selected":undefined} aria-current={activeSection==="reception"?"location":undefined} href="#reception">Reception</a>}{canRegisterPatients&&<a className={activeSection==="patient-registration"?"selected":undefined} aria-current={activeSection==="patient-registration"?"location":undefined} href="#patient-registration">Patient registration</a>}{canManageAppointments&&<a className={activeSection==="appointments"?"selected":undefined} aria-current={activeSection==="appointments"?"location":undefined} href="#appointments">Appointments</a>}{canReadQueue&&!isClinicalWorkspace&&<a className={activeSection==="queue"?"selected":undefined} aria-current={activeSection==="queue"?"location":undefined} href="#queue">Queue</a>}{canReadBilling&&<a className={activeSection==="billing"?"selected":undefined} aria-current={activeSection==="billing"?"location":undefined} href="#billing">Billing</a>}{canReadFacilities&&<a className={activeSection==="facilities"?"selected":undefined} aria-current={activeSection==="facilities"?"location":undefined} href="#facilities">Facilities</a>}{!isClinicalWorkspace&&!canReadPatients&&!canManageAppointments&&!canReadQueue&&!canReadBilling&&!canRegisterPatients&&!canReadFacilities&&<span className="inline-status">No workspace modules are assigned to this membership.</span>}
      </nav>
      <footer>Secure by design<br/><small>Tenant-scoped access</small></footer>
    </aside>
    <main className="content" id="workspace-main" tabIndex={-1}>
      <header>
        <div><label>HOSPITAL OPERATIONS</label><h1>{activeWorkspaceTitle}</h1></div>
        <div className="session">
          {sessionLoading ? "Checking session…" : user ?
            <><span>{String(user.profile.name ?? user.profile.preferred_username ?? "Signed-in user")}</span>
            <button onClick={() => userManager?.signoutRedirect()}>Sign out</button></> :
            <button disabled={!isAuthenticationConfigured} onClick={() => userManager?.signinRedirect()}>Sign in</button>}
        </div>
      </header>

      {authError && <div className="notice" role="alert">{authError}</div>}
      {!isAuthenticationConfigured && <div className="notice" role="status"><b>Authentication setup required.</b> Configure the OIDC environment variables before enabling staff sign-in.</div>}
      {user && !apiBaseUrl && <div className="notice" role="alert">Set VITE_API_BASE_URL to connect this workspace to CompileCare.Api.</div>}
      {user && apiBaseUrl && <>
        <section className="context-panel">
          <div className="context-intro">
            <label>ACTIVE ORGANIZATION</label>
            <h2>{selectedHospital?.name ?? selectedContext?.tenantName ?? "Select your hospital context"}</h2>
            <p>{selectedHospital ? `Working in ${selectedHospital.name}. Data access is scoped to this selected hospital.` : selectedContext ? `Tenant ${selectedContext.tenantName} is selected. Choose a hospital to continue.` : "Only active memberships assigned to your validated sign-in are listed."}</p>
            {selectedContext && <div className="context-tags"><span>{selectedContext.role}</span><span>{selectedHospital ? "Hospital selected" : "Hospital required"}</span></div>}
          </div>
          <div className="context-controls">
            <label htmlFor="tenant-select">Tenant</label>
            <select id="tenant-select" value={selectedTenantId} onChange={event => changeTenant(event.target.value)} disabled={contextsLoading || contexts.length === 0 || isWorkflowBusy}>
              <option value="">Select a tenant</option>
              {contexts.map(context => <option key={context.tenantId} value={context.tenantId}>{context.tenantName} · {context.role}</option>)}
            </select>
            <label htmlFor="hospital-select">Hospital</label>
            <select id="hospital-select" value={selectedHospitalId} onChange={event => changeHospital(event.target.value)} disabled={!selectedTenantId || hospitalsLoading || hospitals.length === 0 || isWorkflowBusy}>
              <option value="">Select a hospital</option>
              {hospitals.map(hospital => <option key={hospital.id} value={hospital.id}>{hospital.name}{hospital.code ? ` · ${hospital.code}` : ""}</option>)}
            </select>
          </div>
          {contextsLoading && <p className="inline-status" role="status">Loading your active tenant memberships…</p>}
          {contextsError && <p className="inline-error" role="alert">{contextsError}</p>}
          {!contextsLoading && !contextsError && contexts.length === 0 && <p className="inline-status">No active tenant membership was found for this identity. Contact your CompileCare administrator.</p>}
          {!contextsLoading && !contextsError && contexts.length === 0 && <p className="inline-status">If this is your first local installation, use the guided setup below to provision the first platform operator, tenant, hospital and department.</p>}
          {selectedContext && <p className="context-scope">Role: <strong>{selectedContext.role}</strong> · {selectedContext.scopes.map(scope => scope.scopeType).join(", ")} scope</p>}
          {hospitalsLoading && <p className="inline-status" role="status">Loading hospitals available to this membership…</p>}
          {hospitalsError && <p className="inline-error" role="alert">{hospitalsError}</p>}
          {selectedTenantId && !hospitalsLoading && !hospitalsError && hospitals.length === 0 && <p className="inline-status">No hospitals are available in the selected tenant or within your assigned scope.</p>}
        </section>

        {localPlatformBootstrapEnabled && !contextsLoading && !contextsError && contexts.length===0 && user && <PlatformOnboarding user={user} onComplete={async()=>{const page=await getCurrentUserTenantContexts(apiBaseUrl??"",user.access_token);setContexts(page.items);setSelectedTenantId(page.items[0]?.tenantId??"");}}/>}

        {canReadFacilities && selectedContext && selectedTenantId && <FacilityManagement
          baseUrl={apiBaseUrl}
          accessToken={user.access_token}
          tenantId={selectedTenantId}
          hospital={selectedHospital}
          departments={departments}
          departmentsLoading={departmentsLoading}
          permissions={selectedContext.permissions ?? []}
          scopes={selectedContext.scopes ?? []}
          onRefreshHospitals={refreshHospitals}
          onRefreshDepartments={refreshDepartments}
          onBusyChange={setFacilityBusy}
        />}

        {canReadPatients && (<section className="section reception-section" id="reception">
          <div className="section-heading"><div><label>RECEPTION</label><h2>Find a registered patient</h2></div></div>
          <div className="search-panel">
            <label htmlFor="patient-search">Patient name</label>
            <div className="search-row">
              <input id="patient-search" type="search" value={patientQuery} onChange={event => { setPatientQuery(event.target.value); setSelectedPatient(null); setHasSearched(false); setPatients([]); setPatientTotal(0); setPatientTotalPages(0); setSearchError(""); }} placeholder="Search by given or family name" disabled={!selectedHospitalId || searchLoading || isWorkflowBusy}/>
              <button onClick={() => handlePatientSearch()} disabled={!selectedHospitalId || searchLoading || isWorkflowBusy || patientQuery.trim().length < 2}>{searchLoading ? "Searching…" : "Search patients"}</button>
            </div>
            <p className="helper-text">Search is limited to the selected hospital. Results are not stored in browser storage.</p>
            {searchError && <p className="inline-error" role="alert">{searchError}</p>}
            {hasSearched && <p className="result-count" role="status">Showing {patientTotal === 0 ? 0 : (patientPage - 1) * 25 + 1}–{Math.min(patientPage * 25,patientTotal)} of {patientTotal} matching patients</p>}
            {hasSearched && patients.length === 0 && <p className="inline-status">No matching patients were found.</p>}
            {patients.length > 0 && <PatientSearchResults
              patients={patients}
              selectedPatientId={selectedPatient?.id}
              disabled={isWorkflowBusy}
              onSelect={patient => {
                setSelectedPatient(patient);
                setBookedAppointment(null);
                setQueueEntry(null);
                setBookingError("");
                setWalkInError("");
              }}
            />}
            {hasSearched && patientTotalPages > 1 && <div className="pagination"><button onClick={() => handlePatientSearch(patientPage - 1)} disabled={searchLoading || patientPage <= 1}>Previous</button><span>Page {patientPage} of {patientTotalPages}</span><button onClick={() => handlePatientSearch(patientPage + 1)} disabled={searchLoading || patientPage >= patientTotalPages}>Next</button></div>}
          </div>
        </section>)}


        {canManageAppointments && (<section className="section appointment-section" id="appointments">
          <div className="section-heading"><div><label>APPOINTMENTS</label><h2>Book a consultation</h2><p className="helper-text">Select a patient from the search results above, then choose a published provider slot.</p></div></div>
          <div className="search-panel">
            <div className="workflow-step"><span>01</span><div><strong>Patient</strong><small>{selectedPatient?patientName(selectedPatient):"Choose a patient from the search results"}</small></div></div>
            <div className="appointment-grid">
              <div><label htmlFor="appointment-department">Department</label><select id="appointment-department" value={selectedDepartmentId} onChange={e=>{setSelectedDepartmentId(e.target.value);setAvailabilitySessions([]);setSlots([]);setSelectedSessionId("");setSelectedSlotStart("");setQueueEntries([]);setBookedAppointment(null);setQueueEntry(null);}} disabled={departmentsLoading||departments.length===0||isWorkflowBusy}><option value="">Select department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}{d.code?" · "+d.code:""}</option>)}</select></div>
              <div><label htmlFor="appointment-date">Appointment date</label><input id="appointment-date" type="date" min={localDateToday()} value={appointmentDate} disabled={isWorkflowBusy} onChange={e=>{setAppointmentDate(e.target.value);setAvailabilitySessions([]);setSlots([]);setSelectedSessionId("");setSelectedSlotStart("");}} /></div>
            </div>
            {departmentsLoading&&<p className="inline-status" role="status">Loading departments available to your hospital context…</p>}{departmentsError&&<p className="inline-error" role="alert">{departmentsError}</p>}
            <div className="registration-actions"><button type="button" onClick={loadAvailability} disabled={!selectedPatient||!selectedDepartmentId||!appointmentDate||availabilityLoading}>{availabilityLoading?"Finding availability…":"Find available appointments"}</button></div>
            {availabilityError&&<p className="inline-error" role="alert">{availabilityError}</p>}
            {availabilitySessions.length>0&&<div className="slot-panel">
              <label htmlFor="availability-session">Provider availability</label>
              <select id="availability-session" value={selectedSessionId} onChange={e=>selectAvailabilitySession(e.target.value)}><option value="">Choose a provider session</option>{availabilitySessions.map(session=><option key={session.id} value={session.id}>Session · {new Date(session.startsAtUtc).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",timeZone:session.timeZoneId})}–{new Date(session.endsAtUtc).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",timeZone:session.timeZoneId})}</option>)}</select>
              {slotsLoading&&<p className="inline-status" role="status">Loading available slots…</p>}{selectedSessionId&&!slotsLoading&&slots.length===0&&<p className="inline-status">No slots are available in this session.</p>}
              {slots.length>0&&<AppointmentSlotGrid
                slots={slots}
                selectedSlotStart={selectedSlotStart}
                timeZoneId={selectedSession?.timeZoneId}
                disabled={isWorkflowBusy || !!bookedAppointment}
                onSelect={setSelectedSlotStart}
              />}
            </div>}
            {selectedSlotStart&&<form onSubmit={handleBookAppointment} className="booking-review">
              <div className="review-summary"><strong>Review appointment</strong><span>{selectedPatient?patientName(selectedPatient):""} · {selectedDepartment?.name}</span><span>{new Date(selectedSlotStart).toLocaleString([],{dateStyle:"medium",timeStyle:"short",timeZone:selectedSession?.timeZoneId})} ({selectedSession?.timeZoneId})</span></div>
              <label htmlFor="appointment-reason">Visit reason (optional)</label><input id="appointment-reason" maxLength={250} value={appointmentReason} onChange={e=>setAppointmentReason(e.target.value)} placeholder="e.g. Follow-up" />
              <div className="registration-actions"><button type="submit" disabled={bookingLoading||!!bookedAppointment}>{bookingLoading?"Confirming booking…":bookedAppointment?"Appointment confirmed":"Confirm appointment"}</button></div>
            </form>}
            {bookingError&&<p className="inline-error" role="alert">{bookingError}</p>}
            {bookedAppointment&&<div className="arrival-success" role="status"><div><strong>Appointment confirmed</strong><span>Reference {bookedAppointment.id.slice(0,8)} · {bookedAppointment.status}</span></div><button type="button" onClick={handleAppointmentCheckIn} disabled={checkInLoading||!!queueEntry}>{checkInLoading?"Checking in…":queueEntry?"Checked in":"Check in patient"}</button></div>}
            {checkInError&&<p className="inline-error" role="alert">{checkInError}</p>}
            {queueEntry&&<div className="token-card" role="status"><small>QUEUE TOKEN</small><strong>{queueEntry.tokenNumber.toString().padStart(2,"0")}</strong><span>{queueEntry.status} · {queueEntry.queueDateLocal}</span></div>}
          </div>
        </section>)}

        {canManageQueue && (<section className="section walkin-section">
          <div className="section-heading"><div><label>WALK-IN ARRIVAL</label><h2>Register a walk-in</h2><p className="helper-text">Walk-ins are registered directly into the department queue. The API assigns the token.</p></div></div>
          <div className="search-panel walkin-panel">
            <div className="workflow-step"><span>02</span><div><strong>Selected patient</strong><small>{selectedPatient?patientName(selectedPatient):"Select a patient from search results"}</small></div></div>
            <div className="walkin-action"><div><strong>{selectedDepartment?.name||"Choose a department above"}</strong><label htmlFor="walkin-timezone">Hospital time zone</label><input id="walkin-timezone" value={hospitalTimeZone} onChange={e=>setHospitalTimeZone(e.target.value)} maxLength={100} /></div><button type="button" onClick={handleWalkIn} disabled={!selectedPatient||!selectedDepartmentId||walkInLoading||!!queueEntry}>{walkInLoading?"Registering…":queueEntry?"Added to queue":"Add to queue"}</button></div>
            {walkInError&&<p className="inline-error" role="alert">{walkInError}</p>}
            {queueEntry&&!bookedAppointment&&<div className="token-card" role="status"><small>WALK-IN QUEUE TOKEN</small><strong>{queueEntry.tokenNumber.toString().padStart(2,"0")}</strong><span>{queueEntry.status} · {queueEntry.queueDateLocal}</span></div>}
          </div>
        </section>)}

        {canReadQueue && !isClinicalWorkspace && (<section className="section queue-section" id="queue">
          <div className="section-heading"><div><label>LIVE OPERATIONS</label><h2>Department queue</h2></div></div>
          <div className="search-panel">
            <div className="appointment-grid"><div><label htmlFor="queue-department">Department</label><select id="queue-department" value={selectedDepartmentId} disabled={isWorkflowBusy} onChange={e=>{setSelectedDepartmentId(e.target.value);setQueueEntries([]);}}><option value="">Select department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div><div><label htmlFor="queue-date">Queue date</label><input id="queue-date" type="date" value={queueDate} disabled={isWorkflowBusy} onChange={e=>{setQueueDate(e.target.value);setQueueEntries([]);}} /></div></div>
            <div className="registration-actions"><button type="button" onClick={loadQueue} disabled={!selectedDepartmentId||queueLoading}>{queueLoading?"Refreshing queue…":"Refresh queue"}</button></div>
            {queueError&&<p className="inline-error" role="alert">{queueError}</p>}
            {canManageQueue&&queueEntries.some(entry=>entry.status==="Waiting"||entry.status==="Called")&&<div className="queue-reason-field"><label htmlFor="queue-action-reason">Reason for cancellation or no-show (required for those actions)</label><input id="queue-action-reason" value={queueActionReason} maxLength={250} onChange={event=>setQueueActionReason(event.target.value)} placeholder="e.g. Patient confirmed cancellation" /></div>}
            {queueActionError&&<p className="inline-error" role="alert">{queueActionError}</p>}
            {queueEntries.length>0?<div className="queue-list">{queueEntries.map(entry=><QueueEntryRow
              key={entry.id}
              entry={entry}
              canManageQueue={canManageQueue}
              actionBusy={!!queueActionLoadingId}
              saving={queueActionLoadingId===entry.id}
              cancellationReasonProvided={!!queueActionReason.trim()}
              onAction={handleQueueAction}
            />)}</div>:!queueLoading&&!queueError&&<p className="inline-status">Queue is empty or has not been loaded for this department and date.</p>}
          </div>
        </section>)}

        {canReadBilling && selectedTenantId && selectedHospitalId && user && <BillingWorkspace baseUrl={apiBaseUrl} accessToken={user.access_token} tenantId={selectedTenantId} hospitalId={selectedHospitalId} departments={departments} permissions={selectedContext?.permissions??[]}/>}

        {isClinicalWorkspace && selectedTenantId && selectedHospitalId && user && <ClinicalWorkspace baseUrl={apiBaseUrl} accessToken={user.access_token} tenantId={selectedTenantId} hospitalId={selectedHospitalId} departments={departments} permissions={selectedContext?.permissions??[]} onBusyChange={setClinicalBusy}/>}

        {canRegisterPatients && (<section className="section registration-section" id="patient-registration">
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
        </section>)}
      </>}

      {!user && !sessionLoading && <section className="hero"><label>YOUR HOSPITAL, ONE WORKSPACE</label><h2>Good care starts with<br/><em>connected workflows.</em></h2><p>Sign in with your hospital identity to access the work areas assigned to you.</p><div className="symbol" aria-hidden="true">✚</div></section>}
      <footer className="pagefoot">CompileCare · Hospital information workspace <span>API authorization is enforced on every request.</span></footer>
    </main>
  </div>;
}

export function App() {
  return <Routes><Route path="/auth/callback" element={<Callback/>}/><Route path="/auth/silent-callback" element={<SilentCallback/>}/><Route path="*" element={<Workspace/>}/></Routes>;
}
