export const WORKSPACE_TENANT_SELECTION_KEY = "compilecare.workspace.tenantId";
const WORKSPACE_HOSPITAL_SELECTION_PREFIX = "compilecare.workspace.hospitalId.";

export function workspaceHospitalSelectionKey(tenantId: string): string {
  return `${WORKSPACE_HOSPITAL_SELECTION_PREFIX}${tenantId}`;
}

export function readWorkspaceSelection(key: string): string {
  try {
    return window.sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeWorkspaceSelection(key: string, value: string): void {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in restricted browser contexts; selection remains in memory.
  }
}

export function resolveTenantSelection<T extends { tenantId: string }>(
  contexts: T[],
  currentTenantId: string,
  storedTenantId: string
): string {
  if (currentTenantId && contexts.some(context => context.tenantId === currentTenantId)) return currentTenantId;
  if (storedTenantId && contexts.some(context => context.tenantId === storedTenantId)) return storedTenantId;
  return contexts.length === 1 ? contexts[0].tenantId : "";
}

export function resolveHospitalSelection<T extends { id: string }>(
  hospitals: T[],
  storedHospitalId: string
): string {
  if (storedHospitalId && hospitals.some(hospital => hospital.id === storedHospitalId)) return storedHospitalId;
  return hospitals.length === 1 ? hospitals[0].id : "";
}
