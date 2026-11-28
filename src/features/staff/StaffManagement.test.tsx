import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addStaffAssignment, createStaffProfile, endStaffAssignment, listStaffProfiles, setStaffProfileActive
} from "../../api/heapcare";
import { StaffManagement } from "./StaffManagement";

vi.mock("../../api/heapcare", () => ({
  ApiError: class ApiError extends Error { constructor(readonly status: number) { super("API error"); } },
  addStaffAssignment: vi.fn(),
  createStaffProfile: vi.fn(),
  endStaffAssignment: vi.fn(),
  listStaffProfiles: vi.fn(),
  setStaffProfileActive: vi.fn(),
  updateStaffProfile: vi.fn()
}));

const addAssignment = vi.mocked(addStaffAssignment);
const endAssignment = vi.mocked(endStaffAssignment);
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
  onBusyChange: vi.fn(),
  onDirectoryChanged: vi.fn()
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
    expect(props.onDirectoryChanged).toHaveBeenCalledTimes(1);
  });

  it("adds a department assignment with an effective date", async () => {
    addAssignment.mockResolvedValue({
      id: "assignment-2", hospitalId: "hospital-1", departmentId: "department-1",
      effectiveFrom: "2026-04-01", effectiveTo: null, isActive: true
    });
    render(<StaffManagement {...props} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add department assignment" }));
    fireEvent.change(screen.getByLabelText("Department"), { target: { value: "department-1" } });
    fireEvent.change(screen.getByLabelText("Effective from"), { target: { value: "2026-04-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Add assignment" }));

    await waitFor(() => expect(addAssignment).toHaveBeenCalledWith(
      props.baseUrl, props.accessToken, props.tenantId, "staff-1",
      { hospitalId: "hospital-1", departmentId: "department-1", effectiveFrom: "2026-04-01" }
    ));
    expect(await screen.findByText("Department assignment added.")).toBeInTheDocument();
    expect(props.onDirectoryChanged).toHaveBeenCalledTimes(1);
  });

  it("ends an active assignment using an explicit effective date", async () => {
    endAssignment.mockResolvedValue({
      id: "assignment-1", hospitalId: "hospital-1", departmentId: "department-1",
      effectiveFrom: "2026-01-01", effectiveTo: "2026-08-31", isActive: false
    });
    render(<StaffManagement {...props} />);

    fireEvent.click(await screen.findByRole("button", { name: "End assignment" }));
    fireEvent.change(screen.getByLabelText("Assignment end date"), { target: { value: "2026-08-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm end assignment" }));

    await waitFor(() => expect(endAssignment).toHaveBeenCalledWith(
      props.baseUrl, props.accessToken, props.tenantId, "staff-1", "assignment-1",
      "2026-08-31"
    ));
    expect(await screen.findByText("Staff assignment ended.")).toBeInTheDocument();
    expect(props.onDirectoryChanged).toHaveBeenCalledTimes(1);
  });

  it("keeps staff records readable but hides management controls without staff.manage", async () => {
    render(<StaffManagement {...props} canManage={false} />);

    expect(await screen.findByText("Asha Patil")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New staff profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledWith(props.baseUrl, props.accessToken, props.tenantId, undefined);
  });
});
