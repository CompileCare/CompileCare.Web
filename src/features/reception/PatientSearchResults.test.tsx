import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Patient } from "../../api/heapcare";
import { PatientSearchResults } from "./PatientSearchResults";

const patient: Patient = {
  id: "patient-1",
  givenName: "Asha",
  middleName: null,
  familyName: "Patil",
  dateOfBirth: "1988-04-12",
  hospitalId: "hospital-1",
  registeredAtUtc: "2026-11-25T09:00:00Z"
};

describe("PatientSearchResults", () => {
  it("renders a registered patient as a semantic selectable button", () => {
    render(
      <PatientSearchResults
        patients={[patient]}
        onSelect={vi.fn()}
      />
    );

    const result = screen.getByRole("button", {
      name: /Asha Patil.*Date of birth: 1988-04-12.*Registered patient/
    });

    expect(result).toHaveAttribute("aria-pressed", "false");
    expect(result).toBeEnabled();
  });

  it("marks the selected patient and announces the selected state", () => {
    render(
      <PatientSearchResults
        patients={[patient]}
        selectedPatientId={patient.id}
        onSelect={vi.fn()}
      />
    );

    const result = screen.getByRole("button", {
      name: /Asha Patil.*Date of birth: 1988-04-12.*Selected patient/
    });

    expect(result).toHaveAttribute("aria-pressed", "true");
  });

  it("returns the selected patient from the server result when activated", () => {
    const onSelect = vi.fn();

    render(
      <PatientSearchResults
        patients={[patient]}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Asha Patil/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(patient);
  });

  it("disables selection while the workspace has an in-flight operation", () => {
    const onSelect = vi.fn();

    render(
      <PatientSearchResults
        patients={[patient]}
        disabled
        onSelect={onSelect}
      />
    );

    const result = screen.getByRole("button", { name: /Asha Patil/ });
    expect(result).toBeDisabled();

    fireEvent.click(result);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders nothing when there are no search results", () => {
    const { container } = render(
      <PatientSearchResults patients={[]} onSelect={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
