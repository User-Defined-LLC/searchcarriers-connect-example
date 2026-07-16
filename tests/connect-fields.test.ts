import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCompanyFields } from '../src/connect-fields.js';

describe('Connect company field selection', () => {
  it('always includes the core company sections', () => {
    assert.deepEqual(buildCompanyFields([], ['company:read']), ['contact', 'logo', 'operation', 'service_areas']);
  });

  it('adds risk data only when risk:read is currently available', () => {
    assert.deepEqual(buildCompanyFields(['risk'], ['company:read']), [
      'contact',
      'logo',
      'operation',
      'service_areas',
    ]);
    assert.deepEqual(buildCompanyFields(['risk'], ['company:read', 'risk:read']), [
      'contact',
      'logo',
      'operation',
      'service_areas',
      'risk_factors',
      'basic_scores',
    ]);
  });

  it('keeps vetting independent from risk signals', () => {
    assert.deepEqual(buildCompanyFields(['risk', 'vetting'], ['company:read', 'vetting:read']), [
      'contact',
      'logo',
      'operation',
      'service_areas',
      'vetting_report',
    ]);
  });
});
