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
  permissions: string[];
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

export interface PatientRegistrationInput {
  givenName: string;
  middleName: string | null;
  familyName: string | null;
  dateOfBirth: string | null;
}

export interface PatientDuplicateCandidate {
  patientId: string;
  givenName: string;
  middleName: string | null;
  familyName: string | null;
  dateOfBirth: string;
  registeredAtUtc: string;
  matchSignals: string[];
}

export interface PatientDuplicateCheck {
  evaluated: boolean;
  evaluationMessage: string | null;
  candidates: PatientDuplicateCandidate[];
  hasMoreCandidates: boolean;
}

export interface PatientIdentifier {
  id: string;
  patientId: string;
  hospitalId: string;
  typeCode: string;
  value: string;
  assignedAtUtc: string;
}

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(status === 401 ? "Your sign-in session is not authorized for the API." :
      status === 403 ? "Your account does not have permission for this operation." :
      status === 404 ? "The requested hospital or resource was not found." :
      status === 409 ? "The record or availability changed. Refresh the data and try again." :
      status === 400 ? "Some information was not accepted. Review the entered values and try again." :
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
  query: string,
  page = 1
): Promise<Page<Patient>> {
  const parameters = new URLSearchParams({ query: query.trim(), page: String(page), pageSize: "25" });
  return getJson(
    baseUrl,
    `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/patients?${parameters.toString()}`,
    accessToken,
    tenantId
  );
}


export function checkPatientDuplicateCandidates(
  baseUrl: string,
  accessToken: string,
  tenantId: string,
  hospitalId: string,
  input: PatientRegistrationInput
): Promise<PatientDuplicateCheck> {
  return postJson(
    baseUrl,
    `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/patients/duplicate-candidates`,
    accessToken,
    tenantId,
    input
  );
}

export function registerPatient(
  baseUrl: string,
  accessToken: string,
  tenantId: string,
  hospitalId: string,
  input: PatientRegistrationInput
): Promise<Patient> {
  return postJson(
    baseUrl,
    `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/patients`,
    accessToken,
    tenantId,
    input
  );
}

export function assignPatientMedicalRecordNumber(
  baseUrl: string,
  accessToken: string,
  tenantId: string,
  hospitalId: string,
  patientId: string
): Promise<PatientIdentifier> {
  return postJson(
    baseUrl,
    `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/patients/${encodeURIComponent(patientId)}/identifiers/mrn`,
    accessToken,
    tenantId
  );
}

async function postJson<T>(
  baseUrl: string,
  path: string,
  accessToken: string,
  tenantId: string,
  body?: unknown
): Promise<T> {
  if (!baseUrl.trim()) throw new Error("The CompileCare API URL is not configured.");
  if (!accessToken.trim()) throw new Error("A valid API access token is not available. Sign in again.");
  if (!tenantId.trim()) throw new Error("Select an active tenant before continuing.");

  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "X-Tenant-ID": tenantId
  });
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(endpoint(baseUrl, path), {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    credentials: "omit"
  });

  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}


export interface AvailabilitySession {
  id: string;
  hospitalId: string;
  departmentId: string;
  providerStaffId: string;
  localDate: string;
  startsAtUtc: string;
  endsAtUtc: string;
  slotDurationMinutes: number;
  timeZoneId: string;
  createdAtUtc: string;
}

export interface AppointmentSlot {
  startsAtUtc: string;
  endsAtUtc: string;
  isAvailable: boolean;
}

export interface Appointment {
  id: string;
  hospitalId: string;
  departmentId: string;
  patientId: string;
  providerStaffId: string;
  availabilitySessionId: string;
  slotStartsAtUtc: string;
  slotEndsAtUtc: string;
  status: "Booked" | "Cancelled" | "Completed" | "NoShow" | string;
  reason: string | null;
  createdAtUtc: string;
  rescheduledFromAppointmentId: string | null;
}

