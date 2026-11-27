import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PatientDuplicateCheck } from "../../api/compilecare";
import { PatientRegistrationWorkspace } from "./PatientRegistrationWorkspace";

const duplicateCheck: PatientDuplicateCheck = {
  evaluated: true,
  evaluationMessage: "Review the possible candidates.",
  candidates: [{
    patientId: "patient-1",
    givenName: "Asha",
    middleName: "R.",
    familyName: "Patil",
    dateOfBirth: "1990-04-12",
    registeredAtUtc: "2026-11-27T00:00:00Z",
    matchSignals: ["Name"]
  }],
  hasMoreCandidates: false
};

function renderWorkspace(overrides: Partial<ComponentProps<typeof PatientRegistrationWorkspace>> = {}) {
  const props: ComponentProps<typeof PatientRegistrationWorkspace> = {
    hospitalSelected: true,
    givenName: "Asha",
    middleName: "R.",
    familyName: "Patil",
    dateOfBirth: "1990-04-12",
    duplicateLoading: false,
    duplicateError: "",
    duplicateCheck: null,
    duplicateAcknowledged: false,
    registrationLoading: false,
    registrationError: "",
    registrationSuccess: "",
    onGivenNameChange: vi.fn(),
    onMiddleNameChange: vi.fn(),
    onFamilyNameChange: vi.fn(),
    onDateOfBirthChange: vi.fn(),
    onCheckDuplicates: vi.fn(),
    onDuplicateAcknowledgedChange: vi.fn(),
    onSubmit: vi.fn(event => event.preventDefault()),
    ...overrides
  };
  return { ...render(<PatientRegistrationWorkspace {...props}/>), props };
}

describe("PatientRegistrationWorkspace", () => {
  it("requires duplicate evaluation and explicit acknowledgement before registration", () => {
    renderWorkspace();
    expect(screen.getByRole("button", { name: "Check for possible duplicates" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Register patient" })).toBeDisabled();
  });

  it("shows candidate evidence and reports the acknowledgement before enabling submit", () => {
    const { props, rerender } = renderWorkspace({ duplicateCheck });
    expect(screen.getByText("Asha R. Patil")).toBeInTheDocument();
    expect(screen.getByText("Match signals: Name")).toBeInTheDocument();
    const acknowledgement = screen.getByRole("checkbox", { name: /I reviewed the result/ });
    fireEvent.click(acknowledgement);
    expect(props.onDuplicateAcknowledgedChange).toHaveBeenCalledWith(true);
    rerender(<PatientRegistrationWorkspace {...props} duplicateAcknowledged={true}/>);
    expect(screen.getByRole("button", { name: "Register patient" })).toBeEnabled();
  });

  it("disables identity operations when no hospital is selected", () => {
    renderWorkspace({ hospitalSelected: false });
    expect(screen.getByLabelText("Given name *")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check for possible duplicates" })).toBeDisabled();
  });

  it("does not allow acknowledgement when the duplicate result is truncated", () => {
    renderWorkspace({ duplicateCheck: { ...duplicateCheck, hasMoreCandidates: true } });
    expect(screen.getByRole("checkbox", { name: /I reviewed the result/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Register patient" })).toBeDisabled();
  });
});
