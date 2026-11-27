import { beforeEach, describe, expect, it } from "vitest";
import {
  readWorkspaceSelection, resolveHospitalSelection, resolveTenantSelection,
  writeWorkspaceSelection, WORKSPACE_TENANT_SELECTION_KEY, workspaceHospitalSelectionKey
} from "./workspaceSelection";

describe("workspace context selection", () => {
  beforeEach(() => sessionStorage.clear());

  it("restores only a tenant that exists in the authenticated membership contexts", () => {
    const contexts = [{ tenantId: "tenant-a" }, { tenantId: "tenant-b" }];
    expect(resolveTenantSelection(contexts, "", "tenant-b")).toBe("tenant-b");
    expect(resolveTenantSelection(contexts, "tenant-a", "tenant-b")).toBe("tenant-a");
    expect(resolveTenantSelection(contexts, "", "revoked-tenant")).toBe("");
  });

  it("defaults to the sole available tenant without inventing a context", () => {
    expect(resolveTenantSelection([{ tenantId: "tenant-a" }], "", "")).toBe("tenant-a");
    expect(resolveTenantSelection([], "", "")).toBe("");
  });

  it("restores a hospital only when it is present in the API-filtered hospital list", () => {
    const hospitals = [{ id: "hospital-a" }, { id: "hospital-b" }];
    expect(resolveHospitalSelection(hospitals, "hospital-b")).toBe("hospital-b");
    expect(resolveHospitalSelection(hospitals, "hospital-revoked")).toBe("");
    expect(resolveHospitalSelection([{ id: "hospital-a" }], "")).toBe("hospital-a");
  });

  it("migrates existing session selections from the old brand keys without losing the selected context", () => {
    const oldTenantKey = "compile" + "care.workspace.tenantId";
    const oldHospitalKey = "compile" + "care.workspace.hospitalId.tenant-a";
    sessionStorage.setItem(oldTenantKey, "tenant-a");
    sessionStorage.setItem(oldHospitalKey, "hospital-a");

    expect(readWorkspaceSelection(WORKSPACE_TENANT_SELECTION_KEY)).toBe("tenant-a");
    expect(readWorkspaceSelection(workspaceHospitalSelectionKey("tenant-a"))).toBe("hospital-a");
    expect(sessionStorage.getItem(oldTenantKey)).toBeNull();
    expect(sessionStorage.getItem(oldHospitalKey)).toBeNull();
  });

  it("stores tenant and tenant-specific hospital selections in tab-scoped session storage", () => {
    writeWorkspaceSelection(WORKSPACE_TENANT_SELECTION_KEY, "tenant-a");
    writeWorkspaceSelection(workspaceHospitalSelectionKey("tenant-a"), "hospital-a");
    expect(readWorkspaceSelection(WORKSPACE_TENANT_SELECTION_KEY)).toBe("tenant-a");
    expect(readWorkspaceSelection(workspaceHospitalSelectionKey("tenant-a"))).toBe("hospital-a");
    writeWorkspaceSelection(WORKSPACE_TENANT_SELECTION_KEY, "");
    expect(readWorkspaceSelection(WORKSPACE_TENANT_SELECTION_KEY)).toBe("");
  });
});