export interface AppointmentBookInput {
  availabilitySessionId: string;
  patientId: string;
  slotStartsAtUtc: string;
  reason: string | null;
}

export interface QueueEntry {
  id: string;
  hospitalId: string;
  departmentId: string;
  queueDateLocal: string;
  tokenNumber: number;
  status: "Waiting" | "Called" | "InProgress" | "Completed" | "Cancelled" | "NoShow" | string;
  checkedInAtUtc: string;
  calledAtUtc: string | null;
  startedAtUtc: string | null;
  completedAtUtc: string | null;
}

export interface QueuePage extends Page<QueueEntry> {}

export interface Department { id: string; hospitalId: string; name: string; code: string | null; }

export function listDepartments(baseUrl:string,accessToken:string,tenantId:string,hospitalId:string):Promise<Page<Department>> {
  return getJson(baseUrl,`/api/v1/hospitals/${encodeURIComponent(hospitalId)}/departments?page=1&pageSize=100`,accessToken,tenantId);
}

export function listQueue(baseUrl:string,accessToken:string,tenantId:string,hospitalId:string,departmentId:string,date:string,page=1):Promise<QueuePage> {
  const parameters=new URLSearchParams({departmentId,date,page:String(page),pageSize:"50"});
  return getJson(baseUrl,`/api/v1/hospitals/${encodeURIComponent(hospitalId)}/queue?${parameters.toString()}`,accessToken,tenantId);
}

export interface WalkInCreateInput {
  departmentId: string;
  patientId: string;
  timeZoneId: string;
}

export function listAvailabilitySessions(
  baseUrl: string,
  accessToken: string,
  tenantId: string,
  hospitalId: string,
  date: string,
  departmentId?: string,
  page = 1
): Promise<Page<AvailabilitySession>> {
  const parameters = new URLSearchParams({ date, page: String(page), pageSize: "50" });
  if (departmentId) parameters.set("departmentId", departmentId);
  return getJson(
    baseUrl,
    `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/availability-sessions?${parameters.toString()}`,
    accessToken,
    tenantId
  );
}

export function getAppointmentSlots(
  baseUrl: string,
  accessToken: string,
  tenantId: string,
  hospitalId: string,
  sessionId: string
): Promise<AppointmentSlot[]> {
  return getJson(
    baseUrl,
    `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/availability-sessions/${encodeURIComponent(sessionId)}/slots`,
    accessToken,
    tenantId
  );
}

export function bookAppointment(
  baseUrl: string,
  accessToken: string,
  tenantId: string,
  hospitalId: string,
  input: AppointmentBookInput
): Promise<Appointment> {
  return postJson(
    baseUrl,
    `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/appointments`,
    accessToken,
    tenantId,
    input
  );
}

export function getAppointment(
  baseUrl: string,
  accessToken: string,
  tenantId: string,
  hospitalId: string,
  appointmentId: string
): Promise<Appointment> {
  return getJson(
    baseUrl,
    `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/appointments/${encodeURIComponent(appointmentId)}`,
    accessToken,
    tenantId
  );
}

export function checkInAppointment(
  baseUrl: string,
  accessToken: string,
  tenantId: string,
  hospitalId: string,
  appointmentId: string
): Promise<QueueEntry> {
  return postJson(
    baseUrl,
    `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/appointments/${encodeURIComponent(appointmentId)}/check-in`,
    accessToken,
    tenantId
  );
}

export function createWalkIn(
  baseUrl: string,
  accessToken: string,
  tenantId: string,
  hospitalId: string,
  input: WalkInCreateInput
): Promise<QueueEntry> {
  return postJson(
    baseUrl,
    `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/queue/walk-ins`,
    accessToken,
    tenantId,
    input
  );
}


export type QueueAction = "call" | "recall" | "start" | "complete" | "cancel" | "noshow";
export interface QueueActionInput { reason?: string | null; }

