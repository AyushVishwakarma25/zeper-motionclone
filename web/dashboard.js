// Dashboard Pro: Reference-to-Video Explainer Studio Frontend Controller
(function() {
  'use strict';

  let activeJobId = null;
  let allJobs = [];
  let projectState = null;
  let activeAspect = '9:16';
  let activeLanguage = 'en';
  let activeSceneIndex = 0;
  let chatHistory = [];
  let isSendingChat = false;
  let cachedToken = window.__APP_TOKEN__ || '';
  let musicLibrary = [];
  let videoCacheKey = Date.now();

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

  async function callApi(path, options = {}) {
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
          reqHeaders['X-Frameforge-Token'] = cachedToken;
          res = await fetch(path, { ...options, headers: reqHeaders });
        }
      } catch {}
    }
    if (!res.ok) {
      let errDetail = res.statusText;
      try {
        const d = await res.json();
        errDetail = d.detail || d.message || errDetail;
      } catch {}
      throw new Error(errDetail);
    }
    return res.json();
  }

  // Check hardware and AI engine status
  async function checkEngineStatus() {
    try {
      const s = await callApi('/api/status');
      const dot = $('ai-status-dot');
      const txt = $('ai-status-text');
      if (dot && txt) {
        if (s.gemini) {
          dot.className = 'status-dot connected';
          txt.textContent = 'Google Gemini 2.5 / 3.0 Ready';
        } else {
          dot.className = 'status-dot';
          txt.textContent = 'Gemini Key Needed';
        }
      }
    } catch {}
  }

  // Load Music Library
  async function loadMusicLibrary() {
    try {
      const data = await callApi('/api/dashboard/music-library');
      if (data && data.tracks) {
        musicLibrary = data.tracks;
        const select = $('music-track-select');
        if (select) {
          select.innerHTML = musicLibrary.map(t => 
            `<option value="${t.id}">🎵 ${escapeHtml(t.name)} (${t.bpm} BPM · ${escapeHtml(t.genre)})</option>`
          ).join('');
        }
      }
    } catch (e) {
      console.warn('Could not load music library:', e);
    }
  }

  // Fetch Jobs List
  async function fetchJobs() {
    try {
      allJobs = await callApi('/api/jobs');
      const select = $('dashboard-project-select');
      if (!select) return;

      if (allJobs.length === 0) {
        select.innerHTML = '<option value="">No projects found (Click + New)</option>';
      } else {
        select.innerHTML = allJobs.map(j => {
          const selected = j.id === activeJobId ? 'selected' : '';
          return `<option value="${j.id}" ${selected}>${escapeHtml(j.name || j.id)} (${j.status})</option>`;
        }).join('');
      }

      const urlJob = new URLSearchParams(window.location.search).get('job');
      if (urlJob && allJobs.some(j => j.id === urlJob)) {
        activeJobId = urlJob;
      } else if (!activeJobId && allJobs.length > 0) {
        activeJobId = allJobs[0].id;
      }

      if (select && activeJobId) {
        select.value = activeJobId;
      }
    } catch (e) {
      console.warn('Could not fetch jobs:', e);
    }
  }

  // Load Dashboard Project State
  async function loadProject(id) {
    if (!id) return;
    activeJobId = id;
    try {
      projectState = await callApi(`/api/dashboard/project/${id}`);
      if (projectState.aspect) {
        setAspectRatio(projectState.aspect);
      }
      if (projectState.language) {
        setLanguage(projectState.language);
      }
      renderAllViews();
    } catch (e) {
      console.warn('Could not load dashboard project for ' + id, e);
    }
  }

  // Aspect Ratio Switcher
  function setAspectRatio(ratio) {
    activeAspect = ratio;
    const stageContainer = $('stage-viewport-container');
    if (stageContainer) {
      stageContainer.className = `stage-viewport-inner aspect-${ratio.replace(':', '-')}`;
    }
    const badge = $('badge-active-ratio');
    if (badge) {
      badge.textContent = ratio === '9:16' ? '9:16 Vertical Reel' : (ratio === '16:9' ? '16:9 Horizontal' : '1:1 Square');
    }
    document.querySelectorAll('.aspect-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.aspect === ratio);
    });
  }

  // Language Switcher
  function setLanguage(lang) {
    activeLanguage = lang;
    document.querySelectorAll('.lang-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    if (projectState && projectState.scene_plan) {
      renderSceneInspector();
    }
  }

  // Pipeline Step Updater
  function updatePipelineStep(stepNum) {
    for (let i = 1; i <= 5; i++) {
      const node = $(`step-node-${i}`);
      if (node) {
        node.classList.toggle('active', i <= stepNum);
      }
    }
  }

  // Render All UI Views
  function renderAllViews() {
    renderVideoStage();
    renderTimelineScenes();
    renderSceneInspector();
    renderAssetChips();
    renderBlueprintSummary();
    updateExportLinks();
  }

  function renderVideoStage() {
    const player = $('dashboard-video-player');
    const emptyState = $('stage-empty-state');
    const badgeDur = $('badge-active-duration');

    const hasVideo = projectState && (projectState.preview_url || projectState.source_url);
    if (emptyState) {
      emptyState.style.display = hasVideo ? 'none' : 'flex';
    }

    if (player && projectState) {
      const src = projectState.preview_url ? `${projectState.preview_url}?v=${videoCacheKey}` : projectState.source_url;
      if (src && player.src !== window.location.origin + src) {
        player.src = src;
        player.load();
      }
    }

    if (badgeDur && projectState?.scene_plan?.duration_seconds) {
      badgeDur.textContent = `${projectState.scene_plan.duration_seconds.toFixed(1)}s`;
    }
  }

  // Render Timeline Scene Blocks
  function renderTimelineScenes() {
    const container = $('scenes-track-container');
    if (!container) return;

    const scenes = projectState?.scene_plan?.scenes || [];
    if (scenes.length === 0) {
      container.innerHTML = `
        <div style="color:var(--muted); font-size:12px; padding:12px;">
          No scene sequence generated yet. Click <strong>⚡ Deconstruct Reference</strong> or ask the AI Director in chat.
        </div>
      `;
      return;
    }

    container.innerHTML = scenes.map((s, idx) => {
      const isActive = idx === activeSceneIndex ? 'active' : '';
      const templateIcon = {
        'kinetic_text': '⚡',
        'dashboard_3d_float': '🌟',
        'interactive_cursor_click': '🖱️',
        'fact_card': '📊',
        'title_card': '🏷️',
        'lower_third': '💬',
        'transparent_callout': '✨'
      }[s.template] || '🎬';

      return `
        <div class="scene-block ${isActive}" data-index="${idx}">
          <div class="scene-block-title">${templateIcon} ${escapeHtml(s.headline || s.title || `Scene ${idx + 1}`)}</div>
          <div class="scene-block-meta">
            <span>Scene ${idx + 1}</span>
            <span>${(s.duration_seconds || 3).toFixed(1)}s</span>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.scene-block').forEach(el => {
      el.onclick = () => {
        activeSceneIndex = parseInt(el.dataset.index, 10);
        renderTimelineScenes();
        renderSceneInspector();
      };
    });
  }

  // Render Scene Property Inspector
  function renderSceneInspector() {
    const scenes = projectState?.scene_plan?.scenes || [];
    const s = scenes[activeSceneIndex];
    const badge = $('inspector-badge');
    const heading = $('inspector-heading');

    if (!s) {
      if (heading) heading.textContent = 'Scene Inspector';
      if (badge) badge.textContent = 'No Scene';
      return;
    }

    if (heading) heading.textContent = `Scene ${activeSceneIndex + 1}: ${s.template.replace(/_/g, ' ')}`;
    if (badge) badge.textContent = `Scene ${activeSceneIndex + 1} of ${scenes.length}`;

    if ($('scene-template-select')) $('scene-template-select').value = s.template || 'kinetic_text';
    if ($('scene-headline-input')) $('scene-headline-input').value = s.headline || '';
    if ($('scene-subtitle-input')) $('scene-subtitle-input').value = s.subtitle || '';
    if ($('scene-vo-en-input')) $('scene-vo-en-input').value = s.voiceover_script_en || '';
    if ($('scene-vo-hi-input')) $('scene-vo-hi-input').value = s.voiceover_script_hi || '';
    if ($('scene-duration-input')) $('scene-duration-input').value = s.duration_seconds || 3.0;
    if ($('scene-transition-select')) $('scene-transition-select').value = s.transition || 'cut';

    // Populate bound asset dropdown
    const assetSelect = $('scene-asset-select');
    if (assetSelect) {
      const assets = projectState?.assets || [];
      assetSelect.innerHTML = `<option value="">(None - Generative Motion Graphics)</option>` +
        assets.map(a => `<option value="${a.name}" ${s.assigned_asset === a.name ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('');
    }
  }

  // Render Asset Chips in Sidebar
  function renderAssetChips() {
    const container = $('asset-chips-list');
    const countTag = $('asset-count-tag');
    if (!container) return;

    const assets = projectState?.assets || [];
    if (countTag) countTag.textContent = `${assets.length} assets`;

    container.innerHTML = assets.map(a => `
      <span class="asset-chip" title="${escapeHtml(a.name)}">
        📎 ${escapeHtml(a.name.slice(0, 16))}
      </span>
    `).join('');
  }

  // Render Blueprint Summary Box
  function renderBlueprintSummary() {
    const bp = projectState?.blueprint;
    const rulesList = $('blueprint-rules-list');
    const statusBadge = $('blueprint-status-badge');

    if (statusBadge) {
      statusBadge.textContent = bp ? 'Approved' : 'Pending';
      statusBadge.className = bp ? 'badge-approved' : 'badge-fps-pill';
    }

    if (rulesList && bp && bp.rules) {
      rulesList.innerHTML = bp.rules.map(r => `<li>${escapeHtml(r)}</li>`).join('');
    }
  }

  function updateExportLinks() {
    const mp4Btn = $('btn-download-mp4');
    const zipBtn = $('btn-export-remotion-zip');
    if (mp4Btn && activeJobId) {
      mp4Btn.href = `/media/${activeJobId}/output.mp4`;
      mp4Btn.download = `motionclone-explainer-${activeJobId}.mp4`;
    }
    if (zipBtn && activeJobId) {
      zipBtn.href = `/api/jobs/${activeJobId}/remotion`;
      zipBtn.download = `motionclone-remotion-${activeJobId}.zip`;
    }
  }

  // =========================================================================
  // Chat Messaging Engine
  // =========================================================================
  function appendChatBubble(role, text, cardHtml = null) {
    const container = $('chat-messages-container');
    if (!container) return;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    bubble.innerHTML = `<div>${escapeHtml(text)}</div>` + (cardHtml || '');
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  async function handleSendChat(customMessage = null) {
    const input = $('chat-input');
    const text = customMessage || input?.value.trim();
    if (!text || isSendingChat) return;

    if (!customMessage && input) input.value = '';
    isSendingChat = true;

    appendChatBubble('user', text);
    chatHistory.push({ role: 'user', content: text });

    try {
      const res = await callApi('/api/dashboard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          job_id: activeJobId,
          history: chatHistory,
          aspect: activeAspect,
          language: activeLanguage
        })
      });

      let cardHtml = null;
      if (res.action === 'suggest_blueprint') {
        cardHtml = `
          <div class="chat-card">
            <div class="chat-card-title">📐 AI Deconstruction Blueprint Ready</div>
            <p style="font-size:11px; margin:0 0 6px; color:var(--muted);">Structure: Hook (3s) · Body (22s) · CTA (5s)</p>
            <button type="button" class="chat-card-btn" id="btn-approve-blueprint-chat">✓ Approve Blueprint & Generate Scene Plan</button>
          </div>
        `;
      } else if (res.action === 'suggest_scene_plan') {
        cardHtml = `
          <div class="chat-card">
            <div class="chat-card-title">🎬 6-Scene Remotion Plan Ready</div>
            <p style="font-size:11px; margin:0 0 6px; color:var(--muted);">Kinetic hooks, 3D screenshots, and bilingual audio scripts configured.</p>
            <button type="button" class="chat-card-btn" id="btn-render-preview-chat">⚡ Render 60 FPS Remotion Preview</button>
          </div>
        `;
      }

      appendChatBubble('agent', res.reply, cardHtml);
      chatHistory.push({ role: 'assistant', content: res.reply });

      // Wire chat card action buttons
      $('btn-approve-blueprint-chat')?.addEventListener('click', async () => {
        await handleGenerateScenePlan();
      });
      $('btn-render-preview-chat')?.addEventListener('click', async () => {
        await handleRenderPreview();
      });

    } catch (err) {
      appendChatBubble('agent', `⚠️ Error: ${err.message}`);
    } finally {
      isSendingChat = false;
    }
  }

  // =========================================================================
  // Core Business Actions (Reference -> Blueprint -> Scene Plan -> Render)
  // =========================================================================
  async function handleDeconstructReference() {
    if (!activeJobId) {
      alert('Please select or create an explainer project first.');
      return;
    }

    showOverlay('Deconstructing Reference…', 'Gemini is analyzing pacing, cuts, and motion rules');
    updatePipelineStep(2);

    try {
      const res = await callApi('/api/dashboard/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: activeJobId,
          aspect: activeAspect,
          notes: 'High energy startup explainer, punchy cuts, bold typography'
        })
      });

      projectState.blueprint = res.blueprint;
      hideOverlay();
      renderAllViews();

      appendChatBubble('agent', `✅ ${res.message}`, `
        <div class="chat-card">
          <div class="chat-card-title">📐 Blueprint Approved</div>
          <button type="button" class="chat-card-btn" id="btn-auto-plan">⚡ Proceed to Script & Scene Plan</button>
        </div>
      `);

      $('btn-auto-plan')?.addEventListener('click', async () => {
        await handleGenerateScenePlan();
      });

    } catch (e) {
      hideOverlay();
      alert('Blueprint generation error: ' + e.message);
    }
  }

  async function handleGenerateScenePlan() {
    if (!activeJobId) return;

    showOverlay('Generating Original Scene Plan…', 'Writing English & Hindi scripts and mapping Remotion templates');
    updatePipelineStep(3);

    try {
      const res = await callApi('/api/dashboard/scene-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: activeJobId,
          user_story: 'Next-Gen Autonomous AI Platform that saves teams 15 hours a week.',
          brand_name: projectState.name || 'MotionClone AI',
          brand_tagline: 'From reference video to editable motion.',
          language: activeLanguage,
          aspect: activeAspect,
          music_track_id: $('music-track-select')?.value || 'tech_upbeat'
        })
      });

      projectState.scene_plan = res.scene_plan;
      hideOverlay();
      renderAllViews();

      appendChatBubble('agent', `🎉 ${res.message}`, `
        <div class="chat-card">
          <div class="chat-card-title">✨ Scene Sequence Ready</div>
          <p style="font-size:11px; margin:0 0 6px; color:var(--muted);">${res.scene_plan.scenes.length} Remotion scenes with synchronized sound effects.</p>
          <button type="button" class="chat-card-btn" id="btn-auto-render">🎬 Render 60 FPS Video</button>
        </div>
      `);

      $('btn-auto-render')?.addEventListener('click', async () => {
        await handleRenderPreview();
      });

    } catch (e) {
      hideOverlay();
      alert('Scene plan error: ' + e.message);
    }
  }

  async function handleRenderPreview() {
    if (!activeJobId) return;

    showOverlay('Rendering 60 FPS Remotion Video…', 'Synthesizing motion graphics, captions, sound effects, and music');
    updatePipelineStep(4);

    try {
      const comp = activeAspect === '16:9' ? 'DashboardShowcase' : 'Motion';
      await callApi(`/api/jobs/${activeJobId}/render-remotion?format=mp4&composition=${comp}`, {
        method: 'POST'
      });

      const poll = setInterval(async () => {
        try {
          const j = await callApi(`/api/jobs/${activeJobId}`);
          if (j.status === 'complete') {
            clearInterval(poll);
            hideOverlay();
            updatePipelineStep(5);
            videoCacheKey = Date.now();
            projectState.preview_url = `/media/${activeJobId}/output.mp4`;
            renderVideoStage();
            appendChatBubble('agent', '🎬 Your 60 FPS Explainer Video is ready! Watch the preview in the center stage or download below.');
          } else if (j.status === 'error') {
            clearInterval(poll);
            hideOverlay();
            alert('Render failed: ' + (j.error || 'Check server logs'));
          }
        } catch {}
      }, 2500);

    } catch (e) {
      hideOverlay();
      alert('Render initiation error: ' + e.message);
    }
  }

  function showOverlay(title, desc) {
    const el = $('stage-render-overlay');
    if (el) {
      $('stage-overlay-title').textContent = title;
      $('stage-overlay-desc').textContent = desc;
      el.hidden = false;
    }
  }

  function hideOverlay() {
    const el = $('stage-render-overlay');
    if (el) el.hidden = true;
  }

  // =========================================================================
  // Event Bindings
  // =========================================================================
  function bindEvents() {
    // Top Project Selector
    $('dashboard-project-select')?.addEventListener('change', async (e) => {
      activeJobId = e.target.value;
      window.history.replaceState({}, '', `/dashboard?job=${activeJobId}`);
      await loadProject(activeJobId);
    });

    // New Project Button
    $('btn-new-explainer')?.addEventListener('click', async () => {
      const name = prompt('Enter a name for your new explainer video:', 'AI Product Demo');
      if (!name) return;

      const fd = new FormData();
      fd.append('name', name);
      fd.append('aspect', activeAspect);
      fd.append('language', activeLanguage);

      try {
        const created = await callApi('/api/dashboard/create-project', {
          method: 'POST',
          body: fd
        });
        await fetchJobs();
        await loadProject(created.job_id);
        appendChatBubble('agent', `🎉 Welcome to your new project "${name}"! Upload a reference video or paste a link to get started.`);
      } catch (err) {
        alert('Could not create project: ' + err.message);
      }
    });

    // Aspect Ratio Buttons
    document.querySelectorAll('.aspect-pill').forEach(btn => {
      btn.onclick = () => setAspectRatio(btn.dataset.aspect);
    });

    // Language Buttons
    document.querySelectorAll('.lang-pill').forEach(btn => {
      btn.onclick = () => setLanguage(btn.dataset.lang);
    });

    // Quick Suggestion Pills
    document.querySelectorAll('.pill-chip').forEach(btn => {
      btn.onclick = () => handleSendChat(btn.dataset.prompt);
    });

    // Chat Prompt Form
    $('chat-prompt-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSendChat();
    });

    // Quickstart Button in Empty State
    $('btn-quickstart-blueprint')?.addEventListener('click', () => {
      handleDeconstructReference();
    });

    // Viewport Mode Pills
    $('btn-view-rebuilt')?.addEventListener('click', () => {
      $('btn-view-rebuilt').classList.add('active');
      $('btn-view-source')?.classList.remove('active');
      $('btn-view-blueprint')?.classList.remove('active');
      const player = $('dashboard-video-player');
      if (player && activeJobId) {
        player.src = `/media/${activeJobId}/output.mp4?v=${videoCacheKey}`;
        player.load();
      }
    });

    $('btn-view-source')?.addEventListener('click', () => {
      $('btn-view-source').classList.add('active');
      $('btn-view-rebuilt')?.classList.remove('active');
      $('btn-view-blueprint')?.classList.remove('active');
      const player = $('dashboard-video-player');
      if (player && activeJobId) {
        player.src = `/media/${activeJobId}/source.mp4`;
        player.load();
      }
    });

    // Timeline Preview Render Button
    $('btn-preview-render')?.addEventListener('click', () => {
      handleRenderPreview();
    });

    $('btn-render-final-mp4')?.addEventListener('click', () => {
      handleRenderPreview();
    });

    // Save Scene Edits
    $('btn-save-scene-edits')?.addEventListener('click', async () => {
      const scenes = projectState?.scene_plan?.scenes;
      if (!scenes || !scenes[activeSceneIndex]) return;

      const s = scenes[activeSceneIndex];
      s.template = $('scene-template-select')?.value || s.template;
      s.headline = $('scene-headline-input')?.value || s.headline;
      s.subtitle = $('scene-subtitle-input')?.value || s.subtitle;
      s.voiceover_script_en = $('scene-vo-en-input')?.value || s.voiceover_script_en;
      s.voiceover_script_hi = $('scene-vo-hi-input')?.value || s.voiceover_script_hi;
      s.duration_seconds = parseFloat($('scene-duration-input')?.value) || s.duration_seconds;
      s.transition = $('scene-transition-select')?.value || s.transition;
      s.assigned_asset = $('scene-asset-select')?.value || '';

      try {
        await callApi(`/api/dashboard/project/${activeJobId}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(projectState)
        });
        renderTimelineScenes();
        alert('✓ Scene edits saved to project!');
      } catch (e) {
        alert('Save error: ' + e.message);
      }
    });

    // User Asset Upload Dropzone
    const assetDropzone = $('user-asset-dropzone');
    const assetInput = $('user-asset-input');
    if (assetDropzone && assetInput) {
      assetDropzone.onclick = () => assetInput.click();
      assetInput.onchange = async () => {
        if (!assetInput.files?.length || !activeJobId) return;
        for (const file of assetInput.files) {
          const fd = new FormData();
          fd.append('file', file);
          try {
            await callApi(`/api/jobs/${activeJobId}/upload-asset`, {
              method: 'POST',
              body: fd
            });
          } catch (e) {
            console.warn('Upload error:', e);
          }
        }
        await loadProject(activeJobId);
      };
    }

    // Custom Music Upload
    const btnMusic = $('btn-upload-music');
    const musicInput = $('custom-music-input');
    if (btnMusic && musicInput) {
      btnMusic.onclick = () => musicInput.click();
      musicInput.onchange = async () => {
        if (!musicInput.files?.length || !activeJobId) return;
        const fd = new FormData();
        fd.append('file', musicInput.files[0]);
        try {
          const res = await callApi(`/api/dashboard/upload-custom-music/${activeJobId}`, {
            method: 'POST',
            body: fd
          });
          const lbl = $('custom-music-label');
          if (lbl) lbl.textContent = res.name;
          alert(`✓ Uploaded custom music track "${res.filename}"!`);
        } catch (e) {
          alert('Music upload error: ' + e.message);
        }
      };
    }
  }

  // =========================================================================
  // App Bootstrapper
  // =========================================================================
  window.addEventListener('DOMContentLoaded', async () => {
    await checkEngineStatus();
    await loadMusicLibrary();
    await fetchJobs();
    bindEvents();

    if (activeJobId) {
      await loadProject(activeJobId);
    }

    // Greeting Message
    appendChatBubble('agent', '👋 Welcome to MotionClone: Reference-to-Video Explainer Studio! I am your AI Creative Director. Upload a reference video and tell me about your product to build an original 30-second 60 FPS motion graphics explainer.');
  });
})();

