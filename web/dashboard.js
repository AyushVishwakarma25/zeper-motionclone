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

  function showToast(message, type = 'info') {
    const container = $('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    const icon = type === 'success' ? '✓ ' : (type === 'error' ? '⚠️ ' : 'ℹ️ ');
    toast.textContent = `${icon}${message}`;
    toast.onclick = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    };
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, 3800);
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
      const s = await callApi('/api/connection');
      const dot = $('ai-status-dot');
      const txt = $('ai-status-text');
      const badge = $('ai-status-badge');
      if (dot && txt) {
        if (s.status === 'connected' || s.ok) {
          dot.className = 'status-dot connected';
          txt.textContent = 'Google Gemini 3.8 / 3.1 Ready';
          badge.className = 'status-badge';
          badge.title = 'Vertex AI Active: gemini-3.8-flash & gemini-3.1-pro-preview';
        } else {
          dot.className = 'status-dot';
          txt.textContent = 'Configure Gemini Key';
          badge.className = 'status-badge warning';
          badge.title = 'Click to connect Google Gemini or Vertex AI';
          badge.onclick = () => window.open('/?workspace=1&settings=1', '_blank');
        }
      }
    } catch {
      try {
        const s = await callApi('/api/status');
        const dot = $('ai-status-dot');
        const txt = $('ai-status-text');
        if (dot && txt) {
          dot.className = s.gemini ? 'status-dot connected' : 'status-dot';
          txt.textContent = s.gemini ? 'Google Gemini 3.8 / 3.1 Ready' : 'Gemini Key Needed';
        }
      } catch {}
    }
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
    if (projectState) {
      projectState.aspect = ratio;
      projectState.aspectRatio = ratio;
      if (ratio === '9:16') {
        projectState.width = 1080;
        projectState.height = 1920;
      } else if (ratio === '16:9') {
        projectState.width = 1920;
        projectState.height = 1080;
      } else {
        projectState.width = 1080;
        projectState.height = 1080;
      }
    }
    const stageContainer = $('stage-viewport-container');
    if (stageContainer) {
      stageContainer.className = `stage-player-wrap aspect-${ratio.replace(':', '-')}`;
    }
    const badge = $('badge-active-ratio');
    if (badge) {
      badge.textContent = ratio === '9:16' ? '9:16 Reel' : (ratio === '16:9' ? '16:9 Landscape' : '1:1 Square');
    }
    document.querySelectorAll('.aspect-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.aspect === ratio);
    });
  }

  // Language Switcher
  function setLanguage(lang) {
    activeLanguage = lang;
    if (projectState) {
      projectState.language = lang;
    }
    document.querySelectorAll('.lang-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    
    // Visually highlight active script textarea in inspector
    const voEn = $('scene-vo-en-input');
    const voHi = $('scene-vo-hi-input');
    if (voEn && voHi) {
      if (lang === 'hi') {
        voEn.classList.remove('script-textarea-highlight');
        voHi.classList.add('script-textarea-highlight');
      } else if (lang === 'en_hi' || lang === 'bilingual') {
        voEn.classList.add('script-textarea-highlight');
        voHi.classList.add('script-textarea-highlight');
      } else {
        voEn.classList.add('script-textarea-highlight');
        voHi.classList.remove('script-textarea-highlight');
      }
    }
    
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
    const btnDeconstruct = $('btn-deconstruct-persistent');

    const hasVideo = Boolean(
      projectState && (
        projectState.preview_url ||
        projectState.source_url ||
        projectState.referenceVideoUrl ||
        projectState.has_reference
      )
    );

    if (emptyState) {
      emptyState.style.display = hasVideo ? 'none' : 'flex';
    }

    if (btnDeconstruct) {
      btnDeconstruct.style.display = (hasVideo && $('btn-view-source')?.classList.contains('active')) ? 'inline-flex' : 'none';
    }

    if (player && projectState) {
      const isReferenceActive = $('btn-view-source')?.classList.contains('active') || $('btn-view-blueprint')?.classList.contains('active');
      const src = (!isReferenceActive && projectState.preview_url)
        ? `${projectState.preview_url}?v=${videoCacheKey}`
        : (projectState.source_url || (projectState.has_reference ? `/media/${activeJobId}/source.mp4` : null));

      if (src) {
        player.style.display = 'block';
        if (!player.src || !player.src.endsWith(src)) {
          player.src = src;
          player.load();
        }
      } else {
        player.style.display = 'none';
      }

      // Update duration badge dynamically when metadata loads
      player.onloadedmetadata = () => {
        if (player.duration && badgeDur) {
          badgeDur.textContent = `${player.duration.toFixed(1)}s`;
        }
      };
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
      const bpShots = projectState?.blueprint?.shots || [];
      if (bpShots.length > 0) {
        container.innerHTML = bpShots.map((shot, idx) => {
          const isActive = idx === activeSceneIndex ? 'active' : '';
          return `
            <div class="scene-block ${isActive}" data-index="${idx}">
              <div class="scene-block-title">📐 ${escapeHtml(shot.shot_type || `Shot ${idx + 1}`)}</div>
              <div class="scene-block-meta">
                <span>Shot ${idx + 1}</span>
                <span>${((shot.t_end - shot.t_start) || 3).toFixed(1)}s</span>
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
        return;
      }

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
    const emptyHint = $('inspector-empty-state');

    if (!s) {
      if (heading) heading.textContent = 'Scene Inspector';
      if (badge) badge.textContent = 'No Scene';
      if (emptyHint) emptyHint.style.display = 'block';

      // Check if blueprint shots can be inspected instead
      const bp = projectState?.blueprint;
      if (bp && bp.shots && bp.shots[activeSceneIndex]) {
        const shot = bp.shots[activeSceneIndex];
        if (emptyHint) emptyHint.style.display = 'none';
        if (heading) heading.textContent = `Shot ${activeSceneIndex + 1}: ${shot.shot_type || 'Shot'}`;
        if (badge) badge.textContent = `Shot ${activeSceneIndex + 1} of ${bp.shots.length}`;
        if ($('scene-template-select')) $('scene-template-select').value = 'kinetic_text';
        if ($('scene-headline-input')) $('scene-headline-input').value = shot.visual_purpose || '';
        if ($('scene-subtitle-input')) $('scene-subtitle-input').value = `Camera: ${shot.camera_motion || 'push-in'}`;
        if ($('scene-duration-input')) $('scene-duration-input').value = ((shot.t_end - shot.t_start) || 3.0).toFixed(1);
        if ($('scene-transition-select')) $('scene-transition-select').value = shot.transition || 'cut';
      }

      // Populate bound asset dropdown
      const assetSelect = $('scene-asset-select');
      if (assetSelect) {
        const assets = projectState?.assets || [];
        assetSelect.innerHTML = `<option value="">(None - Generative Motion Graphics)</option>` +
          assets.map(a => `<option value="${a.name}">${escapeHtml(a.name)}</option>`).join('');
      }
      return;
    }

    if (emptyHint) emptyHint.style.display = 'none';
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
    const refCard = $('active-reference-card');
    const refFilename = $('active-ref-filename');

    const assets = projectState?.assets || [];
    if (countTag) countTag.textContent = `${assets.length}`;

    // Update active reference card
    if (refCard && refFilename) {
      if (projectState?.has_reference || projectState?.source_url) {
        refCard.style.display = 'flex';
        refFilename.textContent = projectState.reference_filename || projectState.reference_url || 'source.mp4';
      } else {
        refCard.style.display = 'none';
      }
    }

    if (!container) return;

    if (assets.length === 0) {
      container.innerHTML = `<span style="font-size:11px; color:var(--muted);">No uploaded screenshots or logos yet.</span>`;
      return;
    }

    container.innerHTML = assets.map(a => `
      <span class="asset-chip" title="${escapeHtml(a.name)}">
        📎 ${escapeHtml(a.name.slice(0, 16))}
      </span>
    `).join('');
  }

  // Render Blueprint Summary Box & Center Blueprint Deck
  function renderBlueprintSummary() {
    const bp = projectState?.blueprint;
    const rulesList = $('blueprint-rules-list');
    const statusBadge = $('blueprint-status-badge');
    const deck = $('stage-blueprint-view');
    const grid = $('blueprint-cards-grid');

    if (statusBadge) {
      statusBadge.textContent = bp ? 'Approved' : 'Pending';
      statusBadge.className = bp ? 'badge-rules-status' : 'status-pill-draft';
    }

    if (rulesList && bp && bp.rules) {
      rulesList.innerHTML = bp.rules.map(r => `<li>${escapeHtml(r)}</li>`).join('');
    }

    // Populate Center Stage Blueprint Deck Cards
    if (grid && bp && bp.shots) {
      grid.innerHTML = bp.shots.map((shot, idx) => `
        <div class="blueprint-shot-card ${idx === activeSceneIndex ? 'active' : ''}" data-index="${idx}">
          <div class="shot-card-title">Shot ${idx + 1}: ${escapeHtml(shot.shot_type)}</div>
          <p style="font-size:11px; margin:2px 0 6px; color:var(--ink-secondary); line-height:1.4;">${escapeHtml(shot.visual_purpose || '')}</p>
          <div class="shot-card-meta">
            <span>⏱️ ${((shot.t_end - shot.t_start) || 3).toFixed(1)}s</span>
            <span>🎬 ${escapeHtml(shot.camera_motion || 'push-in')}</span>
          </div>
        </div>
      `).join('');

      grid.querySelectorAll('.blueprint-shot-card').forEach(card => {
        card.onclick = () => {
          activeSceneIndex = parseInt(card.dataset.index, 10);
          renderBlueprintSummary();
          renderSceneInspector();
        };
      });
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

    showOverlay('Deconstructing Reference…', 'Gemini 3.8 Flash is analyzing pacing, cuts, and motion rules');
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
      updatePipelineStep(2);
      showToast('📐 Blueprint extracted successfully!', 'success');

      $('btn-view-blueprint')?.classList.add('active');
      $('btn-view-rebuilt')?.classList.remove('active');
      $('btn-view-source')?.classList.remove('active');
      $('btn-view-merger')?.classList.remove('active');
      const deck = $('stage-blueprint-view');
      const player = $('dashboard-video-player');
      const merger = $('stage-merger-view');
      const insights = $('stage-reference-insights');
      if (merger) merger.style.display = 'none';
      if (insights) insights.style.display = 'none';
      if (deck) deck.style.display = 'flex';
      const label = $('monitor-video-label');
      if (label) label.textContent = '📹 Reference Monitor';
      if (player && activeJobId) {
        player.style.display = 'block';
        player.src = `/media/${activeJobId}/source.mp4`;
        player.load();
      }

      activeSceneIndex = 0;
      renderAllViews();

      appendChatBubble('agent', `✅ ${res.message}`, `
        <div class="chat-card">
          <div class="chat-card-title">📝 Step 2: Target Topic & Creative Brief</div>
          <p style="font-size:11px; margin:0 0 6px; color:var(--muted);">Blueprint ready! Enter your topic in the brief input below (e.g. malaria symptoms, product demo) or proceed with defaults.</p>
          <button type="button" class="chat-card-btn" id="btn-auto-plan">⚡ Proceed to Script & Scene Plan</button>
        </div>
      `);

      $('btn-auto-plan')?.addEventListener('click', async () => {
        await handleGenerateScenePlan();
      });

      $('topic-brief-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (e) {
      hideOverlay();
      showToast('Notice: ' + e.message, 'error');
      appendChatBubble('agent', `⚠️ Notice: ${e.message}`);
    }
  }

  async function handleGenerateScenePlan() {
    if (!activeJobId) return;

    const topicInput = $('topic-brief-input')?.value.trim();
    const brandInput = $('brand-name-input')?.value.trim();
    const userStory = topicInput || 'Next-Gen Autonomous AI Platform that saves teams 15 hours a week.';
    const brandName = brandInput || projectState?.name || 'MotionClone AI';

    showOverlay('Generating Original Scene Plan…', `Writing ${activeLanguage.toUpperCase()} script and mapping Remotion templates`);
    updatePipelineStep(3);

    try {
      const res = await callApi('/api/dashboard/scene-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: activeJobId,
          user_story: userStory,
          brand_name: brandName,
          brand_tagline: 'From reference video to editable motion.',
          language: activeLanguage,
          aspect: activeAspect,
          music_track_id: $('music-track-select')?.value || 'tech_upbeat'
        })
      });

      projectState.scene_plan = res.scene_plan;
      hideOverlay();
      showToast('✨ Scene plan & voiceover ready!', 'success');
      renderAllViews();

      appendChatBubble('agent', `🎉 ${res.message}`, `
        <div class="chat-card">
          <div class="chat-card-title">🎬 Step 3: Render 60 FPS Video</div>
          <p style="font-size:11px; margin:0 0 6px; color:var(--muted);">${res.scene_plan.scenes.length} Remotion scenes with synchronized sound effects and voiceover.</p>
          <button type="button" class="chat-card-btn" id="btn-auto-render">🚀 Render 60 FPS Video Now</button>
        </div>
      `);

      $('btn-auto-render')?.addEventListener('click', async () => {
        await handleRenderPreview();
      });

    } catch (e) {
      hideOverlay();
      showToast('Scene plan error: ' + e.message, 'error');
      alert('Scene plan error: ' + e.message);
    }
  }

  async function handleRenderPreview() {
    if (!activeJobId) return;

    showOverlay('Rendering 60 FPS Remotion Video…', 'Synthesizing motion graphics, captions, sound effects, and music');
    updatePipelineStep(4);
    showToast('🎬 Rendering 60 FPS video...', 'info');

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
            
            // Switch to Preview tab
            $('btn-view-rebuilt')?.click();
            showToast('🎉 Explainer Video Rendered Successfully!', 'success');
            renderVideoStage();
            appendChatBubble('agent', '🎬 Your 60 FPS Explainer Video is ready! Watch the preview in the center stage or download below.');
          } else if (j.status === 'error') {
            clearInterval(poll);
            hideOverlay();
            showToast('Render error: ' + (j.error || 'Check server logs'), 'error');
            alert('Render failed: ' + (j.error || 'Check server logs'));
          }
        } catch {}
      }, 2500);

    } catch (e) {
      hideOverlay();
      showToast('Render initiation error: ' + e.message, 'error');
      alert('Render initiation error: ' + e.message);
    }
  }

  async function handlePasteAndRender() {
    if (!activeJobId) {
      alert('Please select or create an explainer project first.');
      return;
    }

    const jsxCode = $('merger-jsx-input')?.value.trim();
    const voiceoverScript = $('merger-voiceover-input')?.value.trim();

    if (!jsxCode && !voiceoverScript) {
      showToast('Please paste Remotion JSX code or a voiceover script.', 'error');
      alert('Please paste Remotion JSX code or a voiceover script into the editors.');
      return;
    }

    showOverlay('Merging Code & Rendering 60 FPS MP4…', 'Transpiling Remotion JSX, generating voiceover audio, and compiling video');
    updatePipelineStep(4);

    try {
      const res = await callApi('/api/dashboard/paste-and-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: activeJobId,
          jsx_code: jsxCode,
          voiceover_script: voiceoverScript,
          aspect: activeAspect
        })
      });

      showToast('🚀 Code merged! Compiling 60 FPS video...', 'info');

      // Poll job status until complete or error
      const poll = setInterval(async () => {
        try {
          const j = await callApi(`/api/jobs/${activeJobId}`);
          if (j.status === 'complete') {
            clearInterval(poll);
            hideOverlay();
            updatePipelineStep(5);
            videoCacheKey = Date.now();
            projectState.preview_url = `/media/${activeJobId}/output.mp4`;
            
            // Switch to Preview tab to watch rendered MP4
            $('btn-view-rebuilt')?.click();
            showToast('🎉 60 FPS Explainer Video Rendered Successfully!', 'success');
            appendChatBubble('agent', '🎉 Your custom JSX + voiceover was compiled and rendered into a 60 FPS MP4 video! Watch the preview above or download the file.');
          } else if (j.status === 'error') {
            clearInterval(poll);
            hideOverlay();
            showToast('Render error: ' + (j.error || 'Check server logs'), 'error');
            alert('Render failed: ' + (j.error || 'Check server logs'));
          }
        } catch {}
      }, 2500);

    } catch (e) {
      hideOverlay();
      showToast('Merge & Render failed: ' + e.message, 'error');
      alert('Merge & Render error: ' + e.message);
    }
  }

  function showOverlay(title, desc) {
    const el = $('stage-render-overlay');
    if (el) {
      const t = $('stage-overlay-title');
      const d = $('stage-overlay-desc');
      if (t) t.textContent = title;
      if (d) d.textContent = desc;
      el.hidden = false;
      el.style.display = 'flex';
    }
  }

  function hideOverlay() {
    const el = $('stage-render-overlay');
    if (el) {
      el.hidden = true;
      el.style.display = 'none';
    }
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
    $('quick-pill-deconstruct')?.addEventListener('click', () => {
      handleDeconstructReference();
    });
    $('quick-pill-script')?.addEventListener('click', () => {
      handleGenerateScenePlan();
    });
    $('quick-pill-pacing')?.addEventListener('click', () => {
      handleSendChat('Analyze the reference video pacing and align scene durations to match music rhythm.');
    });
    document.querySelectorAll('.pill-chip').forEach(btn => {
      if (!btn.id) {
        btn.onclick = () => handleSendChat(btn.dataset.prompt);
      }
    });

    // Chat Prompt Form
    $('chat-prompt-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSendChat();
    });

    // Pipeline Step Breadcrumb Click Navigation
    $('step-node-1')?.addEventListener('click', () => {
      $('btn-view-source')?.click();
    });
    $('step-node-2')?.addEventListener('click', () => {
      $('btn-view-blueprint')?.click();
    });
    $('step-node-3')?.addEventListener('click', () => {
      $('btn-view-blueprint')?.click();
    });
    $('step-node-4')?.addEventListener('click', () => {
      $('btn-view-rebuilt')?.click();
    });
    $('step-node-5')?.addEventListener('click', () => {
      $('btn-view-rebuilt')?.click();
    });

    // Quickstart Button in Empty State
    $('btn-quickstart-blueprint')?.addEventListener('click', () => {
      handleDeconstructReference();
    });

    // Left Sidebar Navigation Tabs
    $('tab-btn-chat')?.addEventListener('click', () => {
      $('tab-btn-chat').classList.add('active');
      $('tab-btn-assets')?.classList.remove('active');
      const pChat = $('panel-ai-director');
      const pAssets = $('panel-assets');
      if (pChat) pChat.style.display = 'flex';
      if (pAssets) pAssets.style.display = 'none';
    });

    $('tab-btn-assets')?.addEventListener('click', () => {
      $('tab-btn-assets').classList.add('active');
      $('tab-btn-chat')?.classList.remove('active');
      const pChat = $('panel-ai-director');
      const pAssets = $('panel-assets');
      if (pChat) pChat.style.display = 'none';
      if (pAssets) pAssets.style.display = 'flex';
    });

    // Sidebar Collapsible Toggles
    $('btn-collapse-left')?.addEventListener('click', () => {
      $('sidebar-left')?.classList.add('collapsed');
      const btnExp = $('btn-expand-left');
      if (btnExp) btnExp.style.display = 'flex';
    });

    $('btn-expand-left')?.addEventListener('click', () => {
      $('sidebar-left')?.classList.remove('collapsed');
      const btnExp = $('btn-expand-left');
      if (btnExp) btnExp.style.display = 'none';
    });

    $('btn-collapse-right')?.addEventListener('click', () => {
      $('sidebar-right')?.classList.add('collapsed');
      const btnExp = $('btn-expand-right');
      if (btnExp) btnExp.style.display = 'flex';
    });

    $('btn-expand-right')?.addEventListener('click', () => {
      $('sidebar-right')?.classList.remove('collapsed');
      const btnExp = $('btn-expand-right');
      if (btnExp) btnExp.style.display = 'none';
    });

    $('btn-replace-ref')?.addEventListener('click', () => {
      $('ref-file-input')?.click();
    });

    $('btn-deconstruct-insights')?.addEventListener('click', () => {
      handleDeconstructReference();
    });

    // Viewport Mode Pills (30% Video Monitor + 70% Workspace Split)
    $('btn-view-rebuilt')?.addEventListener('click', () => {
      $('btn-view-rebuilt').classList.add('active');
      $('btn-view-source')?.classList.remove('active');
      $('btn-view-blueprint')?.classList.remove('active');
      $('btn-view-merger')?.classList.remove('active');
      const deck = $('stage-blueprint-view');
      const merger = $('stage-merger-view');
      const insights = $('stage-reference-insights');
      if (deck) deck.style.display = 'none';
      if (merger) merger.style.display = 'none';
      if (insights) insights.style.display = 'flex';
      const player = $('dashboard-video-player');
      const label = $('monitor-video-label');
      if (label) label.textContent = '🎬 60 FPS Preview';
      if (player && activeJobId) {
        player.style.display = 'block';
        player.src = `/media/${activeJobId}/output.mp4?v=${videoCacheKey}`;
        player.load();
      }
      const tl = $('timeline-section');
      if (tl) tl.style.display = 'flex';
      const btnDec = $('btn-deconstruct-persistent');
      if (btnDec) btnDec.style.display = 'none';
    });

    $('btn-view-source')?.addEventListener('click', () => {
      $('btn-view-source').classList.add('active');
      $('btn-view-rebuilt')?.classList.remove('active');
      $('btn-view-blueprint')?.classList.remove('active');
      $('btn-view-merger')?.classList.remove('active');
      const deck = $('stage-blueprint-view');
      const merger = $('stage-merger-view');
      const insights = $('stage-reference-insights');
      if (deck) deck.style.display = 'none';
      if (merger) merger.style.display = 'none';
      if (insights) insights.style.display = 'flex';
      const player = $('dashboard-video-player');
      const label = $('monitor-video-label');
      if (label) label.textContent = '📹 Reference Video';
      if (player && activeJobId) {
        player.style.display = 'block';
        player.src = `/media/${activeJobId}/source.mp4`;
        player.load();
      }
      const tl = $('timeline-section');
      if (tl) tl.style.display = 'flex';
      const btnDec = $('btn-deconstruct-persistent');
      const hasVideo = Boolean(projectState && (projectState.source_url || projectState.referenceVideoUrl || projectState.has_reference));
      if (btnDec) btnDec.style.display = hasVideo ? 'inline-flex' : 'none';
    });

    $('btn-view-blueprint')?.addEventListener('click', () => {
      $('btn-view-blueprint').classList.add('active');
      $('btn-view-source')?.classList.remove('active');
      $('btn-view-rebuilt')?.classList.remove('active');
      $('btn-view-merger')?.classList.remove('active');
      const player = $('dashboard-video-player');
      const emptyState = $('stage-empty-state');
      const deck = $('stage-blueprint-view');
      const merger = $('stage-merger-view');
      const insights = $('stage-reference-insights');
      if (merger) merger.style.display = 'none';
      if (insights) insights.style.display = 'none';
      if (deck) deck.style.display = 'flex';
      const label = $('monitor-video-label');
      if (label) label.textContent = '📹 Reference Monitor';
      if (player && activeJobId) {
        player.style.display = 'block';
        if (!player.src || !player.src.includes('source.mp4')) {
          player.src = `/media/${activeJobId}/source.mp4`;
          player.load();
        }
      }
      const tl = $('timeline-section');
      if (tl) tl.style.display = 'flex';
      const btnDec = $('btn-deconstruct-persistent');
      if (btnDec) btnDec.style.display = 'none';
      renderBlueprintSummary();
    });

    $('btn-view-merger')?.addEventListener('click', () => {
      $('btn-view-merger').classList.add('active');
      $('btn-view-source')?.classList.remove('active');
      $('btn-view-rebuilt')?.classList.remove('active');
      $('btn-view-blueprint')?.classList.remove('active');
      const player = $('dashboard-video-player');
      const deck = $('stage-blueprint-view');
      const merger = $('stage-merger-view');
      const insights = $('stage-reference-insights');
      if (deck) deck.style.display = 'none';
      if (insights) insights.style.display = 'none';
      if (merger) merger.style.display = 'flex';
      const label = $('monitor-video-label');
      if (label) label.textContent = '⚡ Code & Render Studio';
      const tl = $('timeline-section');
      if (tl) tl.style.display = 'none';
      const btnDec = $('btn-deconstruct-persistent');
      if (btnDec) btnDec.style.display = 'none';

      // Pre-fill sample Remotion JSX if empty
      const mergerJsx = $('merger-jsx-input');
      if (mergerJsx && !mergerJsx.value.trim()) {
        mergerJsx.value = `import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const ExplainerScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProgress = spring({ frame, fps, config: { damping: 14 } });
  const scale = interpolate(titleProgress, [0, 1], [0.85, 1]);
  const opacity = interpolate(titleProgress, [0, 1], [0, 1]);

  return (
    <AbsoluteFill style={{
      backgroundColor: '#0a0a0f',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{ transform: \`scale(\${scale})\`, opacity, textAlign: 'center', padding: '0 40px' }}>
        <h1 style={{
          fontSize: 64,
          fontWeight: 800,
          background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          margin: '0 0 16px 0'
        }}>
          Autonomous AI Platform
        </h1>
        <p style={{ fontSize: 26, color: '#94a3b8', margin: 0 }}>
          From Reference Video to 60 FPS Remotion Motion Graphics
        </p>
      </div>
    </AbsoluteFill>
  );
};
`;
      }
    });

    // Persistent Bar & Direct Plan & Merger Render Buttons
    $('btn-deconstruct-persistent')?.addEventListener('click', () => {
      handleDeconstructReference();
    });

    $('btn-generate-plan-direct')?.addEventListener('click', () => {
      handleGenerateScenePlan();
    });

    $('btn-merger-render')?.addEventListener('click', () => {
      handlePasteAndRender();
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
        await callApi(`/api/dashboard/scenes/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: activeJobId,
            scene_index: activeSceneIndex,
            scene: s
          })
        });
        renderTimelineScenes();
        alert('✓ Scene edits saved to project!');
      } catch (e) {
        try {
          await callApi(`/api/dashboard/project/${activeJobId}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(projectState)
          });
          renderTimelineScenes();
          alert('✓ Scene edits saved to project!');
        } catch (err) {
          alert('Save error: ' + err.message);
        }
      }
    });

    // Reference Video Upload or URL Import
    const refFileInput = $('ref-file-input');
    const refUrlInput = $('ref-url-input');
    const btnBrowseRef = $('btn-browse-ref');
    const btnUploadMp4Direct = $('btn-upload-mp4-direct');

    if (btnUploadMp4Direct && refFileInput) {
      btnUploadMp4Direct.onclick = () => refFileInput.click();
    }

    if (btnBrowseRef && refFileInput) {
      btnBrowseRef.onclick = async () => {
        const urlVal = refUrlInput ? refUrlInput.value.trim() : '';
        if (urlVal) {
          // Import from URL
          if (!activeJobId) {
            try {
              const fd = new FormData();
              fd.append('name', 'Explainer Reference');
              fd.append('aspect', activeAspect);
              fd.append('language', activeLanguage);
              fd.append('reference_url', urlVal);
              showOverlay('Importing Video from Link…', 'Downloading video via yt-dlp / FFmpeg');
              const created = await callApi('/api/dashboard/create-project', { method: 'POST', body: fd });
              await fetchJobs();
              await loadProject(created.job_id);
              hideOverlay();
              showToast('🎬 Reference video imported from link!', 'success');
              appendChatBubble('agent', `✓ Reference video successfully imported! Ready for Step 1.`, `
                <div class="chat-card">
                  <div class="chat-card-title">⚡ Step 1: Deconstruct Video Blueprint</div>
                  <p style="font-size:11px; margin:0 0 6px; color:var(--muted);">Gemini 3.8 Flash will deconstruct the pacing, cuts, and visual hierarchy.</p>
                  <button type="button" class="chat-card-btn" id="btn-card-step1-url">⚡ Deconstruct Reference Video</button>
                </div>
              `);
              $('btn-card-step1-url')?.addEventListener('click', () => handleDeconstructReference());
            } catch (err) {
              hideOverlay();
              showToast('Import failed: ' + err.message, 'error');
              appendChatBubble('agent', `⚠️ Import failed: ${err.message}`);
              alert(err.message);
            }
          } else {
            // Attach URL to active project
            try {
              showOverlay('Importing Video from Link…', 'Downloading video stream');
              const fd = new FormData();
              fd.append('url', urlVal);
              await callApi(`/api/dashboard/project/${activeJobId}/reference`, { method: 'POST', body: fd });
              await loadProject(activeJobId);
              hideOverlay();
              showToast('🎬 Reference video attached to project!', 'success');
              appendChatBubble('agent', `✓ Reference video downloaded and loaded into player! Ready for Step 1.`, `
                <div class="chat-card">
                  <div class="chat-card-title">⚡ Step 1: Deconstruct Video Blueprint</div>
                  <p style="font-size:11px; margin:0 0 6px; color:var(--muted);">Gemini 3.8 Flash will deconstruct the pacing, cuts, and visual hierarchy.</p>
                  <button type="button" class="chat-card-btn" id="btn-card-step1-attach">⚡ Deconstruct Reference Video</button>
                </div>
              `);
              $('btn-card-step1-attach')?.addEventListener('click', () => handleDeconstructReference());
            } catch (err) {
              hideOverlay();
              showToast('Import failed: ' + err.message, 'error');
              appendChatBubble('agent', `⚠️ Import failed: ${err.message}`);
              alert(err.message);
            }
          }
        } else {
          // Open file browser for local video upload
          refFileInput.click();
        }
      };

      refFileInput.onchange = async () => {
        if (!refFileInput.files?.length) return;
        const file = refFileInput.files[0];
        
        if (!activeJobId) {
          try {
            showOverlay('Uploading Reference Video…', 'Storing video and extracting visual frames');
            const fd = new FormData();
            fd.append('name', file.name.replace(/\.[^/.]+$/, ''));
            fd.append('aspect', activeAspect);
            fd.append('language', activeLanguage);
            fd.append('reference_file', file);
            const created = await callApi('/api/dashboard/create-project', { method: 'POST', body: fd });
            await fetchJobs();
            await loadProject(created.job_id);
            hideOverlay();
            showToast('🎬 Reference video uploaded successfully!', 'success');
            appendChatBubble('agent', `✓ Reference video "${file.name}" uploaded! Ready for Step 1.`, `
              <div class="chat-card">
                <div class="chat-card-title">⚡ Step 1: Deconstruct Video Blueprint</div>
                <p style="font-size:11px; margin:0 0 6px; color:var(--muted);">Analyze pacing, kinetic motion, and scene transitions.</p>
                <button type="button" class="chat-card-btn" id="btn-card-step1-file">⚡ Deconstruct Reference Video</button>
              </div>
            `);
            $('btn-card-step1-file')?.addEventListener('click', () => handleDeconstructReference());
          } catch (err) {
            hideOverlay();
            showToast('Upload failed: ' + err.message, 'error');
            alert('Upload failed: ' + err.message);
          }
        } else {
          try {
            showOverlay('Uploading Reference Video…', 'Storing video and extracting visual frames');
            const fd = new FormData();
            fd.append('video', file);
            await callApi(`/api/dashboard/project/${activeJobId}/reference`, { method: 'POST', body: fd });
            await loadProject(activeJobId);
            hideOverlay();
            showToast('🎬 Reference video uploaded to player!', 'success');
            appendChatBubble('agent', `✓ Reference video "${file.name}" loaded into player! Ready for Step 1.`, `
              <div class="chat-card">
                <div class="chat-card-title">⚡ Step 1: Deconstruct Video Blueprint</div>
                <p style="font-size:11px; margin:0 0 6px; color:var(--muted);">Analyze pacing, kinetic motion, and scene transitions.</p>
                <button type="button" class="chat-card-btn" id="btn-card-step1-active">⚡ Deconstruct Reference Video</button>
              </div>
            `);
            $('btn-card-step1-active')?.addEventListener('click', () => handleDeconstructReference());
          } catch (err) {
            hideOverlay();
            showToast('Upload failed: ' + err.message, 'error');
            alert('Upload failed: ' + err.message);
          }
        }
      };
    }

    // Enter key inside URL input triggers Import
    refUrlInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        btnBrowseRef?.click();
      }
    });

    // User Asset Upload Dropzone
    const assetDropzone = $('user-asset-dropzone');
    const assetInput = $('user-asset-input');
    if (assetDropzone && assetInput) {
      assetDropzone.onclick = () => assetInput.click();
      assetInput.onchange = async () => {
        if (!assetInput.files?.length || !activeJobId) return;
        let detectedVideo = false;
        showOverlay('Uploading Assets…', 'Processing files and screenshots');
        for (const file of assetInput.files) {
          const fd = new FormData();
          fd.append('file', file);
          try {
            const res = await callApi(`/api/jobs/${activeJobId}/upload-asset`, {
              method: 'POST',
              body: fd
            });
            if (res.is_video || file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name) || /video/i.test(file.name)) {
              detectedVideo = true;
            }
          } catch (e) {
            console.warn('Upload error:', e);
          }
        }
        hideOverlay();
        await loadProject(activeJobId);
        if (detectedVideo) {
          showToast('🎬 Video uploaded to project!', 'success');
          appendChatBubble('agent', '🎬 Video uploaded to project! Video player is ready. Ready for Step 1.', `
            <div class="chat-card">
              <div class="chat-card-title">⚡ Step 1: Deconstruct Video Blueprint</div>
              <p style="font-size:11px; margin:0 0 6px; color:var(--muted);">Analyze reference scene pacing, typography, and motion rules.</p>
              <button type="button" class="chat-card-btn" id="btn-card-step1-asset">⚡ Deconstruct Reference Video</button>
            </div>
          `);
          $('btn-card-step1-asset')?.addEventListener('click', () => handleDeconstructReference());
        } else {
          showToast('📁 Assets uploaded successfully!', 'success');
        }
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
    hideOverlay();
    await checkEngineStatus();
    await loadMusicLibrary();
    await fetchJobs();
    bindEvents();

    if (activeJobId) {
      await loadProject(activeJobId);
    } else {
      try {
        const fd = new FormData();
        fd.append('name', 'Explainer Reference');
        fd.append('aspect', activeAspect);
        fd.append('language', activeLanguage);
        const created = await callApi('/api/dashboard/create-project', { method: 'POST', body: fd });
        await fetchJobs();
        await loadProject(created.job_id);
      } catch {}
    }
    hideOverlay();

    // Greeting Message
    appendChatBubble('agent', '👋 Welcome to MotionClone: Reference-to-Video Explainer Studio! I am your AI Creative Director. Upload a reference video or paste JSX in "Paste & Render" to build an original 60 FPS motion graphics explainer.');

    // Pre-fill sample Remotion JSX into merger tab
    const mergerJsx = $('merger-jsx-input');
    if (mergerJsx && !mergerJsx.value.trim()) {
      mergerJsx.value = `import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const ExplainerScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProgress = spring({ frame, fps, config: { damping: 14 } });
  const scale = interpolate(titleProgress, [0, 1], [0.85, 1]);
  const opacity = interpolate(titleProgress, [0, 1], [0, 1]);

  return (
    <AbsoluteFill style={{
      backgroundColor: '#0a0a0f',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{ transform: \`scale(\${scale})\`, opacity, textAlign: 'center', padding: '0 40px' }}>
        <h1 style={{
          fontSize: 64,
          fontWeight: 800,
          background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          margin: '0 0 16px 0'
        }}>
          Autonomous AI Platform
        </h1>
        <p style={{ fontSize: 26, color: '#94a3b8', margin: 0 }}>
          From Reference Video to 60 FPS Remotion Motion Graphics
        </p>
      </div>
    </AbsoluteFill>
  );
};
`;
    }
  });
})();

