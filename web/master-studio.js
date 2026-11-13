// Master Studio Pro: AI Website Brand Autofill, Semantic Rebranding, and Visual Layer Editor
(function() {
  let activeJobId = null;
  let allJobs = [];
  let projectData = null;
  let activeTab = 'brand';
  let isAnalyzing = false;
  let isRebranding = false;
  let isRendering = false;

  let clientUrl = '';
  let brandName = '';
  let brandTagline = '';
  let brandBg = '#0e0e13';
  let brandText = '#ffffff';
  let brandAccent = '#00f2fe';
  let brandNotes = '';
  let cachedToken = window.__APP_TOKEN__ || '';
  let previewMode = 'rebuilt';
  let videoCacheKey = Date.now();
  let uploadedAsset = null;
  let screenshotPreset = 'dashboard_3d_float';
  let screenshotTitle = '';
  let screenshotSubtitle = '';
  let isAnimatingScreenshot = false;

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function getValidToken() {
    if (window.__APP_TOKEN__) {
      cachedToken = window.__APP_TOKEN__;
      return cachedToken;
    }
    if (cachedToken) return cachedToken;
    if (window.getToken && window.getToken()) {
      cachedToken = window.getToken();
      return cachedToken;
    }
    try {
      const s = await fetch('/api/status').then(r => r.json());
      if (s && s.token) {
        cachedToken = s.token;
        window.__APP_TOKEN__ = cachedToken;
        return cachedToken;
      }
    } catch {}
    return '';
  }

  // Safe API helper with automatic token acquisition and retry
  async function callApi(path, options = {}) {
    if (window.api) {
      try {
        return await window.api(path, options);
      } catch (err) {
        if (err.status !== 403 && !err.message?.includes('Refresh this page')) {
          throw err;
        }
      }
    }
    let token = await getValidToken();
    const reqHeaders = {
      'X-Frameforge-Token': token,
      ...(options.headers || {})
    };
    let res = await fetch(path, {
      ...options,
      headers: reqHeaders
    });
    if (res.status === 403) {
      try {
        const s = await fetch('/api/status').then(r => r.json());
        if (s && s.token) {
          cachedToken = s.token;
          window.__APP_TOKEN__ = cachedToken;
          if (window.refreshToken) {
            try { await window.refreshToken(); } catch {}
          }
          reqHeaders['X-Frameforge-Token'] = cachedToken;
          res = await fetch(path, {
            ...options,
            headers: reqHeaders
          });
        }
      } catch {}
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

  // Fetch all jobs to populate project dropdown
  async function fetchJobs() {
    try {
      allJobs = await callApi('/api/jobs');
      const urlJob = new URLSearchParams(window.location.search).get('job') || new URLSearchParams(window.location.search).get('id');
      if (urlJob && allJobs.some(j => j.id === urlJob)) {
        activeJobId = urlJob;
      } else if (!activeJobId && allJobs.length > 0) {
        const preferred = allJobs.find(j => j.status === 'complete') || allJobs[0];
        activeJobId = preferred ? preferred.id : null;
      }
    } catch (e) {
      console.warn('Failed to fetch jobs in Master Studio:', e);
    }
  }

  // Load project.json for the active job
  async function loadProjectData(jobId) {
    if (!jobId) return null;
    try {
      const data = await callApi(`/api/jobs/${jobId}/rebuild-project`);
      projectData = data;
      return data;
    } catch (e) {
      console.warn('Could not load rebuild-project for ' + jobId, e);
      projectData = null;
      return null;
    }
  }

  // Check hardware and AI engine status
  async function checkEngineStatus() {
    try {
      const s = await callApi('/api/status');
      const dot = $('connection-dot');
      const title = $('connection-title');
      const desc = $('connection-desc');
      if (dot && title) {
        if (s.gemini) {
          dot.className = 'status-dot connected';
          title.textContent = 'Google Gemini 2.5 & Remotion 60 FPS Ready';
          if (desc) desc.textContent = 'Hardware-accelerated Remotion rendering, interactive cursor physics, and synchronized sound design active.';
        } else {
          dot.className = 'status-dot';
          title.textContent = 'Gemini API Key Needed';
          if (desc) desc.textContent = 'Please configure your Google Gemini API Key in Settings to enable AI rebranding and scene analysis.';
        }
      }
    } catch {}
  }

  // Synchronize dropdowns across page header and embedded controls
  function updateProjectDropdowns() {
    let projectOptionsHtml = '';
    if (allJobs.length === 0) {
      projectOptionsHtml = `<option value="">No videos found</option>`;
    } else {
      for (const job of allJobs) {
        const selected = job.id === activeJobId ? 'selected' : '';
        const name = job.name || job.id;
        const status = job.status === 'complete' ? 'Ready' : job.status;
        projectOptionsHtml += `<option value="${job.id}" ${selected}>${name} (${status})</option>`;
      }
    }

    const topSelect = $('project-picker-select');
    if (topSelect) {
      topSelect.innerHTML = projectOptionsHtml;
      topSelect.value = activeJobId || '';
    }

    const masterSelect = $('master-project-select');
    if (masterSelect) {
      masterSelect.innerHTML = projectOptionsHtml;
      masterSelect.value = activeJobId || '';
    }
  }

  // Save project data to disk
  async function saveProjectData() {
    if (!activeJobId || !projectData) {
      alert('Please select an active project before saving.');
      return;
    }
    const statusEl = $('save-status');
    if (statusEl) statusEl.textContent = 'Saving…';
    try {
      await callApi(`/api/jobs/${activeJobId}/save-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
      });
      const now = new Date().toLocaleTimeString();
      if (statusEl) statusEl.textContent = `Saved at ${now}`;
      const toast = $('layer-status-msg');
      if (toast) {
        toast.textContent = '✓ Saved to disk!';
        toast.hidden = false;
        setTimeout(() => { toast.hidden = true; }, 3000);
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Save failed';
      alert('Save error: ' + err.message);
    }
  }

  // Main UI Render Function
  async function renderStudio() {
    const isDedicated = Boolean($('master-studio-root'));
    let container = $('master-studio-root') || $('master-studio');
    if (!container) {
      container = document.createElement('section');
      container.id = 'master-studio';
      container.className = 'master-studio';
      const stageCol = document.querySelector('.stage-column');
      if (stageCol) {
        stageCol.append(container);
      } else {
        document.querySelector('main')?.append(container);
      }
    }

    container.hidden = false;

    // Optional embedded header if not running in dedicated full-page master-studio.html
    let embeddedHeaderHtml = '';
    if (!isDedicated) {
      let projectOptionsHtml = '';
      for (const job of allJobs) {
        const selected = job.id === activeJobId ? 'selected' : '';
        const name = job.name || job.id;
        const status = job.status === 'complete' ? 'Ready' : job.status;
        projectOptionsHtml += `<option value="${job.id}" ${selected}>${name} (${status})</option>`;
      }
      embeddedHeaderHtml = `
        <div class="studio-4zone-header">
          <div class="master-studio-title">
            <span class="master-badge">4-Zone Studio Pro</span>
            <div>
              <h2>Master Studio Pro · 4-Zone Video Creator</h2>
              <p>Unified Creative Intelligence, 60 FPS Viewport, Visual Layer Inspector & Timeline</p>
            </div>
          </div>
          <div class="master-project-bar">
            <label for="master-project-select">Active Video:</label>
            <select id="master-project-select">
              ${projectOptionsHtml}
            </select>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      ${embeddedHeaderHtml}
      <div class="studio-4zone-grid">
        <!-- ZONE 1: BRAND INTELLIGENCE & CREATIVE DIRECTOR -->
        <aside class="zone-panel zone-1-brand" id="zone-1-brand">
          <div class="zone-panel-header">
            <span class="zone-tag">Zone 1</span>
            <h3>✨ Creative AI Director</h3>
          </div>

          <div class="zone1-box">
            <label class="zone1-label">Client Website URL</label>
            <div class="zone1-row">
              <input type="url" id="client-url-input" class="zone1-input" placeholder="e.g. https://linear.app" value="${escapeHtml(clientUrl)}">
              <button type="button" class="btn-zone1-autofill" id="btn-analyze-website" ${isAnalyzing ? 'disabled' : ''}>
                ${isAnalyzing ? '⚡ Crawling…' : '⚡ Auto-Brand'}
              </button>
            </div>
            <p class="zone-hint">Gemini analyzes the site to extract name, tagline, colors & value props.</p>
          </div>

          <div class="zone1-box">
            <label class="zone1-label">Brand / Product</label>
            <input type="text" id="brand-name-input" class="zone1-input" placeholder="e.g. Linear" value="${escapeHtml(brandName)}">
          </div>

          <div class="zone1-box">
            <label class="zone1-label">Headline / Tagline</label>
            <input type="text" id="brand-tagline-input" class="zone1-input" placeholder="e.g. The intelligent system for modern product development." value="${escapeHtml(brandTagline)}">
          </div>

          <div class="zone1-box">
            <label class="zone1-label">Brand Palette</label>
            <div class="zone1-palette">
              <label class="color-chip" title="Background Color">
                <input type="color" id="picker-bg" value="${brandBg}">
                <span>Background</span>
              </label>
              <label class="color-chip" title="Primary Text Color">
                <input type="color" id="picker-text" value="${brandText}">
                <span>Text</span>
              </label>
              <label class="color-chip" title="Accent Color">
                <input type="color" id="picker-accent" value="${brandAccent}">
                <span>Accent</span>
              </label>
            </div>
          </div>

          <div class="zone1-box">
            <label class="zone1-label">AI Directives & Value Props</label>
            <textarea id="brand-notes-input" class="zone1-textarea" rows="2" placeholder="e.g. Emphasize fast workflow automation, zero human config, sleek dark mode aesthetics">${escapeHtml(brandNotes)}</textarea>
          </div>

          <!-- WEBSITE & DASHBOARD SCREENSHOT ANIMATOR -->
          <div class="zone1-box zone1-screenshot-box">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
              <label class="zone1-label" style="margin:0;">📸 Website & Dashboard Screenshot</label>
              <span class="badge-fps-pill">60 FPS Motion</span>
            </div>

            <div class="screenshot-dropzone" id="screenshot-dropzone">
              <input type="file" id="screenshot-file-input" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display:none;">
              <div id="dropzone-prompt" class="dropzone-prompt" ${uploadedAsset ? 'hidden' : ''}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <p><strong>Click to upload</strong> or drag & drop</p>
                <span>Dashboard screenshot, website UI, app mockups</span>
              </div>
              <div id="dropzone-preview" class="dropzone-preview" ${uploadedAsset ? '' : 'hidden'}>
                <img id="screenshot-thumb" src="${uploadedAsset?.url || ''}" alt="Uploaded screenshot">
                <div class="thumb-meta">
                  <span id="screenshot-name" title="${escapeHtml(uploadedAsset?.filename || '')}">${escapeHtml(uploadedAsset?.filename || '')}</span>
                  <button type="button" id="btn-remove-screenshot" class="btn-remove-thumb" title="Remove">✕</button>
                </div>
              </div>
            </div>

            <!-- Animation Preset Selector -->
            <div class="screenshot-presets" id="screenshot-presets-wrap" ${uploadedAsset ? '' : 'hidden'}>
              <label class="zone1-label" style="margin-top:10px;">Animation Style</label>
              <select id="screenshot-preset-select" class="zone1-input">
                <option value="dashboard_3d_float" ${screenshotPreset === 'dashboard_3d_float' ? 'selected' : ''}>🌟 Dashboard 3D Float (Spring Enter & Idle Float)</option>
                <option value="interactive_cursor_click" ${screenshotPreset === 'interactive_cursor_click' ? 'selected' : ''}>🖱️ Cursor Click & Ripple (Tap Demo)</option>
                <option value="hero_scroll_reveal" ${screenshotPreset === 'hero_scroll_reveal' ? 'selected' : ''}>🚀 Hero Reveal & Kinetic Headline</option>
                <option value="transparent_callout" ${screenshotPreset === 'transparent_callout' ? 'selected' : ''}>🏷️ Transparent Callout Overlay (ProRes 4444)</option>
              </select>

              <div class="screenshot-fields" style="margin-top:8px;">
                <input type="text" id="screenshot-title-input" class="zone1-input" placeholder="Callout Headline (e.g. Real-Time Telemetry)" value="${escapeHtml(screenshotTitle)}">
                <input type="text" id="screenshot-sub-input" class="zone1-input" style="margin-top:6px;" placeholder="Badge Eyebrow (e.g. Instant 1-Click Sync)" value="${escapeHtml(screenshotSubtitle)}">
              </div>

              <button type="button" class="btn-animate-screenshot" id="btn-animate-screenshot" ${isAnimatingScreenshot ? 'disabled' : ''}>
                ${isAnimatingScreenshot ? '⚡ Animating into Scene…' : '⚡ Animate into HyperFrames Scene'}
              </button>
              <button type="button" class="btn-render-full-showcase-btn" id="btn-render-full-showcase" ${isRendering ? 'disabled' : ''}>
                ${isRendering ? '⏳ Rendering 60 FPS Video…' : '✨ Render Full 60 FPS Video (with Audio)'}
              </button>
            </div>
          </div>
        </aside>

        <!-- ZONE 2: UNIFIED 60 FPS VIEWPORT & CANVAS -->
        <main class="zone-panel zone-2-viewport" id="zone-2-viewport">
          <div class="zone-panel-header viewport-header">
            <div class="viewport-pills">
              <button type="button" class="vp-pill ${previewMode === 'rebuilt' ? 'active' : ''}" id="btn-show-rebuilt">🎬 Rebuilt Result</button>
              <button type="button" class="vp-pill ${previewMode === 'source' ? 'active' : ''}" id="btn-show-source">📹 Reference</button>
            </div>
            <div class="viewport-specs">
              <span class="badge-fps">60 FPS</span>
              <span class="badge-ratio">${projectData ? `${projectData.width || 1080}×${projectData.height || 1920}` : '9:16 Vertical Reel'}</span>
            </div>
          </div>

          <div class="viewport-stage">
            <video id="master-video-player" controls playsinline preload="auto" src="/media/${activeJobId}/${previewMode === 'rebuilt' ? 'output.mp4' : 'source.mp4'}${previewMode === 'rebuilt' ? '?v=' + videoCacheKey : ''}"></video>
            <div id="render-overlay" class="render-overlay" ${isRendering ? '' : 'hidden'}>
              <div class="spinner-neon"></div>
              <p>Rendering 60 FPS Remotion Video…</p>
            </div>
          </div>

          <div class="viewport-transport">
            <span class="transport-note">Hardware-accelerated Remotion canvas with instant keyframe sync</span>
          </div>
        </main>

        <!-- ZONE 3: VISUAL LAYER & PROPERTY INSPECTOR -->
        <aside class="zone-panel zone-3-inspector" id="zone-3-inspector">
          <div class="zone-panel-header">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="zone-tag">Zone 3</span>
              <h3>🎨 Visual Layer Customizer</h3>
            </div>
            <span id="layer-status-msg" class="save-toast" hidden>✓ Saved!</span>
          </div>
          <p class="zone-hint" style="margin-bottom:8px;">Click and edit text or colors directly without touching code.</p>

          <div id="scenes-container" class="scenes-container-scroll">
            <p style="color:#6b7384; font-size:13px;">Loading scene layers…</p>
          </div>
        </aside>

        <!-- ZONE 4: INTERACTIVE TIMELINE & ACTION DOCK -->
        <footer class="zone-panel zone-4-timeline" id="zone-4-timeline">
          <div class="timeline-header">
            <div class="timeline-title-wrap">
              <span class="zone-tag">Zone 4</span>
              <strong>⏱ Scene Sequence Timeline & Export Dock</strong>
            </div>
            <div class="timeline-stats-badge" id="timeline-stats-badge">
              ${projectData ? `${(projectData.duration || 10).toFixed(1)}s Total Duration` : 'Timeline Ready'}
            </div>
          </div>

          <!-- Timeline Track Bar -->
          <div class="timeline-track-wrap">
            <div class="timeline-scenes-bar" id="timeline-scenes-bar">
              <!-- Dynamically populated scene blocks -->
            </div>
          </div>

          <!-- Master Action Dock -->
          <div class="master-action-dock">
            <button type="button" class="btn-dock btn-rebrand-ai" id="btn-run-rebrand" ${isRebranding ? 'disabled' : ''}>
              ${isRebranding ? '🪄 Gemini adapting…' : '🪄 Rebrand Scenes with Gemini'}
            </button>

            <button type="button" class="btn-dock btn-save-layers" id="btn-save-layers-manual">
              💾 Save Layer Edits
            </button>

            <button type="button" class="btn-dock btn-render-prores" id="btn-render-prores-video" ${isRendering ? 'disabled' : ''}>
              ✨ Export Transparent ProRes (Alpha)
            </button>

            <button type="button" class="btn-dock btn-render-still" id="btn-render-still-frame">
              📸 Snapshot Frame
            </button>

            <a class="btn-dock btn-download-mp4" id="link-download-mp4" href="/media/${activeJobId}/output.mp4" download="motionclone-${activeJobId}.mp4">
              ⬇ Download Final MP4
            </a>

            <a class="btn-dock btn-export-proj" id="link-export-project" href="/api/jobs/${activeJobId}/remotion" download>
              📦 Export Remotion Project
            </a>

            <button type="button" class="btn-dock primary-action btn-render-master" id="btn-render-master-video" ${isRendering ? 'disabled' : ''}>
              ${isRendering ? '🎬 Rendering 60 FPS…' : '🎬 Render 60 FPS Video'}
            </button>
          </div>
        </footer>
      </div>
    `;

    updateProjectDropdowns();
    bindStudioEvents();
    renderLayersList();
    renderTimelineBar();
  }

  // Bind Event Listeners
  function bindStudioEvents() {
    // Top Project Picker in Page Heading
    const topPicker = $('project-picker-select');
    if (topPicker) {
      topPicker.onchange = async (e) => {
        activeJobId = e.target.value;
        window.history.replaceState({}, '', `/master-studio?job=${activeJobId}`);
        if (window.openProject && activeJobId) {
          window.openProject(activeJobId);
        }
        await loadProjectData(activeJobId);
        renderStudio();
      };
    }

    // Top Save Button
    const btnSaveTop = $('btn-save-project-top');
    if (btnSaveTop) {
      btnSaveTop.onclick = async () => {
        await saveProjectData();
      };
    }

    // Top Refresh Button
    const btnRefresh = $('btn-refresh-status');
    if (btnRefresh) {
      btnRefresh.onclick = async () => {
        btnRefresh.disabled = true;
        btnRefresh.textContent = 'Checking…';
        try {
          await checkEngineStatus();
          await fetchJobs();
          await loadProjectData(activeJobId);
          renderStudio();
        } finally {
          btnRefresh.disabled = false;
          btnRefresh.textContent = 'Refresh';
        }
      };
    }

    // Embedded Project Picker (if active)
    const masterSelect = $('master-project-select');
    if (masterSelect) {
      masterSelect.onchange = async (e) => {
        activeJobId = e.target.value;
        if (window.openProject && activeJobId) {
          window.openProject(activeJobId);
        }
        await loadProjectData(activeJobId);
        renderStudio();
      };
    }

    // Keep form state in sync on user typing
    $('client-url-input')?.addEventListener('input', e => { clientUrl = e.target.value; });
    $('brand-name-input')?.addEventListener('input', e => { brandName = e.target.value; });
    $('brand-tagline-input')?.addEventListener('input', e => { brandTagline = e.target.value; });
    $('picker-bg')?.addEventListener('input', e => { brandBg = e.target.value; });
    $('picker-text')?.addEventListener('input', e => { brandText = e.target.value; });
    $('picker-accent')?.addEventListener('input', e => { brandAccent = e.target.value; });
    $('brand-notes-input')?.addEventListener('input', e => { brandNotes = e.target.value; });

    // Analyze Website with Gemini
    const btnAnalyze = $('btn-analyze-website');
    if (btnAnalyze) {
      btnAnalyze.onclick = async () => {
        const inputUrl = $('client-url-input')?.value.trim();
        if (inputUrl) clientUrl = inputUrl;
        if (!clientUrl) {
          alert('Please enter a website URL to analyze.');
          return;
        }
        isAnalyzing = true;
        renderStudio();
        try {
          const res = await callApi('/api/brand/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: clientUrl })
          });
          if (res) {
            if (res.company_name) brandName = res.company_name;
            if (res.tagline) brandTagline = res.tagline;
            if (res.colors?.background) brandBg = res.colors.background;
            if (res.colors?.text) brandText = res.colors.text;
            if (res.colors?.accent) brandAccent = res.colors.accent;
            if (res.key_value_props?.length) {
              const props = res.key_value_props.join(' · ');
              brandNotes = (brandNotes ? brandNotes + '\n' : '') + 'Value Props: ' + props;
            }
          }
        } catch (err) {
          alert('Website analysis error: ' + err.message);
        } finally {
          isAnalyzing = false;
          renderStudio();
        }
      };
    }

    // Rebrand with Gemini
    const btnRebrand = $('btn-run-rebrand');
    if (btnRebrand) {
      btnRebrand.onclick = async () => {
        if (!activeJobId) {
          alert('Please select an active video project above.');
          return;
        }
        const brand = {
          company_name: brandName || $('brand-name-input')?.value.trim() || 'Our Product',
          tagline: brandTagline || $('brand-tagline-input')?.value.trim() || '',
          colors: {
            background: brandBg || $('picker-bg')?.value || '#0e0e13',
            text: brandText || $('picker-text')?.value || '#ffffff',
            accent: brandAccent || $('picker-accent')?.value || '#00f2fe'
          }
        };
        const instructions = brandNotes || $('brand-notes-input')?.value.trim() || '';

        isRebranding = true;
        renderStudio();
        try {
          const updated = await callApi(`/api/jobs/${activeJobId}/rebrand`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brand, instructions })
          });
          if (updated) {
            projectData = updated;
            activeTab = 'layers';
            alert(`Success! All scenes re-branded to "${brand.company_name}". Review the layers and click Render 60 FPS Video.`);
          }
        } catch (err) {
          alert('Rebrand error: ' + err.message);
        } finally {
          isRebranding = false;
          renderStudio();
        }
      };
    }

    // Save Manual Layer Edits
    const btnSave = $('btn-save-layers-manual');
    if (btnSave) {
      btnSave.onclick = async () => {
        await saveProjectData();
      };
    }

    // Video Preview Controls
    const btnShowRebuilt = $('btn-show-rebuilt');
    const btnShowSource = $('btn-show-source');
    const player = $('master-video-player');

    if (btnShowRebuilt) {
      btnShowRebuilt.onclick = () => {
        previewMode = 'rebuilt';
        btnShowRebuilt.classList.add('active');
        btnShowSource?.classList.remove('active');
        if (player && activeJobId) {
          player.src = `/media/${activeJobId}/output.mp4?v=${videoCacheKey}`;
          player.load();
          player.play().catch(() => {});
        }
      };
    }

    if (btnShowSource) {
      btnShowSource.onclick = () => {
        previewMode = 'source';
        btnShowSource.classList.add('active');
        btnShowRebuilt?.classList.remove('active');
        if (player && activeJobId) {
          player.src = `/media/${activeJobId}/source.mp4`;
          player.load();
          player.play().catch(() => {});
        }
      };
    }

    // Re-Render 60 FPS Video
    const btnRender = $('btn-render-master-video');
    if (btnRender) {
      btnRender.onclick = async () => {
        if (!activeJobId) return;
        isRendering = true;
        renderStudio();
        try {
          await callApi(`/api/jobs/${activeJobId}/render-rebuild`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const pollRender = setInterval(async () => {
            try {
              const job = await callApi(`/api/jobs/${activeJobId}`);
              if (job.status === 'complete') {
                clearInterval(pollRender);
                isRendering = false;
                videoCacheKey = Date.now();
                renderStudio();
                if (window.openProject) window.openProject(activeJobId);
                alert('🎬 Re-render complete! Your rebranded 60 FPS video is ready.');
              } else if (job.status === 'error') {
                clearInterval(pollRender);
                isRendering = false;
                renderStudio();
                alert('Render error: ' + (job.error || 'Check server logs'));
              }
            } catch {}
          }, 2500);
        } catch (err) {
          alert('Render error: ' + err.message);
          isRendering = false;
          renderStudio();
        }
      };
    }

    // Screenshot Dropzone & Upload Handler
    const dropzone = $('screenshot-dropzone');
    const fileInput = $('screenshot-file-input');
    if (dropzone && fileInput) {
      dropzone.onclick = () => fileInput.click();
      dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('dragover'); };
      dropzone.ondragleave = () => dropzone.classList.remove('dragover');
      dropzone.ondrop = async (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files?.length) {
          await handleUploadScreenshot(e.dataTransfer.files[0]);
        }
      };
      fileInput.onchange = async () => {
        if (fileInput.files?.length) {
          await handleUploadScreenshot(fileInput.files[0]);
        }
      };
    }

    $('screenshot-preset-select')?.addEventListener('change', e => { screenshotPreset = e.target.value; });
    $('screenshot-title-input')?.addEventListener('input', e => { screenshotTitle = e.target.value; });
    $('screenshot-sub-input')?.addEventListener('input', e => { screenshotSubtitle = e.target.value; });

    $('btn-remove-screenshot')?.addEventListener('click', (e) => {
      e.stopPropagation();
      uploadedAsset = null;
      renderStudio();
    });

    // Animate Screenshot Action
    const btnAnimate = $('btn-animate-screenshot');
    if (btnAnimate) {
      btnAnimate.onclick = async () => {
        if (!activeJobId) {
          alert('Please select or create an active video project above.');
          return;
        }
        if (!uploadedAsset?.filename) {
          alert('Please upload a screenshot first.');
          return;
        }
        isAnimatingScreenshot = true;
        renderStudio();
        try {
          const payload = {
            asset_filename: uploadedAsset.filename,
            preset: $('screenshot-preset-select')?.value || screenshotPreset,
            title: $('screenshot-title-input')?.value || screenshotTitle,
            subtitle: $('screenshot-sub-input')?.value || screenshotSubtitle,
            click_x: 0.72,
            click_y: 0.38,
            duration: 5.0,
            accent_color: brandAccent
          };
          await callApi(`/api/jobs/${activeJobId}/animate-screenshot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          await loadProjectData(activeJobId);
          isAnimatingScreenshot = false;
          renderStudio();
          const toast = $('layer-status-msg');
          if (toast) {
            toast.textContent = '✓ Screenshot Animated into Scene!';
            toast.hidden = false;
            setTimeout(() => { toast.hidden = true; }, 3500);
          }
        } catch (err) {
          isAnimatingScreenshot = false;
          renderStudio();
          alert('Screenshot animation failed: ' + err.message);
        }
      };
    }

    // Render Full 60 FPS Video with Sound Design directly
    const btnFullShowcase = $('btn-render-full-showcase');
    if (btnFullShowcase) {
      btnFullShowcase.onclick = async () => {
        if (!activeJobId) {
          alert('Please select an active project first.');
          return;
        }
        isRendering = true;
        renderStudio();
        try {
          const comp = $('screenshot-preset-select')?.value === 'transparent_callout' ? 'TransparentOverlay' : 'DashboardShowcase';
          await callApi(`/api/jobs/${activeJobId}/render-remotion?format=mp4&composition=${comp}`, {
            method: 'POST'
          });
          const pollRender = setInterval(async () => {
            try {
              const job = await callApi(`/api/jobs/${activeJobId}`);
              if (job.status === 'complete') {
                clearInterval(pollRender);
                isRendering = false;
                previewMode = 'rebuilt';
                videoCacheKey = Date.now();
                renderStudio();
                const player = $('master-video-player');
                if (player) {
                  player.src = `/media/${activeJobId}/output.mp4?v=${videoCacheKey}`;
                  player.load();
                  player.play().catch(() => {});
                }
                alert('🎬 Full 60 FPS video render complete! Synced sound effects and motion graphics are ready.');
              } else if (job.status === 'error') {
                clearInterval(pollRender);
                isRendering = false;
                renderStudio();
                alert('Render error: ' + (job.error || 'Check server logs'));
              }
            } catch {}
          }, 2500);
        } catch (err) {
          isRendering = false;
          renderStudio();
          alert('Render failed: ' + err.message);
        }
      };
    }

    // Export Transparent ProRes 4444 (Alpha Channel)
    const btnProRes = $('btn-render-prores-video');
    if (btnProRes) {
      btnProRes.onclick = async () => {
        if (!activeJobId) return;
        isRendering = true;
        renderStudio();
        try {
          await callApi(`/api/jobs/${activeJobId}/render-remotion?format=prores`, {
            method: 'POST'
          });
          const pollProres = setInterval(async () => {
            try {
              const job = await callApi(`/api/jobs/${activeJobId}`);
              if (job.status === 'complete') {
                clearInterval(pollProres);
                isRendering = false;
                renderStudio();
                alert('✨ Transparent ProRes 4444 video render complete! Ready for Premiere, CapCut, DaVinci.');
                window.location.href = `/media/${activeJobId}/output.mov`;
              } else if (job.status === 'error') {
                clearInterval(pollProres);
                isRendering = false;
                renderStudio();
                alert('Render error: ' + (job.error || 'Check server logs'));
              }
            } catch {}
          }, 2500);
        } catch (err) {
          isRendering = false;
          renderStudio();
          alert('ProRes render failed: ' + err.message);
        }
      };
    }

    // Snapshot Frame Still
    const btnStill = $('btn-render-still-frame');
    if (btnStill) {
      btnStill.onclick = async () => {
        if (!activeJobId) return;
        try {
          await callApi(`/api/jobs/${activeJobId}/render-remotion?format=still`, { method: 'POST' });
          window.open(`/media/${activeJobId}/still.png`, '_blank');
        } catch (err) {
          alert('Snapshot failed: ' + err.message);
        }
      };
    }
  }

  // Helper: Upload screenshot asset via multipart form data
  async function handleUploadScreenshot(file) {
    if (!activeJobId) {
      alert('Please select an active video project first.');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
      const token = await getValidToken();
      const res = await fetch(`/api/jobs/${activeJobId}/upload-asset`, {
        method: 'POST',
        headers: { 'X-Frameforge-Token': token },
        body: formData
      });
      if (!res.ok) {
        let msg = res.statusText;
        try { const d = await res.json(); msg = d.detail || msg; } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      uploadedAsset = data;
      renderStudio();
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
  }

  // Render Scene & Layer Inspector List (Zone 3)
  async function renderLayersList() {
    const listContainer = $('scenes-container');
    if (!listContainer) return;

    if (!projectData && activeJobId) {
      await loadProjectData(activeJobId);
    }

    if (!projectData || !projectData.layers) {
      listContainer.innerHTML = `<p style="color:#6b7384; font-size:13px; padding:10px;">No rebuild project found for ${activeJobId || 'selected video'}. Rebuild has not completed yet.</p>`;
      return;
    }

    // Group text layers by scene prefix (e.g. s0_, s1_)
    const sceneGroups = {};
    for (const layer of projectData.layers) {
      if (layer.kind !== 'text') continue;
      const match = layer.id.match(/^(s\d+)_/);
      const sceneKey = match ? match[1] : 'other';
      sceneGroups[sceneKey] = sceneGroups[sceneKey] || [];
      sceneGroups[sceneKey].push(layer);
    }

    const keys = Object.keys(sceneGroups);
    if (!keys.length) {
      listContainer.innerHTML = `<p style="color:#6b7384; font-size:13px; padding:10px;">No editable text layers detected in this project.</p>`;
      return;
    }

    let html = '';
    for (const [idx, key] of keys.entries()) {
      const layers = sceneGroups[key];
      const startT = layers[0]?.start ?? 0;
      const endT = layers[layers.length - 1]?.end ?? 0;

      html += `
        <div class="scene-card" data-scene-idx="${idx}">
          <div class="scene-card-header">
            <span class="scene-title-badge">Scene ${idx + 1}</span>
            <span class="scene-time-pill">${startT.toFixed(1)}s – ${endT.toFixed(1)}s</span>
          </div>
          <div class="scene-layers-list">
      `;

      for (const layer of layers) {
        const textVal = layer.text || '';
        const colorVal = layer.style?.color || '#ffffff';
        html += `
          <div class="layer-item-row" data-layer-id="${layer.id}">
            <span class="layer-id-tag" title="${layer.id}">${layer.id}</span>
            <div class="layer-input-wrap">
              <input type="text" class="layer-text-input" value="${escapeHtml(textVal)}" data-id="${layer.id}" placeholder="Layer copy">
            </div>
            <input type="color" class="layer-color-pick" value="${colorVal}" data-id="${layer.id}" title="Text Color">
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;
    }

    listContainer.innerHTML = html;

    // Attach input listeners for live updates to projectData
    listContainer.querySelectorAll('.layer-text-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const id = e.target.dataset.id;
        const found = projectData.layers.find(l => l.id === id);
        if (found) found.text = e.target.value;
      });
    });

    listContainer.querySelectorAll('.layer-color-pick').forEach(picker => {
      picker.addEventListener('input', (e) => {
        const id = e.target.dataset.id;
        const found = projectData.layers.find(l => l.id === id);
        if (found) {
          found.style = found.style || {};
          found.style.color = e.target.value;
        }
      });
    });
  }

  // Render Interactive Scene Sequence Timeline (Zone 4)
  function renderTimelineBar() {
    const bar = $('timeline-scenes-bar');
    if (!bar || !projectData || !projectData.layers) return;
    const sceneGroups = {};
    for (const layer of projectData.layers) {
      if (layer.kind !== 'text') continue;
      const match = layer.id.match(/^(s\d+)_/);
      const sceneKey = match ? match[1] : 'other';
      sceneGroups[sceneKey] = sceneGroups[sceneKey] || [];
      sceneGroups[sceneKey].push(layer);
    }
    const keys = Object.keys(sceneGroups);
    if (!keys.length) {
      bar.innerHTML = '<span style="color:#6b7384; font-size:12px; padding:6px 10px;">No scene segments detected</span>';
      return;
    }
    const totalDuration = projectData.duration || 10;
    let html = '';
    keys.forEach((key, idx) => {
      const layers = sceneGroups[key];
      const startT = layers[0]?.start ?? 0;
      const endT = layers[layers.length - 1]?.end ?? (startT + 2);
      const dur = Math.max(0.5, endT - startT);
      const pct = Math.max(12, (dur / totalDuration) * 100);
      html += `
        <div class="timeline-scene-chip" style="flex: ${pct};" title="Scene ${idx + 1}: ${startT.toFixed(1)}s – ${endT.toFixed(1)}s" data-scene-idx="${idx}">
          <span class="scene-chip-title">Scene ${idx + 1}</span>
          <span class="scene-chip-time">${startT.toFixed(1)}s – ${endT.toFixed(1)}s</span>
          <span style="font-size:10px; color:#6b7384; display:block; margin-top:2px;">${layers.length} text layers</span>
        </div>
      `;
    });
    bar.innerHTML = html;

    // Click scene chip to scroll to that scene in Zone 3
    bar.querySelectorAll('.timeline-scene-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        bar.querySelectorAll('.timeline-scene-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const idx = chip.dataset.sceneIdx;
        const target = document.querySelector(`.scene-card[data-scene-idx="${idx}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          target.classList.add('highlight-pulse');
          setTimeout(() => target.classList.remove('highlight-pulse'), 1500);
        }
      });
    });
  }

  // App Lifecycle Hook
  window.addEventListener('DOMContentLoaded', async () => {
    await checkEngineStatus();
    await fetchJobs();
    if (window.current?.id) {
      activeJobId = window.current.id;
    }
    await loadProjectData(activeJobId);
    renderStudio();

    // Listen for project switches from index.html or other tabs
    window.addEventListener('project-show', async (e) => {
      const job = e.detail;
      if (job && job.id !== activeJobId) {
        activeJobId = job.id;
        await loadProjectData(activeJobId);
        renderStudio();
      }
    });
  });
})();
