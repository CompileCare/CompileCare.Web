export const WORKSPACE_MODULE_SECTIONS = [
  "clinical",
  "reception",
  "patient-registration",
  "overview",
  "appointment-management",
  "staff-management",
  "queue",
  "billing",
  "facilities",
  "mrn-policy",
  "memberships",
  "platform-tenants"
] as const;

export type WorkspaceModuleSection = typeof WORKSPACE_MODULE_SECTIONS[number];

export function getRequestedWorkspaceSection(pathname: string, hash: string): string {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  if (WORKSPACE_MODULE_SECTIONS.includes(fragment as WorkspaceModuleSection)) return fragment;
  return pathname === "/" ? "" : pathname.replace(/^\/+|\/+$/g, "");
}

export function getCanonicalWorkspaceLocation(
  section: string,
  hash: string,
  legacyHashSection: boolean
): string {
  const fragment = legacyHashSection
    ? (section ? `#${section}` : "")
    : hash || (section ? `#${section}` : "");
  return section ? `/${section}${fragment}` : `/${fragment}`;
}

export function isWorkspaceSectionActive(activeSection: string, section: WorkspaceModuleSection): boolean {
  return activeSection === section;
}
