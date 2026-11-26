import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createStaffProfile, listStaffProfiles, setStaffProfileActive
} from "../../api/compilecare";
import { StaffManagement } from "./StaffManagement";

vi.mock("../../api/compilecare", () => ({
  ApiError: class ApiError extends Error { constructor(readonly status: number) { super("API error"); } },
  addStaffAssignment: vi.fn(),
  createStaffProfile: vi.fn(),
  endStaffAssignment: vi.fn(),
  listStaffProfiles: vi.fn(),
  setStaffProfileActive: vi.fn(),
  updateStaffProfile: vi.fn()
}));

const list = vi.mocked(listStaffProfiles);
const create = vi.mocked(createStaffProfile);
const setActive = vi.mocked(setStaffProfileActive);
const props = {
  baseUrl: "https://api.example.test",
  accessToken: "token",
  tenantId: "tenant-1",
  hospitalId: "hospital-1",
  hospitalName: "Akola General Hospital",
  departments: [{ id: "department-1", hospitalId: "hospital-1", name: "Medicine", code: "MED" }],
  canRead: true,
  canManage: true,
  onBusyChange: vi.fn()
};
const profile = {
  id: "staff-1", staffCode: "DOC-01", givenName: "Asha", middleName: null, familyName: "Patil",
  providerDesignation: "Consultant", isActive: true, createdAtUtc: "", updatedAtUtc: "",
  assignments: [{ id: "assignment-1", hospitalId: "hospital-1", departmentId: "department-1", effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true }]
};
const page = { items: [profile], page: 1, pageSize: 100, totalCount: 1, totalPages: 1 };

describe("staff management workspace", () => {
  beforeEach(() => { vi.resetAllMocks(); list.mockResolvedValue(page); });

  it("shows hospital-scoped staff assignments and requires confirmation before deactivation", async () => {
    setActive.mockResolvedValue({ ...profile, isActive: false, assignments: [] });
    render(<StaffManagement {...props} />);
    expect(await screen.findByText("Asha Patil")).toBeInTheDocument();
    expect(screen.getByText("Medicine")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deactivation" }));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith(
      props.baseUrl, props.accessToken, props.tenantId, "staff-1", false
    ));
    expect(await screen.findByText(/Open-ended active assignments were ended/)).toBeInTheDocument();
  });

  it("creates a staff profile with an initial department assignment", async () => {
    create.mockResolvedValue(profile);
    render(<StaffManagement {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "New staff profile" }));
    fireEvent.change(screen.getByLabelText("Staff code *"), { target: { value: "DOC-02" } });
    fireEvent.change(screen.getByLabelText("Given name *"), { target: { value: "Ravi" } });
    fireEvent.change(screen.getByLabelText("Initial department assignment"), { target: { value: "department-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create staff profile" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(
      props.baseUrl, props.accessToken, props.tenantId,
      expect.objectContaining({
        staffCode: "DOC-02", givenName: "Ravi", hospitalId: "hospital-1",
        departmentId: "department-1", effectiveFrom: expect.any(String)
      })
    ));
    expect(await screen.findByText("Staff profile created and assigned to the selected hospital.")).toBeInTheDocument();
  });
});
