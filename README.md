# CompileCare Web

Authenticated hospital workspace built with React, TypeScript and Vite. This application is separate from the public-facing CompileCare.Site.

## Current implementation

- OIDC Authorization Code + PKCE sign-in.
- Current-user tenant discovery from the validated API identity; no user-entered or inferred tenant IDs.
- Tenant selection followed by API-filtered hospital selection.
- Hospital-scoped patient lookup using the existing patient search endpoint.
- Access token supplied from the OIDC session; patient results remain in component memory and are not written to localStorage or sessionStorage.
- Every tenant-scoped request carries the selected tenant ID in X-Tenant-ID; the API revalidates membership, tenant lifecycle, role and organization scope on every request.
- Responsive reception workspace; queue and clinical modules remain explicitly deferred.
- Docker image, Compose health check and CI build/test/container smoke verification.

## Configure

Copy .env.example to .env.local and set:

- VITE_OIDC_AUTHORITY, VITE_OIDC_CLIENT_ID and registered redirect URIs for the hospital identity provider.
- VITE_OIDC_SCOPE to include the API resource scope required by the configured OIDC provider. The example only includes openid/profile scopes and is not sufficient unless the API accepts that audience.
- VITE_API_BASE_URL to the HTTPS base URL of CompileCare.Api.

Do not commit secrets. Configure the identity provider's allowed redirect URI, API audience/scope and CORS origin for this web application. The API remains authoritative for identity, tenant membership, hospital/department scope and permissions.

## Run

```bash
npm install
npm run dev
```

## Docker

```bash
docker compose up --build
```

Open http://localhost:8080.

## API contract used

- GET /api/v1/me/tenant-contexts?page=1&pageSize=100 — authenticated user context discovery, no tenant header.
- GET /api/v1/hospitals?page=1&pageSize=100 — requires X-Tenant-ID and returns hospitals allowed by the persisted membership scope.
- GET /api/v1/hospitals/{hospitalId}/patients?query=...&page=1&pageSize=25 — patient lookup scoped to the selected tenant and hospital.

The first endpoint is being delivered in the paired CompileCare.Api Phase 3 PR. The web branch is intentionally prepared against that contract and must not merge before the API endpoint is merged and its contract verified.

## Privacy and access boundaries

- Do not persist patient search results, names or dates of birth in browser storage.
- Do not log access tokens, patient queries or patient result payloads.
- Do not use UI role checks as authorization. The API enforces permissions on every request.
- No patient registration write workflow is included in this increment.
