export interface OrganizationAnchor { x: number; y: number; }
/** Inner anchors use organization IDs and domain:<UUID> keys in the existing coordinate frame. */
export interface OrganizationScopeLayout { offices: Record<string, OrganizationAnchor>; satellites: Record<string, OrganizationAnchor>; }
export interface OrganizationConfiguration { schemaVersion: 1; scopes: Record<string, OrganizationScopeLayout>; }
export interface OrganizationView { revision: number; configuration: OrganizationConfiguration; }
export const emptyOrganizationConfiguration = (): OrganizationConfiguration => ({ schemaVersion: 1, scopes: {} });