export function transitionQueueEntry(
  baseUrl: string,
  accessToken: string,
  tenantId: string,
  hospitalId: string,
  queueEntryId: string,
  action: QueueAction,
  input: QueueActionInput = {}
): Promise<QueueEntry> {
  return postJson(
    baseUrl,
    `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/queue/${encodeURIComponent(queueEntryId)}/${action}`,
    accessToken,
    tenantId,
    input
  );
}


export type OpdEncounterStatus = "InProgress" | "Signed" | "Closed" | "Cancelled" | string;
export interface OpdEncounterAmendment { id:string; reason:string; content:string; authorIssuer:string; authorSubject:string; createdAtUtc:string; }
export interface OpdEncounter {
  id:string; hospitalId:string; departmentId:string; patientId:string; queueEntryId:string;
  status:OpdEncounterStatus; chiefComplaint:string|null; history:string|null; examination:string|null;
  assessment:string|null; plan:string|null; createdByIssuer:string; createdBySubject:string;
  startedAtUtc:string; signedByIssuer:string|null; signedBySubject:string|null; signedAtUtc:string|null;
  closedAtUtc:string|null; cancellationReason:string|null; amendments:OpdEncounterAmendment[];
}
export interface OpdEncounterNoteInput { chiefComplaint:string|null; history:string|null; examination:string|null; assessment:string|null; plan:string|null; }
export interface OpdEncounterAmendmentInput { reason:string; content:string; }
export interface OpdEncounterCancelInput { reason:string; }

async function putJson<T>(baseUrl:string,path:string,accessToken:string,tenantId:string,body:unknown):Promise<T> {
  if(!baseUrl.trim()) throw new Error("The CompileCare API URL is not configured.");
  if(!accessToken.trim()) throw new Error("A valid API access token is not available. Sign in again.");
  if(!tenantId.trim()) throw new Error("Select an active tenant before continuing.");
  const headers=new Headers({Accept:"application/json",Authorization:`Bearer ${accessToken}`,"X-Tenant-ID":tenantId,"Content-Type":"application/json"});
  const response=await fetch(endpoint(baseUrl,path),{method:"PUT",headers,body:JSON.stringify(body),cache:"no-store",credentials:"omit"});
  if(!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}
const opdQueueEncounterPath=(hospitalId:string,queueEntryId:string)=>`/api/v1/hospitals/${encodeURIComponent(hospitalId)}/opd/queue/${encodeURIComponent(queueEntryId)}/encounter`;
const opdEncounterPath=(hospitalId:string,encounterId:string)=>`/api/v1/hospitals/${encodeURIComponent(hospitalId)}/opd/encounters/${encodeURIComponent(encounterId)}`;
export function getOpdEncounterForQueue(baseUrl:string,accessToken:string,tenantId:string,hospitalId:string,queueEntryId:string):Promise<OpdEncounter>{
  return getJson(baseUrl,opdQueueEncounterPath(hospitalId,queueEntryId),accessToken,tenantId);
}
export function createOpdEncounterFromQueue(baseUrl:string,accessToken:string,tenantId:string,hospitalId:string,queueEntryId:string):Promise<OpdEncounter>{
  return postJson(baseUrl,opdQueueEncounterPath(hospitalId,queueEntryId),accessToken,tenantId);
}
export function getOpdEncounter(baseUrl:string,accessToken:string,tenantId:string,hospitalId:string,encounterId:string):Promise<OpdEncounter>{
  return getJson(baseUrl,opdEncounterPath(hospitalId,encounterId),accessToken,tenantId);
}
export function updateOpdEncounterNote(baseUrl:string,accessToken:string,tenantId:string,hospitalId:string,encounterId:string,input:OpdEncounterNoteInput):Promise<OpdEncounter>{
  return putJson(baseUrl,`${opdEncounterPath(hospitalId,encounterId)}/note`,accessToken,tenantId,input);
}
export function signOpdEncounter(baseUrl:string,accessToken:string,tenantId:string,hospitalId:string,encounterId:string):Promise<OpdEncounter>{
  return postJson(baseUrl,`${opdEncounterPath(hospitalId,encounterId)}/sign`,accessToken,tenantId);
}
export function addOpdEncounterAmendment(baseUrl:string,accessToken:string,tenantId:string,hospitalId:string,encounterId:string,input:OpdEncounterAmendmentInput):Promise<OpdEncounter>{
  return postJson(baseUrl,`${opdEncounterPath(hospitalId,encounterId)}/amendments`,accessToken,tenantId,input);
}
export function closeOpdEncounter(baseUrl:string,accessToken:string,tenantId:string,hospitalId:string,encounterId:string):Promise<OpdEncounter>{
  return postJson(baseUrl,`${opdEncounterPath(hospitalId,encounterId)}/close`,accessToken,tenantId);
}
export function cancelOpdEncounter(baseUrl:string,accessToken:string,tenantId:string,hospitalId:string,encounterId:string,input:OpdEncounterCancelInput):Promise<OpdEncounter>{
  return postJson(baseUrl,`${opdEncounterPath(hospitalId,encounterId)}/cancel`,accessToken,tenantId,input);
}


export function getDepartmentPatient(
  baseUrl:string,accessToken:string,tenantId:string,hospitalId:string,departmentId:string,patientId:string
):Promise<Patient>{
  return getJson(
    baseUrl,
    `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/patients/departments/${encodeURIComponent(departmentId)}/patients/${encodeURIComponent(patientId)}`,
    accessToken,
    tenantId
  );
}


export function getHospitalPatient(
  baseUrl:string,accessToken:string,tenantId:string,hospitalId:string,patientId:string
):Promise<Patient>{
  return getJson(
    baseUrl,
    `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/patients/${encodeURIComponent(patientId)}`,
    accessToken,
    tenantId
  );
}


export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
}

