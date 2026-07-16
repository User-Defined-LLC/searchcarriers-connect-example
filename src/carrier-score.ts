export type CarrierScoreFactor = {
  label: string;
  impact: number;
  detail: string;
};

export type ExampleCarrierScore = {
  score: number;
  rating: 'Strong' | 'Review' | 'Elevated';
  coverage: 'Limited' | 'Partial' | 'Expanded';
  factors: CarrierScoreFactor[];
  disclaimer: string;
};

type CompanyData = Record<string, unknown>;

function numeric(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function record(value: unknown): CompanyData | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as CompanyData) : null;
}

function has(company: CompanyData, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(company, key);
}

export function buildExampleCarrierScore(company: CompanyData): ExampleCarrierScore {
  const factors: CarrierScoreFactor[] = [];
  let score = 60;
  let coverageSections = 1;

  if (String(company.dot_status ?? '').toLowerCase() === 'active') {
    score += 10;
    factors.push({ label: 'Active DOT status', impact: 10, detail: 'The carrier record is active.' });
  } else {
    score -= 20;
    factors.push({ label: 'DOT status needs review', impact: -20, detail: `Current status: ${company.dot_status ?? 'unknown'}.` });
  }

  const powerUnits = numeric(company.power_units);
  if (powerUnits !== null && powerUnits > 0) {
    score += 5;
    factors.push({ label: 'Operating fleet reported', impact: 5, detail: `${powerUnits} power units are on file.` });
  } else {
    score -= 5;
    factors.push({ label: 'No operating fleet reported', impact: -5, detail: 'No positive power-unit count was returned.' });
  }

  if (has(company, 'risk_factors') || has(company, 'basic_scores')) {
    coverageSections += 1;
    const riskFactors = Array.isArray(company.risk_factors) ? company.risk_factors : [];
    const riskImpact = riskFactors.length === 0 ? 10 : -Math.min(25, riskFactors.length * 5);
    score += riskImpact;
    factors.push({
      label: riskFactors.length === 0 ? 'No current risk signals' : `${riskFactors.length} current risk signal${riskFactors.length === 1 ? '' : 's'}`,
      impact: riskImpact,
      detail: riskFactors.length === 0 ? 'The risk endpoint returned no current signals.' : 'Each returned signal reduces this demonstration score.',
    });

    const issScore = numeric(record(company.basic_scores)?.iss_score);
    if (issScore !== null) {
      const issImpact = issScore <= 50 ? 10 : issScore > 75 ? -10 : 0;
      score += issImpact;
      factors.push({
        label: `ISS score ${issScore}`,
        impact: issImpact,
        detail: issScore <= 50 ? 'Lower ISS scores increase the example score.' : issScore > 75 ? 'Higher ISS scores reduce the example score.' : 'The ISS score is in the neutral range for this example.',
      });
    }
  }

  if (has(company, 'vetting_report')) {
    coverageSections += 1;
    const vettingReport = record(company.vetting_report);
    const result = String(vettingReport?.overall_result ?? '').toLowerCase();
    const vettingImpact = result.includes('pass') ? 15 : result.includes('fail') ? -25 : result ? -5 : 0;
    score += vettingImpact;
    factors.push({
      label: vettingReport ? `Vetting result: ${vettingReport.overall_result}` : 'No vetting report returned',
      impact: vettingImpact,
      detail: vettingReport ? 'The connected user’s Vetting Engine result is included.' : 'Vetting was requested, but no report was available.',
    });
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score: normalizedScore,
    rating: normalizedScore >= 80 ? 'Strong' : normalizedScore >= 60 ? 'Review' : 'Elevated',
    coverage: coverageSections >= 3 ? 'Expanded' : coverageSections === 2 ? 'Partial' : 'Limited',
    factors,
    disclaimer: 'Illustrative example only. This is not an official SearchCarriers score or a substitute for your own review policy.',
  };
}
