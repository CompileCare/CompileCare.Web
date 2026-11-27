import { PatientSearchResults } from "./PatientSearchResults";
import type { Patient } from "../../api/heapcare";

export type PatientSearchMode = "name" | "mrn";

export interface ReceptionWorkspaceProps {
  hasSelectedHospital: boolean;
  patientSearchMode: PatientSearchMode;
  patientQuery: string;
  searchLoading: boolean;
  isWorkflowBusy: boolean;
  canReadPatientIdentifiers: boolean;
  searchError: string;
  hasSearched: boolean;
  patientPage: number;
  patientTotal: number;
  patientTotalPages: number;
  patients: Patient[];
  selectedPatientId?: string;
  onSearchModeChange: (mode: PatientSearchMode) => void;
  onQueryChange: (query: string) => void;
  onSearch: (page?: number) => void;
  onSelectPatient: (patient: Patient) => void;
}

export function ReceptionWorkspace({
  hasSelectedHospital,
  patientSearchMode,
  patientQuery,
  searchLoading,
  isWorkflowBusy,
  canReadPatientIdentifiers,
  searchError,
  hasSearched,
  patientPage,
  patientTotal,
  patientTotalPages,
  patients,
  selectedPatientId,
  onSearchModeChange,
  onQueryChange,
  onSearch,
  onSelectPatient
}: ReceptionWorkspaceProps) {
  const canSearch = hasSelectedHospital && !searchLoading && !isWorkflowBusy &&
    (patientSearchMode === "name" ? patientQuery.trim().length >= 2 : patientQuery.trim().length > 0);

  return (
    <section className="section reception-section" id="reception">
      <div className="section-heading"><div><label>RECEPTION</label><h2>Find a registered patient</h2></div></div>
      <div className="search-panel">
        <div className="appointment-grid">
          <div>
            <label htmlFor="patient-search-mode">Search by</label>
            <select id="patient-search-mode" value={patientSearchMode} onChange={event => onSearchModeChange(event.target.value as PatientSearchMode)} disabled={!hasSelectedHospital || searchLoading || isWorkflowBusy}>
              <option value="name">Patient name</option>
              {canReadPatientIdentifiers && <option value="mrn">Medical record number (MRN)</option>}
            </select>
          </div>
          <div>
            <label htmlFor="patient-search">{patientSearchMode === "mrn" ? "Medical record number (MRN)" : "Patient name"}</label>
            <div className="search-row">
              <input id="patient-search" type="search" value={patientQuery} onChange={event => onQueryChange(event.target.value)} placeholder={patientSearchMode === "mrn" ? "Enter the exact hospital MRN" : "Search by given or family name"} disabled={!hasSelectedHospital || searchLoading || isWorkflowBusy}/>
              <button onClick={() => onSearch()} disabled={!canSearch}>{searchLoading ? "Searching…" : "Search patients"}</button>
            </div>
          </div>
        </div>
        <p className="helper-text">{patientSearchMode === "mrn" ? "Exact MRN lookup is limited to the selected hospital and requires patient identifier read permission." : "Search is limited to the selected hospital. Results are not stored in browser storage."}</p>
        {searchError && <p className="inline-error" role="alert">{searchError}</p>}
        {hasSearched && <p className="result-count" role="status">Showing {patientTotal === 0 ? 0 : (patientPage - 1) * 25 + 1}–{Math.min(patientPage * 25,patientTotal)} of {patientTotal} matching patients</p>}
        {hasSearched && patients.length === 0 && <p className="inline-status">No matching patients were found.</p>}
        {patients.length > 0 && <PatientSearchResults
          patients={patients}
          selectedPatientId={selectedPatientId}
          disabled={isWorkflowBusy}
          onSelect={onSelectPatient}
        />}
        {hasSearched && patientTotalPages > 1 && <div className="pagination"><button onClick={() => onSearch(patientPage - 1)} disabled={searchLoading || patientPage <= 1}>Previous</button><span>Page {patientPage} of {patientTotalPages}</span><button onClick={() => onSearch(patientPage + 1)} disabled={searchLoading || patientPage >= patientTotalPages}>Next</button></div>}
      </div>
    </section>
  );
}
