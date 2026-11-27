# HeapCare Web

> **Brand migration in progress:** HeapCare is the product brand. Repository names, source namespaces, package IDs, database identifiers, OIDC realm/client IDs, and deployment identifiers remain unchanged until their coordinated migration is implemented and validated.

Authenticated hospital workspace built with React, TypeScript and Vite. This application is separate from the public-facing HeapCare.Site.

## Current implementation

The shared enterprise visual foundation is being introduced incrementally in `src/design-system.css`. It centralizes visual tokens and cross-module shell, form, panel, status and responsive styles without changing API contracts or authorization behavior.

- OIDC Authorization Code + PKCE sign-in.
- Current-user tenant discovery from the validated API identity; no user-entered or inferred tenant IDs.
- Tenant selection followed by API-filtered hospital selection.
- Hospital-scoped patient lookup using the existing patient search endpoint.
- Access token supplied from the OIDC session with automatic silent renewal; OIDC user and renewal state remain in sessionStorage.
- Workspace navigation and feature visibility are driven by the effective permission identifiers returned by the API for the selected tenant context. The API remains the authorization boundary.
- Every tenant-scoped request carries the selected tenant ID in X-Tenant-ID; the API revalidates membership, tenant lifecycle, role and organization scope on every request.
- Responsive, permission-driven reception, appointment, queue, clinical and OPD billing workspaces; patient registration, MRN assignment, OPD notes, invoice issuance, payment history and receipt reprint, and daily collection reporting are exposed only when the selected membership has the matching permissions.
- Docker image, Compose health check and CI build/test/container smoke verification.

## Configure

Copy .env.example to .env.local and set:

- VITE_OIDC_AUTHORITY, VITE_OIDC_CLIENT_ID and registered redirect URIs for the hospital identity provider.
- VITE_OIDC_SCOPE to include the API resource scope required by the configured OIDC provider. The example only includes openid/profile scopes and is not sufficient unless the API accepts that audience.
- VITE_API_BASE_URL to the HTTPS base URL of HeapCare.Api.

Do not commit secrets. Configure the identity provider's allowed redirect URI, silent callback URI (`/auth/silent-callback`), API audience/scope and CORS origin for this web application. Enable refresh-token issuance/rotation or the provider's supported silent-renew flow for this public PKCE client; do not place client secrets in the browser. The API remains authoritative for identity, tenant membership, hospital/department scope and permissions.

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

- GET /api/v1/me/tenant-contexts?page=1&pageSize=100 — authenticated user context discovery, no tenant header; each active context includes its effective permission identifiers.
- GET /api/v1/hospitals?page=1&pageSize=100 — requires X-Tenant-ID and returns hospitals allowed by the persisted membership scope.
- GET /api/v1/hospitals/{hospitalId}/patients?query=...&page=1&pageSize=25 — reception patient lookup scoped to the selected tenant and hospital.
- GET /api/v1/hospitals/{hospitalId}/patients/departments/{departmentId}/patients/{patientId} — clinical identity verification scoped to the assigned department and its queue history.
- GET /api/v1/hospitals/{hospitalId}/billing/visits/{queueEntryId}/invoice — retrieve an existing invoice by OPD visit, including its settlement status and balance.
- GET /api/v1/hospitals/{hospitalId}/billing/invoices/{invoiceId}/payments — retrieve the department-scoped payment history for reopening and reprinting receipts.

The current-user tenant context and effective-permission contract is implemented in HeapCare.Api main. The web client uses these permissions only to control feature visibility; every protected API request remains independently authorized.

## Privacy and access boundaries

- Do not persist patient search results, names or dates of birth in browser storage.
- The active tenant and hospital selection IDs may be retained in tab-scoped sessionStorage and are revalidated against the authenticated user’s current memberships and API-filtered hospital list after reload.
- Do not log access tokens, patient queries or patient result payloads.
- Do not use UI role checks as authorization. The API enforces permissions on every request.
- Patient registration is available only to memberships with both `patient.register` and `patient.duplicate.review`; clinical identity reads use the separate department-scoped route.

## Container security policy (CSP)

The Nginx container disables server-version disclosure and enforces a Content-Security-Policy header at runtime. The policy defaults to same-origin resources, blocks objects and framing, restricts scripts to the Web origin, and permits network/iframe access only to explicitly configured origins. It does not use wildcard sources, `unsafe-eval` or inline scripts. The current application policy blocks inline styles as well as inline scripts; UI styles are served from the same origin.

Set both runtime environment variables on the Web container:

- `CSP_CONNECT_SRC`: space-separated bare origins for the API and OIDC authority used by browser fetch/XHR, discovery, token and session requests.
- `CSP_FRAME_SRC`: space-separated bare origins permitted for the OIDC silent-renew iframe (normally the identity-provider origin).

Values must be explicit `https://host[:port]` origins in deployed environments. Do not include paths, wildcards, quotes, semicolons or CSP directives. The container validates the values before Nginx starts and exits on missing or malformed configuration. CSP is rendered from the Nginx template at container startup, so changing runtime origin configuration does not require rebuilding the static Web bundle.

Example production container configuration (replace these example origins with the exact deployed origins):

```yaml
environment:
  CSP_CONNECT_SRC: "https://api.example.com https://identity.example.com"
  CSP_FRAME_SRC: "https://identity.example.com"
```

The repository's standalone Docker smoke Compose file uses reserved `example.com` origins only to validate header generation; they are not deployment defaults. HeapCare.Local supplies its own loopback origins and explicitly opts into HTTP for local development. Never set `ALLOW_INSECURE_CSP_ORIGINS=true` outside local development. The browser's same-origin Web origin is automatically included as `'self'`.


## HeapCare technical migration

The authenticated workspace package name, API client module path and user-facing copy now use HeapCare. Existing tab-scoped workspace selections are migrated from the old session-storage keys to HeapCare keys on first read. The existing Keycloak OIDC client ID (compilecare-web) remains a compatibility contract until the local and production identity configurations are migrated together; no issuer, realm or callback origin is changed by this frontend update.
