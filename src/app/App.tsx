import { useEffect,useState } from "react";
import { Route,Routes,useNavigate } from "react-router-dom";
import type { User } from "oidc-client-ts";
import { isAuthenticationConfigured,userManager } from "../auth/oidc";
import {
  ApiError,
  getCurrentUserTenantContexts,
  getHospitals,
  searchPatients,
  type Hospital,
  type Patient,
  type UserTenantContext
} from "../api/compilecare";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

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

  const selectedContext = contexts.find(value => value.tenantId === selectedTenantId);

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

  function changeTenant(tenantId: string) {
    setSelectedTenantId(tenantId);
    setSelectedHospitalId("");
    setHospitals([]);
    setPatients([]);
    setPatientTotal(0);
    setPatientTotalPages(0);
    setPatientPage(1);
    setPatientQuery("");
    setHasSearched(false);
    setSearchError("");
  }

  function changeHospital(hospitalId: string) {
    setSelectedHospitalId(hospitalId);
    setPatients([]);
    setPatientTotal(0);
    setPatientTotalPages(0);
    setPatientPage(1);
    setPatientQuery("");
    setHasSearched(false);
    setSearchError("");
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><b>C</b><span>CompileCare<small>HOSPITAL WORKSPACE</small></span></div>
      <nav aria-label="Primary navigation">
        <p>WORKSPACE</p>
        <a className="selected" href="#reception">Reception</a>
        <span>Queue <small>Next increment</small></span>
        <span>Clinical <small>Next increment</small></span>
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
            <select id="tenant-select" value={selectedTenantId} onChange={event => changeTenant(event.target.value)} disabled={contextsLoading || contexts.length === 0}>
              <option value="">Select a tenant</option>
              {contexts.map(context => <option key={context.tenantId} value={context.tenantId}>{context.tenantName} · {context.role}</option>)}
            </select>
            <label htmlFor="hospital-select">Hospital</label>
            <select id="hospital-select" value={selectedHospitalId} onChange={event => changeHospital(event.target.value)} disabled={!selectedTenantId || hospitalsLoading || hospitals.length === 0}>
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
              <input id="patient-search" type="search" value={patientQuery} onChange={event => { setPatientQuery(event.target.value); setHasSearched(false); setPatients([]); setPatientTotal(0); setPatientTotalPages(0); setSearchError(""); }} placeholder="Search by given or family name" disabled={!selectedHospitalId || searchLoading}/>
              <button onClick={() => handlePatientSearch()} disabled={!selectedHospitalId || searchLoading || patientQuery.trim().length < 2}>{searchLoading ? "Searching…" : "Search patients"}</button>
            </div>
            <p className="helper-text">Search is limited to the selected hospital. Results are not stored in browser storage.</p>
            {searchError && <p className="inline-error" role="alert">{searchError}</p>}
            {hasSearched && <p className="result-count" role="status">Showing {patientTotal === 0 ? 0 : (patientPage - 1) * 25 + 1}–{Math.min(patientPage * 25,patientTotal)} of {patientTotal} matching patients</p>}
            {hasSearched && patients.length === 0 && <p className="inline-status">No matching patients were found.</p>}
            {patients.length > 0 && <div className="patient-results" aria-label="Patient search results">
              {patients.map(patient => <article className="patient-result" key={patient.id}>
                <div><strong>{patientName(patient)}</strong><span>{patient.dateOfBirth ? `Date of birth: ${patient.dateOfBirth}` : "Date of birth not recorded"}</span></div>
                <small>Registered patient</small>
              </article>)}
            </div>}
            {hasSearched && patientTotalPages > 1 && <div className="pagination"><button onClick={() => handlePatientSearch(patientPage - 1)} disabled={searchLoading || patientPage <= 1}>Previous</button><span>Page {patientPage} of {patientTotalPages}</span><button onClick={() => handlePatientSearch(patientPage + 1)} disabled={searchLoading || patientPage >= patientTotalPages}>Next</button></div>}
          </div>
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
