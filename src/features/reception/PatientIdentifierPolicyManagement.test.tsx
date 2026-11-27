import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createPatientIdentifierPolicy, getPatientIdentifierPolicy } from "../../api/heapcare";
import { PatientIdentifierPolicyManagement } from "./PatientIdentifierPolicyManagement";

vi.mock("../../api/heapcare", () => ({
  ApiError: class ApiError extends Error { constructor(readonly status: number) { super("API error"); } },
  getPatientIdentifierPolicy: vi.fn(),
  createPatientIdentifierPolicy: vi.fn()
}));

const getPolicy = vi.mocked(getPatientIdentifierPolicy);
const createPolicy = vi.mocked(createPatientIdentifierPolicy);
const props = {
  baseUrl: "https://api.example.test",
  accessToken: "token",
  tenantId: "tenant-1",
  hospitalId: "hospital-1",
  hospitalName: "Akola General Hospital",
  canRead: true,
  canManage: true,
  onBusyChange: vi.fn()
};

describe("hospital MRN policy workspace", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("shows a create form to a HospitalAdmin with policy-manage permission", async () => {
    getPolicy.mockRejectedValue(new ApiError(404));
    render(<PatientIdentifierPolicyManagement {...props} />);
    expect(await screen.findByLabelText("MRN prefix")).toBeInTheDocument();
    expect(screen.getByLabelText("Sequence digits")).toHaveValue(6);
    const pattern = screen.getByLabelText("MRN prefix").getAttribute("pattern");
    expect(pattern).toBe("[A-Za-z0-9][A-Za-z0-9\\-]{0,19}");
    expect(() => new RegExp(pattern ?? "", "v")).not.toThrow();
  });

  it("keeps the policy read-only when only policy-read permission is present", async () => {
    getPolicy.mockRejectedValue(new ApiError(404));
    render(<PatientIdentifierPolicyManagement {...props} canRead canManage={false} />);
    expect(await screen.findByText(/Ask a HospitalAdmin/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create MRN policy" })).not.toBeInTheDocument();
  });

  it("creates the policy and displays the immutable configured format", async () => {
    getPolicy.mockRejectedValue(new ApiError(404));
    createPolicy.mockResolvedValue({ hospitalId: "hospital-1", prefix: "CC-AKH", numberLength: 6 });
    render(<PatientIdentifierPolicyManagement {...props} />);
    fireEvent.change(await screen.findByLabelText("MRN prefix"), { target: { value: "cc-akh" } });
    fireEvent.click(screen.getByRole("button", { name: "Create MRN policy" }));
    await waitFor(() => expect(createPolicy).toHaveBeenCalledWith(
      props.baseUrl, props.accessToken, props.tenantId, props.hospitalId,
      { prefix: "CC-AKH", numberLength: 6 }
    ));
    expect(await screen.findByText("CC-AKH000001")).toBeInTheDocument();
    expect(screen.getByText(/Replacement is not supported/)).toBeInTheDocument();
  });
});
