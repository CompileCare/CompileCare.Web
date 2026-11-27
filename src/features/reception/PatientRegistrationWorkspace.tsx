import type { FormEvent } from "react";
import type { PatientDuplicateCheck } from "../../api/heapcare";

export interface PatientRegistrationWorkspaceProps {
  hospitalSelected: boolean;
  givenName: string;
  middleName: string;
  familyName: string;
  dateOfBirth: string;
  duplicateLoading: boolean;
  duplicateError: string;
  duplicateCheck: PatientDuplicateCheck | null;
  duplicateAcknowledged: boolean;
  registrationLoading: boolean;
  registrationError: string;
  registrationSuccess: string;
  onGivenNameChange: (value: string) => void;
  onMiddleNameChange: (value: string) => void;
  onFamilyNameChange: (value: string) => void;
  onDateOfBirthChange: (value: string) => void;
  onCheckDuplicates: () => void;
  onDuplicateAcknowledgedChange: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function PatientRegistrationWorkspace({
  hospitalSelected,
  givenName,
  middleName,
  familyName,
  dateOfBirth,
  duplicateLoading,
  duplicateError,
  duplicateCheck,
  duplicateAcknowledged,
  registrationLoading,
  registrationError,
  registrationSuccess,
  onGivenNameChange,
  onMiddleNameChange,
  onFamilyNameChange,
  onDateOfBirthChange,
  onCheckDuplicates,
  onDuplicateAcknowledgedChange,
  onSubmit
}: PatientRegistrationWorkspaceProps) {
  return (
    <section className="section registration-section" id="patient-registration">
      <div className="section-heading">
        <div><label>PATIENT REGISTRATION</label><h2>Register a new patient</h2></div>
      </div>
      <form className="search-panel" onSubmit={onSubmit}>
        <p className="helper-text">Patient master and hospital registration are created together by the API. Contact details are intentionally not collected in this initial workflow.</p>
        <div className="registration-grid">
          <div><label htmlFor="registration-given-name">Given name *</label><input id="registration-given-name" value={givenName} maxLength={100} onChange={event => onGivenNameChange(event.target.value)} disabled={!hospitalSelected || registrationLoading} required /></div>
          <div><label htmlFor="registration-middle-name">Middle name</label><input id="registration-middle-name" value={middleName} maxLength={100} onChange={event => onMiddleNameChange(event.target.value)} disabled={!hospitalSelected || registrationLoading} /></div>
          <div><label htmlFor="registration-family-name">Family name</label><input id="registration-family-name" value={familyName} maxLength={100} onChange={event => onFamilyNameChange(event.target.value)} disabled={!hospitalSelected || registrationLoading} /></div>
          <div><label htmlFor="registration-dob">Date of birth (if known)</label><input id="registration-dob" type="date" max={new Date().toISOString().slice(0,10)} value={dateOfBirth} onChange={event => onDateOfBirthChange(event.target.value)} disabled={!hospitalSelected || registrationLoading} /></div>
        </div>
        <div className="registration-actions">
          <button type="button" onClick={onCheckDuplicates} disabled={!hospitalSelected || !givenName.trim() || duplicateLoading || registrationLoading}>
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
            <input type="checkbox" checked={duplicateAcknowledged} onChange={event => onDuplicateAcknowledgedChange(event.target.checked)} disabled={duplicateCheck.hasMoreCandidates || registrationLoading} />
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
  );
}
