import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildExampleCarrierScore } from '../src/carrier-score.js';

describe('illustrative carrier score', () => {
  it('uses only base company data when optional scopes are unavailable', () => {
    const result = buildExampleCarrierScore({ dot_status: 'Active', power_units: 12 });

    assert.equal(result.score, 75);
    assert.equal(result.rating, 'Review');
    assert.equal(result.coverage, 'Limited');
  });

  it('incorporates risk and vetting data when the connection can return them', () => {
    const result = buildExampleCarrierScore({
      dot_status: 'Active',
      power_units: 12,
      risk_factors: [],
      basic_scores: { iss_score: 35 },
      vetting_report: { overall_result: 'pass' },
    });

    assert.equal(result.score, 100);
    assert.equal(result.rating, 'Strong');
    assert.equal(result.coverage, 'Expanded');
  });

  it('caps adverse results at zero and explains each impact', () => {
    const result = buildExampleCarrierScore({
      dot_status: 'Out of Service',
      power_units: 0,
      risk_factors: [{}, {}, {}, {}, {}, {}],
      basic_scores: { iss_score: 95 },
      vetting_report: { overall_result: 'fail' },
    });

    assert.equal(result.score, 0);
    assert.equal(result.rating, 'Elevated');
    assert.equal(result.factors.length, 5);
  });
});
