import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBed,
  createHospital,
  listBeds,
  listRooms,
  listWards
} from "../../api/heapcare";
import type { Bed, Department, Hospital, Room, Ward } from "../../api/heapcare";
import { FacilityManagement } from "./FacilityManagement";

vi.mock("../../api/heapcare", () => ({
  ApiError: class ApiError extends Error {
    constructor(readonly status: number) {
      super("Facility API request failed.");
    }
  },
  createBed: vi.fn(),
  createDepartment: vi.fn(),
  createHospital: vi.fn(),
  createRoom: vi.fn(),
  createWard: vi.fn(),
  deleteBed: vi.fn(),
  deleteDepartment: vi.fn(),
  deleteHospital: vi.fn(),
  deleteRoom: vi.fn(),
  deleteWard: vi.fn(),
  listBeds: vi.fn(),
  listRooms: vi.fn(),
  listWards: vi.fn(),
  updateBed: vi.fn(),
  updateDepartment: vi.fn(),
  updateHospital: vi.fn(),
  updateRoom: vi.fn(),
  updateWard: vi.fn()
}));

const hospital: Hospital = { id: "hospital-1", name: "City Hospital", code: "CITY" };
const department: Department = { id: "department-1", hospitalId: hospital.id, name: "Medicine", code: "MED" };
const ward: Ward = { id: "ward-1", departmentId: department.id, name: "General Ward" };
const room: Room = { id: "room-1", wardId: ward.id, name: "Room 101" };
const bed: Bed = { id: "bed-1", roomId: room.id, number: "B-101", isActive: true };
const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 100, totalCount: items.length, totalPages: items.length ? 1 : 0 });

const baseProps = {
  baseUrl: "https://api.example.test",
  accessToken: "test-token",
  tenantId: "tenant-1",
  hospital,
  departments: [department],
  departmentsLoading: false,
  onRefreshHospitals: vi.fn().mockResolvedValue(undefined),
  onRefreshDepartments: vi.fn().mockResolvedValue(undefined),
  onBusyChange: vi.fn()
};

describe("FacilityManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listWards).mockResolvedValue(page([]));
    vi.mocked(listRooms).mockResolvedValue(page([]));
    vi.mocked(listBeds).mockResolvedValue(page([]));
    vi.mocked(createHospital).mockResolvedValue({ id: "hospital-2", name: "North Hospital", code: null });
    vi.mocked(createBed).mockResolvedValue(bed);
  });

  it("does not expose mutation controls to a read-only facility membership", async () => {
    render(
      <FacilityManagement
        {...baseProps}
        permissions={["facility.read"]}
        scopes={[{ scopeType: "Hospital", hospitalId: hospital.id, departmentId: null }]}
      />
    );

    expect(screen.getByRole("heading", { name: "Facility hierarchy" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit hospital" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create department" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create ward" })).not.toBeInTheDocument();
    await screen.findByText("No wards are configured for this department.");
  });

  it("allows facility managers to write without exposing delete controls", async () => {
    render(
      <FacilityManagement
        {...baseProps}
        permissions={["facility.read", "facility.write"]}
        scopes={[{ scopeType: "Hospital", hospitalId: hospital.id, departmentId: null }]}
      />
    );

    await screen.findByText("No wards are configured for this department.");
    expect(screen.getByRole("button", { name: "Edit hospital" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create department" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete hospital" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete department" })).not.toBeInTheDocument();
  });

  it("allows a tenant-wide facility administrator to create a hospital", async () => {
    const onRefreshHospitals = vi.fn().mockResolvedValue(undefined);
    render(
      <FacilityManagement
        {...baseProps}
        hospital={undefined}
        departments={[]}
        onRefreshHospitals={onRefreshHospitals}
        permissions={["facility.read", "facility.write"]}
        scopes={[{ scopeType: "Tenant", hospitalId: null, departmentId: null }]}
      />
    );

    fireEvent.change(screen.getByLabelText("Hospital name *"), { target: { value: "North Hospital" } });
    fireEvent.click(screen.getByRole("button", { name: "Create hospital" }));

    await waitFor(() => expect(createHospital).toHaveBeenCalledWith(
      "https://api.example.test", "test-token", "tenant-1", "North Hospital", null
    ));
    expect(onRefreshHospitals).toHaveBeenCalledWith("hospital-2");
  });

  it("loads the hierarchy by parent and creates a bed only when write permission exists", async () => {
    vi.mocked(listWards).mockResolvedValue(page([ward]));
    vi.mocked(listRooms).mockResolvedValue(page([room]));
    vi.mocked(listBeds).mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([bed]));

    render(
      <FacilityManagement
        {...baseProps}
        permissions={["facility.read", "facility.write"]}
        scopes={[{ scopeType: "Hospital", hospitalId: hospital.id, departmentId: null }]}
      />
    );

    await screen.findByRole("option", { name: "General Ward" });
    await screen.findByRole("option", { name: "Room 101" });
    const bedInput = await screen.findByLabelText("Add bed");
    fireEvent.change(bedInput, { target: { value: "B-101" } });
    fireEvent.click(screen.getByRole("button", { name: "Create bed" }));

    await waitFor(() => expect(createBed).toHaveBeenCalledWith(
      "https://api.example.test", "test-token", "tenant-1", room.id, { number: "B-101", isActive: true }
    ));
    expect(await screen.findByText("B-101")).toBeInTheDocument();
  });
});
