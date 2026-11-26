import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDailyCollectionReport, listAppointments, listQueue } from "../../api/compilecare";
import { HospitalOverview } from "./HospitalOverview";

vi.mock("../../api/compilecare", () => ({
  getDailyCollectionReport: vi.fn(),
  listAppointments: vi.fn(),
  listQueue: vi.fn()
}));

const appointments = vi.mocked(listAppointments);
const queue = vi.mocked(listQueue);
const collection = vi.mocked(getDailyCollectionReport);
const props = {
  baseUrl: "https://api.example.test",
  accessToken: "token",
  tenantId: "tenant-1",
  hospitalId: "hospital-1",
  hospitalName: "Akola General Hospital",
  departments: [{ id: "department-1", hospitalId: "hospital-1", name: "Medicine", code: "MED" }],
  timeZoneId: "Asia/Kolkata",
  canReadAppointments: true,
  canReadQueue: true,
  canReadCollection: true,
  canReadBilling: true,
  canReadPatients: true,
  canReadStaff: true
};

describe("hospital operations overview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    appointments.mockResolvedValue({ items: [], page: 1, pageSize: 25, totalCount: 14, totalPages: 1 });
    queue.mockResolvedValue({ items: [], page: 1, pageSize: 50, totalCount: 7, totalPages: 1 });
    collection.mockResolvedValue({ businessDate: "2026-11-26", timeZoneId: "Asia/Kolkata", totalCollected: 2500, byMethod: { Cash: 1500, UPI: 1000 }, paymentCount: 5 });
  });

  it("shows department appointment and queue totals plus hospital-wide collection", async () => {
    render(<HospitalOverview {...props} />);
    expect(await screen.findByText("14")).toBeInTheDocument();
    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(await screen.findByText("₹2,500")).toBeInTheDocument();
    await waitFor(() => {
      expect(appointments).toHaveBeenCalledWith(
        props.baseUrl, props.accessToken, props.tenantId, props.hospitalId,
        "department-1", expect.any(String)
      );
      expect(queue).toHaveBeenCalledWith(
        props.baseUrl, props.accessToken, props.tenantId, props.hospitalId,
        "department-1", expect.any(String)
      );
      expect(collection).toHaveBeenCalledWith(
        props.baseUrl, props.accessToken, props.tenantId, props.hospitalId,
        expect.any(String), "Asia/Kolkata"
      );
    });
  });

  it("does not show shortcuts for modules the membership cannot read", async () => {
    render(<HospitalOverview {...props} canReadPatients={false} canReadStaff={false} canReadBilling={false} canReadAppointments={false} canReadQueue={false} canReadCollection />);
    expect(await screen.findByText("₹2,500")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Appointments/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Queue/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Reception/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Workforce/ })).not.toBeInTheDocument();
  });
});
