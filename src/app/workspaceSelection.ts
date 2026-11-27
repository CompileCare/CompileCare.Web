export const WORKSPACE_TENANT_SELECTION_KEY = "heapcare.workspace.tenantId";
const WORKSPACE_HOSPITAL_SELECTION_PREFIX = "heapcare.workspace.hospitalId.";
const LEGACY_TENANT_SELECTION_KEY = "compile" + "care.workspace.tenantId";
const LEGACY_HOSPITAL_SELECTION_PREFIX = "compile" + "care.workspace.hospitalId.";

export function workspaceHospitalSelectionKey(tenantId: string): string {
  return `${WORKSPACE_HOSPITAL_SELECTION_PREFIX}${tenantId}`;
}

function legacySelectionKey(key: string): string | null {
  if (key === WORKSPACE_TENANT_SELECTION_KEY) return LEGACY_TENANT_SELECTION_KEY;
  if (key.startsWith(WORKSPACE_HOSPITAL_SELECTION_PREFIX)) {
    return `${LEGACY_HOSPITAL_SELECTION_PREFIX}${key.slice(WORKSPACE_HOSPITAL_SELECTION_PREFIX.length)}`;
  }
  return null;
}

export function readWorkspaceSelection(key: string): string {
  try {
    const current = window.sessionStorage.getItem(key);
    if (current !== null) return current;

    const legacyKey = legacySelectionKey(key);
    if (!legacyKey) return "";
    const legacyValue = window.sessionStorage.getItem(legacyKey);
    if (legacyValue === null) return "";

    window.sessionStorage.setItem(key, legacyValue);
    window.sessionStorage.removeItem(legacyKey);
    return legacyValue;
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