async function postPlatformJson<T>(baseUrl: string, path: string, accessToken: string, body: unknown): Promise<T> {
  if (!baseUrl.trim()) throw new Error("The CompileCare API URL is not configured.");
  if (!accessToken.trim()) throw new Error("A valid API access token is not available. Sign in again.");
  const response = await fetch(endpoint(baseUrl, path), {
    method: "POST",
    headers: new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "omit"
  });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}

export function bootstrapPlatformOperator(baseUrl: string, accessToken: string, bootstrapSecret: string): Promise<{status:string}> {
  return postPlatformJson(baseUrl, "/api/v1/platform/bootstrap/operator", accessToken, { bootstrapSecret });
}

export function createPlatformTenant(baseUrl: string, accessToken: string, name: string, slug: string): Promise<PlatformTenant> {
  return postPlatformJson(baseUrl, "/api/v1/platform/tenants", accessToken, { name, slug });
}

export function provisionInitialTenantAdministrator(baseUrl: string, accessToken: string, tenantId: string, issuer: string, subject: string): Promise<unknown> {
  return postPlatformJson(baseUrl, `/api/v1/platform/tenants/${encodeURIComponent(tenantId)}/initial-administrator`, accessToken, { issuer, subject });
}

export function activatePlatformTenant(baseUrl: string, accessToken: string, tenantId: string): Promise<PlatformTenant> {
  return postPlatformJson(baseUrl, `/api/v1/platform/tenants/${encodeURIComponent(tenantId)}/activate`, accessToken, {});
}

export function createHospital(baseUrl: string, accessToken: string, tenantId: string, name: string, code: string | null): Promise<Hospital> {
  return postJson(baseUrl, "/api/v1/hospitals", accessToken, tenantId, { name, code });
}

export function createDepartment(baseUrl: string, accessToken: string, tenantId: string, hospitalId: string, name: string, code: string | null): Promise<Department> {
  return postJson(baseUrl, `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/departments`, accessToken, tenantId, { name, code });
}
