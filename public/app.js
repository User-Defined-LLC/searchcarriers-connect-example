const state = {
  connected: false,
  availableScopes: [],
  selectedDot: null,
};

const elements = {
  accountDescription: document.querySelector('#account-description'),
  companyDot: document.querySelector('#company-dot'),
  companyPanel: document.querySelector('#company-panel'),
  companySummary: document.querySelector('#company-summary'),
  connectButton: document.querySelector('#connect-button'),
  connectionStatus: document.querySelector('#connection-status'),
  disconnectButton: document.querySelector('#disconnect-button'),
  includeRisk: document.querySelector('#include-risk'),
  includeVetting: document.querySelector('#include-vetting'),
  loadWatches: document.querySelector('#load-watches'),
  message: document.querySelector('#message'),
  reloadCompany: document.querySelector('#reload-company'),
  requestPath: document.querySelector('#request-path'),
  responseJson: document.querySelector('#response-json'),
  responseStatus: document.querySelector('#response-status'),
  riskOption: document.querySelector('#risk-option'),
  scopeList: document.querySelector('#scope-list'),
  scopeSection: document.querySelector('#scope-section'),
  searchButton: document.querySelector('#search-button'),
  searchEmpty: document.querySelector('#search-empty'),
  searchForm: document.querySelector('#search-form'),
  searchInput: document.querySelector('#search-input'),
  searchResults: document.querySelector('#search-results'),
  vettingOption: document.querySelector('#vetting-option'),
  watchPanel: document.querySelector('#watch-panel'),
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

function textValue(value, fallback = 'Not provided') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function renderSearchResults(payload) {
  const items = searchItems(payload);
  elements.searchResults.replaceChildren();
  setHidden(elements.searchEmpty, items.length > 0);

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
    button.type = 'button';
    button.className = 'result-row';
    title.textContent = textValue(company.legal_name ?? company.name, `DOT ${dot}`);
    const stateCode = company.physical_address?.state;
    meta.textContent = `DOT ${dot}${stateCode ? ` · ${stateCode}` : ''}`;
    button.append(title, meta);
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
  elements.companySummary.replaceChildren();
  addSummaryRow('Legal name', company.legal_name);
  addSummaryRow('DBA name', company.dba_name);
  addSummaryRow('DOT status', company.dot_status);
  addSummaryRow('Power units', company.power_units);
  addSummaryRow('Operation', company.operation_type);
  addSummaryRow('Phone', company.contact?.phone);
  addSummaryRow('Email', company.contact?.email_address);

  if (company.risk_factors) {
    addSummaryRow('Risk factors', `${company.risk_factors.length} returned`);
  }

  if (company.vetting_report) {
    addSummaryRow('Vetting result', company.vetting_report.overall_result);
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
  clearMessage();
  setLoading(elements.loadWatches, true);

  try {
    await api('/api/watches');
  } catch (error) {
    showMessage(error.message);
  } finally {
    setLoading(elements.loadWatches, false);
  }
});

async function initialize() {
  const error = new URLSearchParams(window.location.search).get('error');
  if (error) showMessage(error);

  try {
    const session = await api('/api/session');
    renderSession(session);
  } catch (sessionError) {
    renderSession({ connected: false, available_scopes: [] });
    showMessage(sessionError.message);
  }
}

initialize();
