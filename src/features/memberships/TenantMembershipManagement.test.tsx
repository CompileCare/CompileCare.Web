import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTenantMembership,
  deactivateTenantMembership,
  listDepartments,
  listTenantMemberships,
  reactivateTenantMembership,
  updateTenantMembership
} from "../../api/compilecare";
import type { Hospital, TenantMembership } from "../../api/compilecare";
import { TenantMembershipManagement } from "./TenantMembershipManagement";

vi.mock("../../api/compilecare", () => ({
  ApiError: class ApiError extends Error {
    constructor(readonly status: number) {
      super("Membership request failed.");
    }
  },
  createTenantMembership: vi.fn(),
  deactivateTenantMembership: vi.fn(),
  listDepartments: vi.fn(),
  listTenantMemberships: vi.fn(),
  reactivateTenantMembership: vi.fn(),
  updateTenantMembership: vi.fn()
}));

const hospital: Hospital = { id: "hospital-1", name: "City Hospital", code: "CITY" };
const tenantScope = [{ scopeType: "Tenant" as const, hospitalId: null, departmentId: null }];
const hospitalScope = [{ scopeType: "Hospital" as const, hospitalId: hospital.id, departmentId: null }];
const membership: TenantMembership = {
  id: "membership-1",
  issuer: "https://identity.example.test",
  subject: "another-user-subject",
  role: "FacilityViewer",
  isActive: true,
  createdAtUtc: "2026-11-26T00:00:00Z",
  updatedAtUtc: "2026-11-26T00:00:00Z",
  scopes: hospitalScope
};
const page = (items: TenantMembership[]) => ({
  items, page: 1, pageSize: 50, totalCount: items.length, totalPages: items.length ? 1 : 0
});
const props = {
  baseUrl: "https://api.example.test",
  accessToken: "test-token",
  tenantId: "tenant-1",
  currentIssuer: "https://identity.example.test",
  currentSubject: "current-admin-subject",
  permissions: ["membership.manage"],
  scopes: tenantScope,
  hospitals: [hospital],
  onBusyChange: vi.fn()
};

describe("TenantMembershipManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listTenantMemberships).mockResolvedValue(page([membership]));
    vi.mocked(listDepartments).mockResolvedValue({
      items: [{ id: "department-1", hospitalId: hospital.id, name: "Medicine", code: "MED" }],
      page: 1, pageSize: 100, totalCount: 1, totalPages: 1
    });
    vi.mocked(createTenantMembership).mockResolvedValue(membership);
    vi.mocked(updateTenantMembership).mockResolvedValue(membership);
    vi.mocked(deactivateTenantMembership).mockResolvedValue({ ...membership, isActive: false });
    vi.mocked(reactivateTenantMembership).mockResolvedValue(membership);
  });

  it("loads tenant memberships with current role and organization scope", async () => {
    render(<TenantMembershipManagement {...props} />);

    expect(await screen.findByText("another…subject")).toBeInTheDocument();
    expect(screen.getByText("FacilityViewer")).toBeInTheDocument();
    expect(screen.getByText("City Hospital")).toBeInTheDocument();
    expect(listTenantMemberships).toHaveBeenCalledWith(
      "https://api.example.test", "test-token", "tenant-1", 1
    );
  });

  it("creates a membership using the validated issuer and selected department scope", async () => {
    render(<TenantMembershipManagement {...props} />);

    fireEvent.change(screen.getByLabelText("OIDC subject *"), {
      target: { value: "new-user-subject" }
    });
    fireEvent.change(screen.getByLabelText("Tenant role"), {
      target: { value: "ClinicalUser" }
    });
    fireEvent.change(screen.getByLabelText("Scope type"), {
      target: { value: "Department" }
    });

    await screen.findByRole("option", { name: "Medicine · MED" });
    fireEvent.change(screen.getByLabelText("Department"), {
      target: { value: "department-1" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create membership" }));

    await waitFor(() => expect(createTenantMembership).toHaveBeenCalledWith(
      "https://api.example.test",
      "test-token",
      "tenant-1",
      {
        issuer: "https://identity.example.test",
        subject: "new-user-subject",
        role: "ClinicalUser",
        scopes: [{ scopeType: "Department", hospitalId: hospital.id, departmentId: "department-1" }]
      }
    ));
    expect(await screen.findByText("Membership created.")).toBeInTheDocument();
  });

  it("updates role and scopes while preserving the membership identity", async () => {
    render(<TenantMembershipManagement {...props} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit access" }));
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "FacilityManager" } });
    fireEvent.click(screen.getByRole("button", { name: "Save access" }));

    await waitFor(() => expect(updateTenantMembership).toHaveBeenCalledWith(
      "https://api.example.test",
      "test-token",
      "tenant-1",
      membership.id,
      { role: "FacilityManager", scopes: hospitalScope }
    ));
    expect(await screen.findByText("Membership access updated.")).toBeInTheDocument();
  });

  it("requires confirmation before deactivating a membership", async () => {
    render(<TenantMembershipManagement {...props} />);

    fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));
    expect(screen.getByText(/Deactivate membership for/)).toBeInTheDocument();
    expect(deactivateTenantMembership).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm deactivation" }));
    await waitFor(() => expect(deactivateTenantMembership).toHaveBeenCalledWith(
      "https://api.example.test", "test-token", "tenant-1", membership.id
    ));
  });

  it("does not offer self-management actions for the current identity", async () => {
    const ownMembership = { ...membership, subject: props.currentSubject };
    vi.mocked(listTenantMemberships).mockResolvedValue(page([ownMembership]));
    render(<TenantMembershipManagement {...props} />);

    expect(await screen.findByText("Your account")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit access" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeDisabled();
  });

  it("reactivates an inactive membership after explicit confirmation", async () => {
    vi.mocked(listTenantMemberships).mockResolvedValue(page([{ ...membership, isActive: false }]));
    render(<TenantMembershipManagement {...props} />);

    fireEvent.click(await screen.findByRole("button", { name: "Reactivate" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reactivation" }));

    await waitFor(() => expect(reactivateTenantMembership).toHaveBeenCalledWith(
      "https://api.example.test", "test-token", "tenant-1", membership.id
    ));
  });
});
