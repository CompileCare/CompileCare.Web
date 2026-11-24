import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { assignPatientMedicalRecordNumber,bookAppointment,checkInAppointment,checkPatientDuplicateCandidates,createWalkIn,getAppointmentSlots,getCurrentUserTenantContexts,getHospitals,listAvailabilitySessions,listDepartments,listQueue,registerPatient,searchPatients,transitionQueueEntry } from "./compilecare";

describe("CompileCare API client",()=>{
 const fetchMock=vi.fn();

 beforeEach(()=>{vi.stubGlobal("fetch",fetchMock);});
 afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

 it("discovers current-user tenant contexts without trusting a tenant header",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({items:[],page:1,pageSize:100,totalCount:0,totalPages:0}),{status:200}));
  await getCurrentUserTenantContexts("https://api.example.test/","access-token");
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe("https://api.example.test/api/v1/me/tenant-contexts?page=1&pageSize=100");
  const headers=new Headers(options.headers);
  expect(headers.get("Authorization")).toBe("Bearer access-token");
  expect(headers.has("X-Tenant-ID")).toBe(false);
  expect(options.cache).toBe("no-store");
  expect(options.credentials).toBe("omit");
 });

 it("selects a tenant only through the trusted X-Tenant-ID request header",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({items:[],page:1,pageSize:100,totalCount:0,totalPages:0}),{status:200}));
  await getHospitals("https://api.example.test","access-token","tenant-123");
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe("https://api.example.test/api/v1/hospitals?page=1&pageSize=100");
  expect(new Headers(options.headers).get("X-Tenant-ID")).toBe("tenant-123");
 });

 it("encodes patient search text and scopes the request to the selected hospital",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({items:[],page:1,pageSize:25,totalCount:0,totalPages:0}),{status:200}));
  await searchPatients("https://api.example.test","access-token","tenant-123","hospital-456","Asha Patil");
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toContain("/api/v1/hospitals/hospital-456/patients?");
  expect(url).toContain("query=Asha+Patil");
  expect(new Headers(options.headers).get("X-Tenant-ID")).toBe("tenant-123");
 });

 it("does not expose server response bodies when authorization is denied",async()=>{
  fetchMock.mockResolvedValueOnce(new Response("sensitive server detail",{status:403}));
  await expect(getCurrentUserTenantContexts("https://api.example.test","access-token"))
   .rejects.toMatchObject({status:403,message:"Your account does not have permission for this operation."});
 });

 it("checks duplicate candidates with the selected tenant and hospital context",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({evaluated:true,evaluationMessage:null,candidates:[],hasMoreCandidates:false}),{status:200}));
  await checkPatientDuplicateCandidates("https://api.example.test","access-token","tenant-123","hospital-456",{
   givenName:"Asha",middleName:null,familyName:"Patil",dateOfBirth:"1990-01-02"
  });
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe("https://api.example.test/api/v1/hospitals/hospital-456/patients/duplicate-candidates");
  expect(options.method).toBe("POST");
  expect(new Headers(options.headers).get("X-Tenant-ID")).toBe("tenant-123");
  expect(JSON.parse(String(options.body))).toEqual({givenName:"Asha",middleName:null,familyName:"Patil",dateOfBirth:"1990-01-02"});
  expect(options.cache).toBe("no-store");
  expect(options.credentials).toBe("omit");
 });

 it("registers a patient only within the selected hospital",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({id:"patient-1",givenName:"Asha",middleName:null,familyName:"Patil",dateOfBirth:null,hospitalId:"hospital-456",registeredAtUtc:"2026-11-24T00:00:00Z"}),{status:201}));
  await registerPatient("https://api.example.test","access-token","tenant-123","hospital-456",{
   givenName:"Asha",middleName:null,familyName:"Patil",dateOfBirth:null
  });
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe("https://api.example.test/api/v1/hospitals/hospital-456/patients");
  expect(options.method).toBe("POST");
  expect(new Headers(options.headers).get("X-Tenant-ID")).toBe("tenant-123");
 });

 it("assigns an MRN using the existing hospital-scoped identifier route",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({id:"identifier-1",patientId:"patient-1",hospitalId:"hospital-456",typeCode:"MRN",value:"HOSP000001",assignedAtUtc:"2026-11-24T00:00:00Z"}),{status:200}));
  await assignPatientMedicalRecordNumber("https://api.example.test","access-token","tenant-123","hospital-456","patient-1");
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe("https://api.example.test/api/v1/hospitals/hospital-456/patients/patient-1/identifiers/mrn");
  expect(options.method).toBe("POST");
  expect(options.body).toBeUndefined();
  expect(new Headers(options.headers).get("X-Tenant-ID")).toBe("tenant-123");
 });
});


