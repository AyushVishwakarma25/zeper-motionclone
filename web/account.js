(async () => {
  const get = id => document.getElementById(id);
  if (!get('settings-dialog')) {
    const response = await fetch('/static/account.html');
    if (!response.ok) throw new Error('Could not load Settings. Refresh MotionClone and try again.');
    const fragment = new DOMParser().parseFromString(await response.text(), 'text/html');
    const settings = fragment.getElementById('settings-dialog');
    if (!settings) throw new Error('Settings is unavailable. Refresh MotionClone and try again.');
    document.body.append(settings);
    if (typeof decorateControls === 'function') decorateControls(settings);
  }
  const dialog = get('settings-dialog'), panel = get('account-panel');
  if (!dialog || !panel) return;
  const hosted = document.body.dataset.hosted === 'true';
  let busy = false, checking = false, returnFocus = null;
  const setTxt = (id, val) => {
    const el = typeof id === 'string' ? get(id) : id;
    if (el) el.textContent = val !== undefined && val !== null ? val : '';
  };
  const message = (text, isError = false) => {
    const el = get('account-message');
    if (el) {
      el.textContent = text;
      el.style.color = isError ? '#ff7b72' : '#7ee787';
      el.hidden = !text;
    }
  };
  if (get('account-local-note')) get('account-local-note').hidden = hosted;
  if (get('account-signout')) get('account-signout').hidden = !hosted;
  setTxt('settings-storage', hosted ? 'Google Cloud Storage' : 'On this computer');

  function render(state) {
    const connected = state.status === 'connected';
    if (panel) panel.dataset.state = state.status;
    setTxt('account-badge', connected ? 'Connected' : 'Not configured');
    if (get('account-badge')) get('account-badge').dataset.state = state.status;
    
    if (get('disconnect-account')) get('disconnect-account').hidden = !connected;
    setTxt('connect-account', connected ? 'Update Connection' : 'Save & Connect Gemini');
    
    const project = state.project || '';
    const model = state.model || 'gemini-2.5-flash';
    const authType = state.auth_type === 'vertexai' ? 'Vertex AI' : 'Gemini Developer API';

    if (connected) {
      setTxt('account-title', `Google Gemini (${model}) Connected`);
      setTxt('account-description', project 
        ? `Using GCP Project "${project}" via Vertex AI (${state.location || 'us-central1'}).` 
        : `Using Gemini API Key connection. Ready for reference motion reconstruction.`);
      setTxt('account-plan', authType);
      if (get('account-plan')) get('account-plan').hidden = false;
      if (get('auth-help')) get('auth-help').hidden = true;
    } else {
      setTxt('account-title', 'Configure Google Gemini or Vertex AI');
      setTxt('account-description', 'Enter a Gemini API Key or your Google Cloud Vertex AI project details below.');
      if (get('account-plan')) get('account-plan').hidden = true;
    }

    if (get('gcp-project-id') && project && !get('gcp-project-id').value) {
      get('gcp-project-id').value = project;
    }
    if (get('gcp-location') && state.location && (!get('gcp-location').value || get('gcp-location').value === 'us-central1')) {
      get('gcp-location').value = state.location;
    }
    if (get('gemini-model') && model) {
      get('gemini-model').value = model;
    }
  }

  async function callApi(path, options = {}) {
    if (window.api) return window.api(path, options);
    let token = window.getToken ? window.getToken() : '';
    let res = await fetch(path, {
      ...options,
      headers: {
        'X-Frameforge-Token': token,
        ...(options.headers || {})
      }
    });
    if (res.status === 403 && window.refreshToken) {
      token = await window.refreshToken();
      res = await fetch(path, {
        ...options,
        headers: {
          'X-Frameforge-Token': token,
          ...(options.headers || {})
        }
      });
    }
    if (!res.ok) {
      let errDetail = res.statusText;
      try {
        const d = await res.json();
        errDetail = d.detail || errDetail;
      } catch {}
      throw new Error(errDetail);
    }
    return res.json();
  }

  async function refreshStatus() {
    if (typeof window.checkStatus === 'function') {
      try { return await window.checkStatus(); } catch {}
    }
    try {
      const s = await callApi('/api/status');
      if (s && window.onAccountStatus) window.onAccountStatus(s);
      return s;
    } catch {}
  }

  async function check() {
    if (checking || busy || document.hidden) return;
    checking = true;
    for (const id of ['refresh-account','connect-account','disconnect-account']) { const el = get(id); if (el) el.disabled = true; }
    try {
      const state = await callApi('/api/account');
      render(state);
      await refreshStatus();
    } catch (error) {
      setTxt('account-badge', 'Offline');
      if (panel) panel.dataset.state = 'error';
      setTxt('account-title', 'Could not load configuration');
      message(error.message, true);
    } finally {
      checking = false;
      for (const id of ['refresh-account','connect-account','disconnect-account']) { const el = get(id); if (el) el.disabled = false; }
    }
  }

  function openSettings() {
    if (dialog && !dialog.open) { returnFocus = document.activeElement; dialog.showModal(); }
    const url = new URL(location.href); url.searchParams.set('settings', '1'); history.replaceState({}, '', url);
    void check();
  }
  window.openSettings = openSettings;
  if (get('open-settings')) get('open-settings').addEventListener('click', openSettings);
  if (get('auth-settings')) get('auth-settings').addEventListener('click', openSettings);
  if (get('close-settings')) get('close-settings').addEventListener('click', () => dialog?.close());
  if (dialog) dialog.addEventListener('close', () => {
    const url = new URL(location.href); url.searchParams.delete('settings'); history.replaceState({}, '', url);
    if (returnFocus?.isConnected) returnFocus.focus();
  });
  if (get('refresh-account')) get('refresh-account').addEventListener('click', check);

  async function connectGemini() {
    if (busy || checking) return;
    busy = true; message('');
    if (get('connect-account')) get('connect-account').disabled = true;
    setTxt('connect-account', 'Connecting…');
    try {
      const payload = {
        api_key: get('gemini-api-key')?.value || '',
        project: get('gcp-project-id')?.value || '',
        location: get('gcp-location')?.value || '',
        model: get('gemini-model')?.value || '',
      };
      const res = await callApi('/api/account/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      render(res);
      message('Successfully connected to Google Gemini!');
      if (get('gemini-api-key')) get('gemini-api-key').value = '';
      await refreshStatus();
    } catch (error) {
      message(error.message, true);
    } finally {
      busy = false;
      if (get('connect-account')) get('connect-account').disabled = false;
      setTxt('connect-account', 'Save & Connect Gemini');
    }
  }

  async function disconnectGemini() {
    if (busy || checking) return;
    busy = true; message('');
    try {
      const res = await callApi('/api/account/disconnect', { method: 'POST' });
      render(res);
      message('Cleared credentials.');
      if (get('gemini-api-key')) get('gemini-api-key').value = '';
      if (get('gcp-project-id')) get('gcp-project-id').value = '';
      await refreshStatus();
    } catch (error) {
      message(error.message, true);
    } finally {
      busy = false;
    }
  }

  if (get('connect-account')) get('connect-account').addEventListener('click', connectGemini);
  if (get('disconnect-account')) get('disconnect-account').addEventListener('click', disconnectGemini);

  window.onAccountStatus = state => {
    for (const [id, ready] of [['settings-ffmpeg', state.ffmpeg], ['settings-renderer', state.hyperframes]]) {
      setTxt(id, ready ? 'Ready' : 'Setup needed');
      if (get(id)) get(id).dataset.ready = String(!!ready);
    }
    setTxt('settings-version', state.version ? `v${state.version}` : '');
  };

  document.addEventListener('visibilitychange', () => { if (dialog.open) void check(); });
  if (new URLSearchParams(location.search).has('settings')) openSettings();
})().catch(error => {
  const notice = document.getElementById('global-error');
  if (notice) { notice.textContent = error.message; notice.hidden = false; }
});
