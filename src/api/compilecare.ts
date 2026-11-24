export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface OrganizationScope {
  scopeType: "Tenant" | "Hospital" | "Department";
  hospitalId: string | null;
  departmentId: string | null;
}

export interface UserTenantContext {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: string;
  scopes: OrganizationScope[];
}

export interface Hospital {
  id: string;
  name: string;
  code: string | null;
}

export interface Patient {
  id: string;
  givenName: string;
  middleName: string | null;
  familyName: string | null;
  dateOfBirth: string | null;
  hospitalId: string;
  registeredAtUtc: string;
}

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(status === 401 ? "Your sign-in session is not authorized for the API." :
      status === 403 ? "Your account does not have permission for this operation." :
      status === 404 ? "The requested hospital or resource was not found." :
      "The API request could not be completed.");
    this.name = "ApiError";
  }
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

async function getJson<T>(
  baseUrl: string,
  path: string,
  accessToken: string,
  tenantId?: string
): Promise<T> {
  if (!baseUrl.trim()) throw new Error("The CompileCare API URL is not configured.");
  if (!accessToken.trim()) throw new Error("A valid API access token is not available. Sign in again.");

  const headers = new Headers({ Accept: "application/json", Authorization: `Bearer ${accessToken}` });
  if (tenantId) headers.set("X-Tenant-ID", tenantId);

  const response = await fetch(endpoint(baseUrl, path), {
    method: "GET",
    headers,
    cache: "no-store",
    credentials: "omit"
  });

  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}

export function getCurrentUserTenantContexts(
  baseUrl: string,
  accessToken: string
): Promise<Page<UserTenantContext>> {
  return getJson(baseUrl, "/api/v1/me/tenant-contexts?page=1&pageSize=100", accessToken);
}

export function getHospitals(
  baseUrl: string,
  accessToken: string,
  tenantId: string
): Promise<Page<Hospital>> {
  return getJson(baseUrl, "/api/v1/hospitals?page=1&pageSize=100", accessToken, tenantId);
}

export function searchPatients(
  baseUrl: string,
  accessToken: string,
  tenantId: string,
  hospitalId: string,
  query: string
): Promise<Page<Patient>> {
  const parameters = new URLSearchParams({ query: query.trim(), page: "1", pageSize: "25" });
  return getJson(
    baseUrl,
    `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/patients?${parameters.toString()}`,
    accessToken,
    tenantId
  );
}
