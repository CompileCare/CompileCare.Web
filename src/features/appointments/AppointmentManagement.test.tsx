import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelAppointment, createAvailabilitySession, listAppointments, listStaffProfiles
} from "../../api/heapcare";
import { AppointmentManagement } from "./AppointmentManagement";

vi.mock("../../api/heapcare", () => ({
  ApiError: class ApiError extends Error { constructor(readonly status: number) { super("API error"); } },
  cancelAppointment: vi.fn(),
  createAvailabilitySession: vi.fn(),
  getAppointmentSlots: vi.fn(),
  listAppointments: vi.fn(),
  listAvailabilitySessions: vi.fn(),
  listStaffProfiles: vi.fn(),
  rescheduleAppointment: vi.fn()
}));

const list = vi.mocked(listAppointments);
const cancel = vi.mocked(cancelAppointment);
const createAvailability = vi.mocked(createAvailabilitySession);
const listStaff = vi.mocked(listStaffProfiles);

const departments = [{ id: "department-1", hospitalId: "hospital-1", name: "Medicine", code: "MED" }];
const baseProps = {
  baseUrl: "https://api.example.test",
  accessToken: "token",
  tenantId: "tenant-1",
  hospitalId: "hospital-1",
  departments,
  canRead: true,
  canManage: true,
  canPublishAvailability: false,
  onBusyChange: vi.fn()
};
const page = {
  items: [{
    id: "appointment-1", hospitalId: "hospital-1", departmentId: "department-1",
    patientId: "patient-1", providerStaffId: "provider-1", availabilitySessionId: "session-1",
    slotStartsAtUtc: "2026-12-10T03:30:00Z", slotEndsAtUtc: "2026-12-10T04:00:00Z",
    status: "Booked", reason: "Consultation", createdAtUtc: "2026-11-26T00:00:00Z",
    rescheduledFromAppointmentId: null
  }],
  page: 1, pageSize: 25, totalCount: 1, totalPages: 1
};

describe("appointment management workspace", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    list.mockResolvedValue(page);
  });

  it("lists appointments for the selected department and supports confirmed cancellation", async () => {
    cancel.mockResolvedValue({ ...page.items[0], status: "Cancelled" });
    render(<AppointmentManagement {...baseProps} />);
    fireEvent.click(await screen.findByRole("button", { name: "Load appointments" }));
    expect(await screen.findByText("Patient reference · patient- · Provider · provider")).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith(
      baseProps.baseUrl, baseProps.accessToken, baseProps.tenantId, baseProps.hospitalId,
      "department-1", expect.any(String), undefined, 1
    );
    const cancelButton = screen.getByRole("button", { name: "Cancel appointment" });
    expect(cancelButton).toHaveClass("danger-action");
    fireEvent.click(cancelButton);
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(
      baseProps.baseUrl, baseProps.accessToken, baseProps.tenantId, baseProps.hospitalId, "appointment-1"
    ));
    expect(await screen.findByText("Appointment cancelled.")).toBeInTheDocument();
  });

  it("refreshes the provider directory after staff records or assignments change", async () => {
    listStaff.mockResolvedValue({ items: [], page: 1, pageSize: 100, totalCount: 0, totalPages: 0 });
    const { rerender } = render(<AppointmentManagement {...baseProps} canPublishAvailability staffRevision={0} />);
    await waitFor(() => expect(listStaff).toHaveBeenCalledTimes(1));
    rerender(<AppointmentManagement {...baseProps} canPublishAvailability staffRevision={1} />);
    await waitFor(() => expect(listStaff).toHaveBeenCalledTimes(2));
  });

  it("publishes availability only for a provider assigned to the selected hospital and department", async () => {
    listStaff.mockResolvedValue({
      items: [{
        id: "provider-1", staffCode: "DOC-01", givenName: "Asha", middleName: null, familyName: "Patil",
        providerDesignation: "Consultant", isActive: true, createdAtUtc: "", updatedAtUtc: "",
        assignments: [{ id: "assignment-1", hospitalId: "hospital-1", departmentId: "department-1", effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true }]
      }],
      page: 1, pageSize: 100, totalCount: 1, totalPages: 1
    });
    createAvailability.mockResolvedValue({
      id: "session-1", hospitalId: "hospital-1", departmentId: "department-1", providerStaffId: "provider-1",
      localDate: "2026-11-26", startsAtUtc: "2026-11-26T03:30:00Z", endsAtUtc: "2026-11-26T07:30:00Z",
      slotDurationMinutes: 30, timeZoneId: "Asia/Kolkata", createdAtUtc: ""
    });
    render(<AppointmentManagement {...baseProps} canRead={false} canManage={false} canPublishAvailability />);
    fireEvent.change(await screen.findByLabelText("Provider"), { target: { value: "provider-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish availability" }));
    await waitFor(() => expect(createAvailability).toHaveBeenCalledWith(
      baseProps.baseUrl, baseProps.accessToken, baseProps.tenantId, baseProps.hospitalId,
      expect.objectContaining({ departmentId: "department-1", providerStaffId: "provider-1", timeZoneId: "Asia/Kolkata" })
    ));
    expect(await screen.findByText("Provider availability published. Reception can now book its slots.")).toBeInTheDocument();
  });
});