describe("appointment and arrival API client",()=>{
 const fetchMock=vi.fn();
 beforeEach(()=>{vi.stubGlobal("fetch",fetchMock);});
 afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

 it("lists hospital-scoped availability for a local date and optional department",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({items:[],page:1,pageSize:50,totalCount:0,totalPages:0}),{status:200}));
  await listAvailabilitySessions("https://api.example.test","access-token","tenant-123","hospital-456","2026-12-10","department-789");
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe("https://api.example.test/api/v1/hospitals/hospital-456/availability-sessions?date=2026-12-10&page=1&pageSize=50&departmentId=department-789");
  expect(new Headers(options.headers).get("X-Tenant-ID")).toBe("tenant-123");
  expect(options.cache).toBe("no-store");
  expect(options.credentials).toBe("omit");
 });

 it("loads slots from the selected availability session",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{startsAtUtc:"2026-12-10T03:30:00Z",endsAtUtc:"2026-12-10T04:00:00Z",isAvailable:true}]),{status:200}));
  await getAppointmentSlots("https://api.example.test","access-token","tenant-123","hospital-456","session-1");
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe("https://api.example.test/api/v1/hospitals/hospital-456/availability-sessions/session-1/slots");
  expect(new Headers(options.headers).get("X-Tenant-ID")).toBe("tenant-123");
 });

 it("books an appointment with the selected registered patient and slot",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({id:"appointment-1"}),{status:201}));
  await bookAppointment("https://api.example.test","access-token","tenant-123","hospital-456",{
   availabilitySessionId:"session-1",patientId:"patient-1",slotStartsAtUtc:"2026-12-10T03:30:00Z",reason:"Follow-up"
  });
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe("https://api.example.test/api/v1/hospitals/hospital-456/appointments");
  expect(options.method).toBe("POST");
  expect(JSON.parse(String(options.body))).toEqual({
   availabilitySessionId:"session-1",patientId:"patient-1",slotStartsAtUtc:"2026-12-10T03:30:00Z",reason:"Follow-up"
  });
  expect(new Headers(options.headers).get("X-Tenant-ID")).toBe("tenant-123");
 });

 it("checks in an appointment through the server-owned queue-token workflow",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({id:"queue-1",tokenNumber:12,status:"Waiting"}),{status:200}));
  await checkInAppointment("https://api.example.test","access-token","tenant-123","hospital-456","appointment-1");
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe("https://api.example.test/api/v1/hospitals/hospital-456/appointments/appointment-1/check-in");
  expect(options.method).toBe("POST");
  expect(options.body).toBeUndefined();
  expect(new Headers(options.headers).get("X-Tenant-ID")).toBe("tenant-123");
 });

 it("creates walk-ins without inventing an appointment or queue token in the client",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({id:"queue-1",tokenNumber:13,status:"Waiting"}),{status:201}));
  await createWalkIn("https://api.example.test","access-token","tenant-123","hospital-456",{
   departmentId:"department-789",patientId:"patient-1",timeZoneId:"Asia/Kolkata"
  });
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe("https://api.example.test/api/v1/hospitals/hospital-456/queue/walk-ins");
  expect(JSON.parse(String(options.body))).toEqual({departmentId:"department-789",patientId:"patient-1",timeZoneId:"Asia/Kolkata"});
  expect(new Headers(options.headers).get("X-Tenant-ID")).toBe("tenant-123");
 });
});


describe("department and queue read API client",()=>{ const fetchMock=vi.fn(); beforeEach(()=>{vi.stubGlobal("fetch",fetchMock);}); afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();}); it("loads departments in the selected hospital",async()=>{ fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({items:[],page:1,pageSize:100,totalCount:0,totalPages:0}),{status:200})); await listDepartments("https://api.example.test","access-token","tenant-123","hospital-456"); const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit]; expect(url).toBe("https://api.example.test/api/v1/hospitals/hospital-456/departments?page=1&pageSize=100"); expect(new Headers(options.headers).get("X-Tenant-ID")).toBe("tenant-123"); }); it("loads the queue by department and local date",async()=>{ fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({items:[],page:1,pageSize:50,totalCount:0,totalPages:0}),{status:200})); await listQueue("https://api.example.test","access-token","tenant-123","hospital-456","department-789","2026-12-10"); const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit]; expect(url).toBe("https://api.example.test/api/v1/hospitals/hospital-456/queue?departmentId=department-789&date=2026-12-10&page=1&pageSize=50"); expect(new Headers(options.headers).get("X-Tenant-ID")).toBe("tenant-123"); }); });


