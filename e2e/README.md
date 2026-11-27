# HeapCare Web browser test scope

The Playwright suite in this directory is a deterministic UI regression suite. It runs the Vite application locally, installs a synthetic OIDC session, and intercepts API calls with isolated in-memory route handlers. It does not contact the real Keycloak instance, HeapCare.Api or PostgreSQL.

This is intentional: it makes reception, queue, clinical, billing, keyboard and responsive UI tests repeatable without creating real patient or billing data.

## Generate the HTML report with screenshots

```bash
npm ci
npx playwright install chromium
npm run test:e2e
```

Playwright writes:
- `playwright-report/` — self-contained HTML report with per-test screenshots and failure attachments.
- `test-results/` — raw test output, screenshot attachments, and traces/videos for failed tests.

Open the report:

```bash
npm run test:e2e:report
```

This report and its screenshots are generated for local QA runs and are not uploaded as GitHub Actions artifacts. CI uses the lightweight console reporter and captures screenshots only when a test fails.

## Real local-stack acceptance is separate

Passing these browser tests proves the mocked UI workflows work. It does not prove OIDC discovery, access-token issuer/audience validation, tenant membership, API authorization, PostgreSQL migrations or real persistence.

Those must be tested separately against the Docker Compose local stack with a real local Keycloak user, platform operator, tenant, hospital and synthetic records. Never bypass authentication or tenant authorization to make a test pass. Use synthetic data only and do not include access tokens, passwords or patient information in screenshots or reports.

Record the run environment, commit SHAs, service health, test evidence and any blocked/unverified checks in the final report.


## Real Keycloak + API browser acceptance

The separate `e2e-real/` suite exercises the deployed Docker Web image against the real local Keycloak and HeapCare.Api services. It does not intercept the identity provider or API. It follows the Authorization Code + PKCE redirect, signs in with a synthetic CI user, and verifies that the same persisted identity can switch between HospitalAdmin and FacilityViewer memberships in two tenants. It checks the selected hospital and role-specific workspace navigation, and confirms that API hospital-list requests carry a bearer token and the selected X-Tenant-ID.

This suite is run by HeapCare.Local's isolated full-stack CI job after it provisions the temporary Keycloak user and PostgreSQL memberships. It is deliberately excluded from the default mock-based `npm run test:e2e` suite. The Web CI validates that the real-OIDC Playwright configuration and spec are discoverable; the Local full-stack workflow supplies the real identity provider, API, database and temporary user credentials.

The test uses an ephemeral credential file in the GitHub runner's temporary directory. It does not print credentials, access tokens or authorization codes, and the file is removed during Local CI cleanup. Use synthetic identities only.
