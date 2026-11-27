import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Patient } from "../../api/compilecare";
import { ReceptionWorkspace } from "./ReceptionWorkspace";

const patient: Patient = {
  id: "patient-1",
  givenName: "Asha",
  middleName: "R.",
  familyName: "Patil",
  dateOfBirth: "1990-04-12",
  createdAtUtc: "2026-11-27T00:00:00Z"
};

function renderWorkspace(overrides: Partial<React.ComponentProps<typeof ReceptionWorkspace>> = {}) {
  const props: React.ComponentProps<typeof ReceptionWorkspace> = {
    hasSelectedHospital: true,
    patientSearchMode: "name",
    patientQuery: "Asha",
    searchLoading: false,
    isWorkflowBusy: false,
    canReadPatientIdentifiers: false,
    searchError: "",
    hasSearched: false,
    patientPage: 1,
    patientTotal: 0,
    patientTotalPages: 0,
    patients: [],
    onSearchModeChange: vi.fn(),
    onQueryChange: vi.fn(),
    onSearch: vi.fn(),
    onSelectPatient: vi.fn(),
    ...overrides
  };
  return { ...render(<ReceptionWorkspace {...props}/>), props };
}

describe("ReceptionWorkspace", () => {
  it("shows MRN lookup only when identifier-read permission is present", () => {
    const { rerender, props } = renderWorkspace();
    expect(screen.queryByRole("option", { name: "Medical record number (MRN)" })).not.toBeInTheDocument();
    rerender(<ReceptionWorkspace {...props} canReadPatientIdentifiers={true}/>);
    expect(screen.getByRole("option", { name: "Medical record number (MRN)" })).toBeInTheDocument();
  });

  it("requires two characters for name search and exact non-empty text for MRN search", () => {
    const { rerender, props } = renderWorkspace({ patientQuery: "A" });
    expect(screen.getByRole("button", { name: "Search patients" })).toBeDisabled();
    rerender(<ReceptionWorkspace {...props} patientSearchMode="mrn" patientQuery="1"/>);
    expect(screen.getByRole("button", { name: "Search patients" })).toBeEnabled();
  });

  it("delegates search and query changes to the workspace controller", () => {
    const { props } = renderWorkspace();
    fireEvent.change(screen.getByLabelText("Patient name"), { target: { value: "Asha Patil" } });
    expect(props.onQueryChange).toHaveBeenCalledWith("Asha Patil");
    fireEvent.click(screen.getByRole("button", { name: "Search patients" }));
    expect(props.onSearch).toHaveBeenCalledWith();
  });

  it("disables patient operations when hospital context is not selected", () => {
    renderWorkspace({ hasSelectedHospital: false });
    expect(screen.getByLabelText("Patient name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Search patients" })).toBeDisabled();
  });
});