describe("queue operation API client",()=>{
 const fetchMock=vi.fn();
 beforeEach(()=>{vi.stubGlobal("fetch",fetchMock);});
 afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
 it.each(["call","recall","start","complete"] as const)("posts the %s transition within the selected tenant and hospital",async action=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({id:"queue-1",tokenNumber:12,status:"Called"}),{status:200}));
  await transitionQueueEntry("https://api.example.test","access-token","tenant-123","hospital-456","queue-1",action);
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe(`https://api.example.test/api/v1/hospitals/hospital-456/queue/queue-1/${action}`);
  expect(options.method).toBe("POST");
  expect(JSON.parse(String(options.body))).toEqual({});
  expect(new Headers(options.headers).get("X-Tenant-ID")).toBe("tenant-123");
  expect(options.cache).toBe("no-store");
  expect(options.credentials).toBe("omit");
 });
 it.each(["cancel","noshow"] as const)("sends the required reason for %s",async action=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({id:"queue-1",tokenNumber:12,status:action==="cancel"?"Cancelled":"NoShow"}),{status:200}));
  await transitionQueueEntry("https://api.example.test","access-token","tenant-123","hospital-456","queue-1",action,{reason:"Confirmed with reception"});
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toContain(`/queue/queue-1/${action}`);
  expect(JSON.parse(String(options.body))).toEqual({reason:"Confirmed with reception"});
  expect(new Headers(options.headers).get("X-Tenant-ID")).toBe("tenant-123");
 });
});


describe("OPD encounter API client",()=>{
 const fetchMock=vi.fn();
 beforeEach(()=>{vi.stubGlobal("fetch",fetchMock);});
 afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
 const base="https://api.example.test",tenant="tenant-123",hospital="hospital-456",queue="queue-789",encounter="encounter-321";
 const response={id:encounter,status:"InProgress",amendments:[]};
 it("looks up an encounter by queue entry for safe resume",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(response),{status:200}));
  await getOpdEncounterForQueue(base,"access-token",tenant,hospital,queue);
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe(`${base}/api/v1/hospitals/${hospital}/opd/queue/${queue}/encounter`);
  expect(new Headers(options.headers).get("X-Tenant-ID")).toBe(tenant);
  expect(options.cache).toBe("no-store");expect(options.credentials).toBe("omit");
 });
 it("creates an encounter from an in-progress queue entry",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(response),{status:201}));
  await createOpdEncounterFromQueue(base,"access-token",tenant,hospital,queue);
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe(`${base}/api/v1/hospitals/${hospital}/opd/queue/${queue}/encounter`);
  expect(options.method).toBe("POST");expect(options.body).toBeUndefined();
 });
 it("updates draft note sections with PUT and tenant scope",async()=>{
  const note={chiefComplaint:"Headache",history:null,examination:null,assessment:"Tension headache",plan:null};
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(response),{status:200}));
  await updateOpdEncounterNote(base,"access-token",tenant,hospital,encounter,note);
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe(`${base}/api/v1/hospitals/${hospital}/opd/encounters/${encounter}/note`);
  expect(options.method).toBe("PUT");expect(JSON.parse(String(options.body))).toEqual(note);
  expect(new Headers(options.headers).get("X-Tenant-ID")).toBe(tenant);
  expect(options.cache).toBe("no-store");expect(options.credentials).toBe("omit");
 });
 it("signs without client-authored identity data",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({...response,status:"Signed"}),{status:200}));
  await signOpdEncounter(base,"access-token",tenant,hospital,encounter);
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe(`${base}/api/v1/hospitals/${hospital}/opd/encounters/${encounter}/sign`);
  expect(options.method).toBe("POST");expect(options.body).toBeUndefined();
 });
 it("adds append-only amendments with a reason and content",async()=>{
  const amendment={reason:"Correction",content:"Clarification"};
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(response),{status:200}));
  await addOpdEncounterAmendment(base,"access-token",tenant,hospital,encounter,amendment);
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe(`${base}/api/v1/hospitals/${hospital}/opd/encounters/${encounter}/amendments`);
  expect(JSON.parse(String(options.body))).toEqual(amendment);
 });
 it("closes a signed encounter",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({...response,status:"Closed"}),{status:200}));
  await closeOpdEncounter(base,"access-token",tenant,hospital,encounter);
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe(`${base}/api/v1/hospitals/${hospital}/opd/encounters/${encounter}/close`);
  expect(options.method).toBe("POST");expect(options.body).toBeUndefined();
 });
 it("cancels only through the reason-bearing API contract",async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({...response,status:"Cancelled"}),{status:200}));
  await cancelOpdEncounter(base,"access-token",tenant,hospital,encounter,{reason:"Entered in error"});
  const [url,options]=fetchMock.mock.calls[0] as [string,RequestInit];
  expect(url).toBe(`${base}/api/v1/hospitals/${hospital}/opd/encounters/${encounter}/cancel`);
  expect(JSON.parse(String(options.body))).toEqual({reason:"Entered in error"});
 });
});
