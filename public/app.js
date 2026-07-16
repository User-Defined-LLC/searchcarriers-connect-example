const state = {
  connected: false,
  availableScopes: [],
  selectedDot: null,
};

const elements = {
  accountDescription: document.querySelector('#account-description'),
  basicScores: document.querySelector('#basic-scores'),
  companyDot: document.querySelector('#company-dot'),
  companyHeading: document.querySelector('#company-heading'),
  companyPanel: document.querySelector('#company-panel'),
  companySummary: document.querySelector('#company-summary'),
  connectButton: document.querySelector('#connect-button'),
  connectionStatus: document.querySelector('#connection-status'),
  disconnectButton: document.querySelector('#disconnect-button'),
  includeRisk: document.querySelector('#include-risk'),
  includeVetting: document.querySelector('#include-vetting'),
  evaluationList: document.querySelector('#evaluation-list'),
  loadWatches: document.querySelector('#load-watches'),
  message: document.querySelector('#message'),
  reloadCompany: document.querySelector('#reload-company'),
  requestPath: document.querySelector('#request-path'),
  responseJson: document.querySelector('#response-json'),
  responseStatus: document.querySelector('#response-status'),
  riskCount: document.querySelector('#risk-count'),
  riskList: document.querySelector('#risk-list'),
  riskOption: document.querySelector('#risk-option'),
  riskSection: document.querySelector('#risk-section'),
  scopeList: document.querySelector('#scope-list'),
  scopeSection: document.querySelector('#scope-section'),
  scoreBand: document.querySelector('#score-band'),
  scoreCoverage: document.querySelector('#score-coverage'),
  scoreDisclaimer: document.querySelector('#score-disclaimer'),
  scoreFactors: document.querySelector('#score-factors'),
  scoreRating: document.querySelector('#score-rating'),
  scoreValue: document.querySelector('#score-value'),
  searchButton: document.querySelector('#search-button'),
  searchEmpty: document.querySelector('#search-empty'),
  searchForm: document.querySelector('#search-form'),
  searchInput: document.querySelector('#search-input'),
  searchMeta: document.querySelector('#search-meta'),
  searchResults: document.querySelector('#search-results'),
  vettingResult: document.querySelector('#vetting-result'),
  vettingOption: document.querySelector('#vetting-option'),
  vettingSection: document.querySelector('#vetting-section'),
  watchEmpty: document.querySelector('#watch-empty'),
  watchPanel: document.querySelector('#watch-panel'),
  watchResults: document.querySelector('#watch-results'),
};

function setHidden(element, hidden) {
  element.classList.toggle('hidden', hidden);
}

function showMessage(message, kind = 'error') {
  elements.message.textContent = message;
  elements.message.dataset.kind = kind;
  setHidden(elements.message, false);
}

function clearMessage() {
  elements.message.textContent = '';
  setHidden(elements.message, true);
}

function inspect(path, payload, status = '200 OK') {
  elements.requestPath.textContent = path;
  elements.responseStatus.textContent = status;
  elements.responseStatus.dataset.kind = status.startsWith('2') ? 'success' : 'error';
  elements.responseJson.textContent = JSON.stringify(payload, null, 2);
}

function setLoading(button, loading) {
  button.disabled = loading;
  button.classList.toggle('is-loading', loading);
  button.setAttribute('aria-busy', String(loading));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));

  inspect(path, payload, `${response.status} ${response.statusText}`);

  if (!response.ok) {
    throw new Error(payload.message || `Request failed with status ${response.status}.`);
  }

  return payload;
}

function renderScopes(scopes) {
  elements.scopeList.replaceChildren();

  for (const scope of scopes) {
    const badge = document.createElement('code');
    badge.className = 'scope-badge';
    badge.textContent = scope;
    elements.scopeList.append(badge);
  }
}

