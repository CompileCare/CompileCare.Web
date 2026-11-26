import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activatePlatformTenant,
  closePlatformTenant,
  createPlatformTenant,
  listPlatformTenants,
  provisionInitialTenantAdministrator,
  suspendPlatformTenant
} from "../../api/compilecare";
import type { PlatformTenant } from "../../api/compilecare";
import { PlatformTenantManagement } from "./PlatformTenantManagement";

vi.mock("../../api/compilecare", () => ({
  activatePlatformTenant: vi.fn(),
  closePlatformTenant: vi.fn(),
  createPlatformTenant: vi.fn(),
  listPlatformTenants: vi.fn(),
  provisionInitialTenantAdministrator: vi.fn(),
  suspendPlatformTenant: vi.fn()
}));

const provisioning: PlatformTenant = {
  id: "tenant-1",
  name: "City Hospital Group",
  slug: "city-hospital-group",
  status: "Provisioning",
  createdAtUtc: "2026-11-26T00:00:00Z",
  updatedAtUtc: "2026-11-26T00:00:00Z"
};
const active: PlatformTenant = { ...provisioning, status: "Active" };
const suspended: PlatformTenant = { ...provisioning, status: "Suspended" };
const closed: PlatformTenant = { ...provisioning, status: "Closed" };
const page = (items: PlatformTenant[]) => ({
  items, page: 1, pageSize: 50, totalCount: items.length, totalPages: items.length ? 1 : 0
});
const props = {
  baseUrl: "https://api.example.test",
  accessToken: "platform-token",
  currentIssuer: "https://identity.example.test",
  onBusyChange: vi.fn()
};

describe("PlatformTenantManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPlatformTenants).mockResolvedValue(page([provisioning]));
    vi.mocked(createPlatformTenant).mockResolvedValue(provisioning);
    vi.mocked(provisionInitialTenantAdministrator).mockResolvedValue({});
    vi.mocked(activatePlatformTenant).mockResolvedValue(active);
    vi.mocked(suspendPlatformTenant).mockResolvedValue(suspended);
    vi.mocked(closePlatformTenant).mockResolvedValue(closed);
  });

  it("lists global tenants without requiring a tenant context", async () => {
    render(<PlatformTenantManagement {...props} />);

    expect(await screen.findByRole("heading", { name: "City Hospital Group" })).toBeInTheDocument();
    expect(listPlatformTenants).toHaveBeenCalledWith(
      "https://api.example.test", "platform-token", 1
    );
    expect(screen.getByText("Provisioning")).toBeInTheDocument();
  });

  it("creates a tenant in Provisioning state with a normalized slug", async () => {
    render(<PlatformTenantManagement {...props} />);

    fireEvent.change(screen.getByLabelText("Tenant name *"), {
      target: { value: "North & West Hospital Group" }
    });
    expect(screen.getByLabelText("Tenant slug *")).toHaveValue("north-west-hospital-group");
    fireEvent.click(screen.getByRole("button", { name: "Create tenant" }));

    await waitFor(() => expect(createPlatformTenant).toHaveBeenCalledWith(
      "https://api.example.test", "platform-token", "North & West Hospital Group", "north-west-hospital-group"
    ));
    expect(await screen.findByText(/Tenant created in Provisioning state/)).toBeInTheDocument();
  });

  it("provisions the initial HospitalAdmin before activating a new tenant", async () => {
    render(<PlatformTenantManagement {...props} />);

    fireEvent.change(await screen.findByLabelText("Initial administrator OIDC subject"), {
      target: { value: "initial-admin-subject" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Provision administrator and activate" }));

    await waitFor(() => expect(provisionInitialTenantAdministrator).toHaveBeenCalledWith(
      "https://api.example.test",
      "platform-token",
      "tenant-1",
      "https://identity.example.test",
      "initial-admin-subject"
    ));
    expect(activatePlatformTenant).toHaveBeenCalledWith(
      "https://api.example.test", "platform-token", "tenant-1"
    );
    expect(await screen.findByText("Initial HospitalAdmin provisioned and tenant activated.")).toBeInTheDocument();
  });

  it("requires explicit confirmation before suspending an active tenant", async () => {
    vi.mocked(listPlatformTenants).mockResolvedValue(page([active]));
    render(<PlatformTenantManagement {...props} />);

    fireEvent.click(await screen.findByRole("button", { name: "Suspend tenant" }));
    expect(screen.getByText("Tenant users will lose access until the tenant is reactivated.")).toBeInTheDocument();
    expect(suspendPlatformTenant).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm suspension" }));
    await waitFor(() => expect(suspendPlatformTenant).toHaveBeenCalledWith(
      "https://api.example.test", "platform-token", "tenant-1"
    ));
  });

  it("reactivates a suspended tenant and keeps closed tenants terminal", async () => {
    let listCalls = 0;
    vi.mocked(listPlatformTenants).mockImplementation(async () => {
      listCalls += 1;
      return page(listCalls <= 2 ? [suspended] : [closed]);
    });
    render(<PlatformTenantManagement {...props} />);

    fireEvent.click(await screen.findByRole("button", { name: "Reactivate tenant" }));
    await waitFor(() => expect(activatePlatformTenant).toHaveBeenCalledWith(
      "https://api.example.test", "platform-token", "tenant-1"
    ));

    expect(await screen.findByText("Closed tenants are terminal and cannot be reactivated.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reactivate tenant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close tenant" })).not.toBeInTheDocument();
  });

  it("requires explicit confirmation before permanently closing a tenant", async () => {
    vi.mocked(listPlatformTenants).mockResolvedValue(page([active]));
    render(<PlatformTenantManagement {...props} />);

    fireEvent.click(await screen.findByRole("button", { name: "Close tenant" }));
    expect(screen.getByText(/This action is terminal and cannot be undone/)).toBeInTheDocument();
    expect(closePlatformTenant).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm close" }));
    await waitFor(() => expect(closePlatformTenant).toHaveBeenCalledWith(
      "https://api.example.test", "platform-token", "tenant-1"
    ));
  });
});
