import type { Patient } from "../../api/heapcare";

interface PatientSearchResultsProps {
  patients: Patient[];
  selectedPatientId?: string;
  disabled?: boolean;
  onSelect: (patient: Patient) => void;
}

function patientDisplayName(patient: Patient): string {
  return [patient.givenName, patient.middleName, patient.familyName]
    .filter(Boolean)
    .join(" ");
}

export function PatientSearchResults({
  patients,
  selectedPatientId,
  disabled = false,
  onSelect
}: PatientSearchResultsProps) {
  if (patients.length === 0) return null;

  return (
    <div className="patient-results" role="group" aria-label="Patient search results">
      {patients.map(patient => {
        const selected = selectedPatientId === patient.id;

        return (
          <button
            key={patient.id}
            type="button"
            className={`patient-result patient-result-selectable ${selected ? "patient-result-active" : ""}`}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onSelect(patient)}
          >
            <span className="patient-result-main">
              <strong>{patientDisplayName(patient)}</strong>
              <span>
                {patient.dateOfBirth
                  ? `Date of birth: ${patient.dateOfBirth}`
                  : "Date of birth not recorded"}
              </span>
            </span>
            <span className="patient-result-meta">
              {selected ? "Selected patient" : "Registered patient"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