function updateScopeOptions() {
  const hasRisk = state.availableScopes.includes('risk:read');
  const hasVetting = state.availableScopes.includes('vetting:read');

  elements.includeRisk.disabled = !hasRisk;
  elements.includeVetting.disabled = !hasVetting;
  if (!hasRisk) elements.includeRisk.checked = false;
  if (!hasVetting) elements.includeVetting.checked = false;
  elements.riskOption.dataset.available = String(hasRisk);
  elements.vettingOption.dataset.available = String(hasVetting);
  setHidden(elements.watchPanel, !state.availableScopes.includes('watches:read'));
}

function renderSession(session) {
  state.connected = session.connected;
  state.availableScopes = session.available_scopes ?? [];

  elements.searchInput.disabled = !session.connected;
  elements.searchButton.disabled = !session.connected;
  setHidden(elements.connectButton, session.connected);
  setHidden(elements.disconnectButton, !session.connected);
  setHidden(elements.scopeSection, !session.connected);

  if (!session.connected) {
    elements.connectionStatus.textContent = 'Not connected';
    elements.connectionStatus.dataset.connected = 'false';
    elements.accountDescription.textContent = 'Connect a SearchCarriers account to begin.';
    elements.searchEmpty.textContent = 'Connect an account, then search for a carrier.';
    renderScopes([]);
    updateScopeOptions();
    return;
  }

  elements.connectionStatus.textContent = 'Connected';
  elements.connectionStatus.dataset.connected = 'true';
  elements.accountDescription.textContent = `${session.user.name} · ${session.user.email}`;
  elements.searchEmpty.textContent = 'Enter a company name or identifier to search.';
  renderScopes(state.availableScopes);
  updateScopeOptions();
}

function searchItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

function formatNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Intl.NumberFormat().format(numeric) : textValue(value);
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? textValue(value)
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function humanize(value) {
  return textValue(value, 'Unknown').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function addressLine(address) {
  if (!address) return null;
  return [address.street, address.city, address.state, address.zip].filter(Boolean).join(', ');
}

function textValue(value, fallback = 'Not provided') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function renderSearchResults(payload) {
  const items = searchItems(payload);
  elements.searchResults.replaceChildren();
  setHidden(elements.searchEmpty, items.length > 0);
  const total = payload.meta?.total ?? items.length;
  elements.searchMeta.textContent = `${formatNumber(total)} ${Number(total) === 1 ? 'company' : 'companies'} found`;
  setHidden(elements.searchMeta, items.length === 0);

  if (items.length === 0) {
    elements.searchEmpty.textContent = 'No companies matched that search.';
    return;
  }

  for (const company of items.slice(0, 20)) {
    const dot = company.dot_number ?? company.dotNumber ?? company.dot;
    if (!dot) continue;

    const button = document.createElement('button');
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    const metrics = document.createElement('span');
    button.type = 'button';
    button.className = 'result-row';
    title.textContent = textValue(company.legal_name ?? company.name, `DOT ${dot}`);
    const location = [company.physical_address?.city, company.physical_address?.state].filter(Boolean).join(', ');
    meta.textContent = `DOT ${dot}${location ? ` · ${location}` : ''}`;
    metrics.className = 'result-metrics';
    metrics.textContent = `${textValue(company.operation_type, 'Unknown operation')} · ${formatNumber(company.power_units ?? 0)} power units`;
    button.append(title, meta, metrics);
    button.addEventListener('click', () => loadCompany(String(dot)));
    elements.searchResults.append(button);
  }
}

function addSummaryRow(label, value) {
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.textContent = textValue(value);
  elements.companySummary.append(term, description);
}

function renderCompany(payload) {
  const company = payload.data ?? payload;
  elements.companyHeading.textContent = textValue(company.legal_name, 'Company profile');
  elements.companySummary.replaceChildren();
  addSummaryRow('DBA name', company.dba_name);
  addSummaryRow('DOT status', company.dot_status);
  addSummaryRow('Power units', formatNumber(company.power_units));
  addSummaryRow('Trailers', formatNumber(company.trailer_units));
  addSummaryRow('Operation', company.operation_type);
  addSummaryRow('Physical address', addressLine(company.physical_address));
  addSummaryRow('Docket numbers', company.docket_numbers?.join(', '));
  addSummaryRow('Phone', company.contact?.phone);
  addSummaryRow('Email', company.contact?.email_address);
  renderScore(company.example_score);
  renderRisk(company.risk_factors, company.basic_scores);
  renderVetting(company.vetting_report);
}

function renderScore(score) {
  setHidden(elements.scoreBand, !score);
  if (!score) return;

  elements.scoreValue.textContent = formatNumber(score.score);
  elements.scoreRating.textContent = score.rating;
  elements.scoreRating.dataset.rating = String(score.rating).toLowerCase();
  elements.scoreCoverage.textContent = score.coverage;
  elements.scoreDisclaimer.textContent = score.disclaimer;
  elements.scoreFactors.replaceChildren();

  for (const factor of score.factors ?? []) {
    const row = document.createElement('div');
    const copy = document.createElement('span');
    const label = document.createElement('strong');
    const detail = document.createElement('small');
    const impact = document.createElement('b');
    row.className = 'score-factor';
    label.textContent = factor.label;
    detail.textContent = factor.detail;
    impact.textContent = `${factor.impact >= 0 ? '+' : ''}${factor.impact}`;
    impact.dataset.impact = factor.impact > 0 ? 'positive' : factor.impact < 0 ? 'negative' : 'neutral';
    copy.append(label, detail);
    row.append(copy, impact);
    elements.scoreFactors.append(row);
  }
}

function appendMetric(label, value) {
  const item = document.createElement('div');
  const metric = document.createElement('strong');
  const caption = document.createElement('span');
  metric.textContent = textValue(value);
  caption.textContent = label;
  item.append(metric, caption);
  elements.basicScores.append(item);
}

function renderRisk(riskFactors, basicScores) {
  const factors = Array.isArray(riskFactors) ? riskFactors : [];
  elements.riskList.replaceChildren();
  elements.basicScores.replaceChildren();
  elements.riskCount.textContent = `${formatNumber(factors.length)} ${factors.length === 1 ? 'signal' : 'signals'}`;

  if (basicScores) {
    if (basicScores.iss_score !== null && basicScores.iss_score !== undefined) {
      appendMetric('ISS score', basicScores.iss_score);
    }

    for (const [name, percentile] of Object.entries(basicScores.percentiles ?? {}).slice(0, 4)) {
      if (percentile !== null) appendMetric(`${humanize(name)} percentile`, percentile);
    }
  }

  setHidden(elements.basicScores, elements.basicScores.childElementCount === 0);

  for (const factor of factors) {
    const item = document.createElement('article');
    const heading = document.createElement('strong');
    const message = document.createElement('p');
    const date = document.createElement('time');
    item.className = 'signal-row';
    heading.textContent = textValue(factor.label ?? factor.type, 'Risk signal');
    message.textContent = textValue(factor.message, 'No details provided.');
    date.textContent = formatDate(factor.effective_date);
    if (factor.effective_date) date.dateTime = factor.effective_date;
    item.append(heading, message, date);
    elements.riskList.append(item);
  }

  if (factors.length === 0 && !basicScores) {
    const empty = document.createElement('p');
    empty.className = 'section-empty';
    empty.textContent = 'No current risk signals were returned for this company.';
    elements.riskList.append(empty);
  }

  setHidden(elements.riskSection, riskFactors === undefined && basicScores === undefined);
}

function renderVetting(report) {
  elements.evaluationList.replaceChildren();
  setHidden(elements.vettingSection, !report);
  if (!report) return;

  elements.vettingResult.textContent = humanize(report.overall_result);
  elements.vettingResult.dataset.result = String(report.overall_result ?? '').toLowerCase();

  for (const evaluation of report.evaluations ?? []) {
    const row = document.createElement('div');
    const rule = document.createElement('strong');
    const result = document.createElement('span');
    row.className = 'evaluation-row';
    rule.textContent = textValue(evaluation.rule, `Rule ${evaluation.rule_id}`);
    result.textContent = humanize(evaluation.result);
    result.dataset.result = String(evaluation.result ?? '').toLowerCase();
    row.append(rule, result);
    elements.evaluationList.append(row);
  }
}

function renderWatches(payload) {
  const watches = searchItems(payload);
  elements.watchResults.replaceChildren();
  setHidden(elements.watchEmpty, watches.length > 0);
  elements.watchEmpty.textContent = 'No watched companies were found for this account.';

  for (const watch of watches.slice(0, 12)) {
    const row = document.createElement('div');
    const text = document.createElement('span');
    const company = document.createElement('strong');
    const type = document.createElement('small');
    const dot = watch.company?.dot_number;
    row.className = 'watch-row';
    company.textContent = textValue(watch.company?.legal_name, dot ? `DOT ${dot}` : 'Watched company');
    type.textContent = humanize(watch.watch_type);
    text.append(company, type);
    row.append(text);

    if (dot) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'text-button';
      open.textContent = 'Open';
      open.setAttribute('aria-label', `Open ${company.textContent}`);
      open.addEventListener('click', () => loadCompany(String(dot)));
      row.append(open);
    }

    elements.watchResults.append(row);
  }
}

