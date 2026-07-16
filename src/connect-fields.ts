const CORE_COMPANY_FIELDS = ['contact', 'logo', 'operation', 'service_areas'] as const;

export function buildCompanyFields(requested: string[], availableScopes: string[]): string[] {
  const requestedSet = new Set(requested);
  const availableSet = new Set(availableScopes);
  const fields: string[] = [...CORE_COMPANY_FIELDS];

  if (requestedSet.has('risk') && availableSet.has('risk:read')) {
    fields.push('risk_factors', 'basic_scores');
  }

  if (requestedSet.has('vetting') && availableSet.has('vetting:read')) {
    fields.push('vetting_report');
  }

  return fields;
}
