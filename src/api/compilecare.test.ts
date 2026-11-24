import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { ApiError,getCurrentUserTenantContexts,getHospitals,searchPatients } from "./compilecare";

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
});