async function loadWatches() {
  clearMessage();
  setLoading(elements.loadWatches, true);

  try {
    renderWatches(await api('/api/watches'));
  } catch (error) {
    showMessage(error.message);
  } finally {
    setLoading(elements.loadWatches, false);
  }
}

async function loadCompany(dot) {
  clearMessage();
  state.selectedDot = dot;
  elements.companyDot.textContent = `DOT ${dot}`;
  setHidden(elements.companyPanel, false);

  const included = [];
  if (elements.includeRisk.checked) included.push('risk');
  if (elements.includeVetting.checked) included.push('vetting');
  const query = included.length ? `?include=${encodeURIComponent(included.join(','))}` : '';

  setLoading(elements.reloadCompany, true);

  try {
    const payload = await api(`/api/company/${encodeURIComponent(dot)}${query}`);
    renderCompany(payload);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    elements.companyPanel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  } catch (error) {
    showMessage(error.message);
  } finally {
    setLoading(elements.reloadCompany, false);
  }
}

elements.searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage();
  const query = elements.searchInput.value.trim();

  if (!query) {
    showMessage('Enter a company name or identifier.');
    elements.searchInput.focus();
    return;
  }

  setLoading(elements.searchButton, true);

  try {
    renderSearchResults(await api(`/api/search?q=${encodeURIComponent(query)}`));
  } catch (error) {
    showMessage(error.message);
  } finally {
    setLoading(elements.searchButton, false);
  }
});

elements.reloadCompany.addEventListener('click', () => {
  if (state.selectedDot) loadCompany(state.selectedDot);
});

elements.disconnectButton.addEventListener('click', async () => {
  clearMessage();
  setLoading(elements.disconnectButton, true);

  try {
    await api('/auth/disconnect', { method: 'POST', body: '{}' });
    state.selectedDot = null;
    setHidden(elements.companyPanel, true);
    renderSession({ connected: false, available_scopes: [] });
    showMessage('Local tokens cleared. Revoke the app in SearchCarriers Connect to invalidate the server-side grant.', 'info');
  } catch (error) {
    showMessage(error.message);
  } finally {
    setLoading(elements.disconnectButton, false);
  }
});

elements.loadWatches.addEventListener('click', async () => {
  await loadWatches();
});

async function initialize() {
  const error = new URLSearchParams(window.location.search).get('error');
  if (error) showMessage(error);

  try {
    const session = await api('/api/session');
    renderSession(session);
    if (session.connected && state.availableScopes.includes('watches:read')) {
      await loadWatches();
    }
  } catch (sessionError) {
    renderSession({ connected: false, available_scopes: [] });
    showMessage(sessionError.message);
  }
}

initialize();
