// Dashboard Pro: Reference-to-Video Explainer Studio Frontend Controller
(function () {
  'use strict';

  let activeJobId = null;
  let allJobs = [];
  let projectState = null;
  let activeAspect = '9:16';
  let activeLanguage = 'en';
  let activeDuration = '30s';
  let activeVoice = 'hm_omega';
  let activeStyle = 'auto'; // 'auto' | 'science' | 'icon'
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

  function showToast(message, type = 'info', action = null) {
    const container = $('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    const icon = type === 'success' ? '✓ ' : (type === 'error' ? '⚠️ ' : 'ℹ️ ');
    const textSpan = document.createElement('span');
    textSpan.textContent = `${icon}${message}`;
    toast.appendChild(textSpan);

    if (action && action.label && action.onClick) {
      const actBtn = document.createElement('button');
      actBtn.type = 'button';
      actBtn.className = 'toast-action-btn';
      actBtn.textContent = action.label;
      actBtn.onclick = (e) => {
        e.stopPropagation();
        try { action.onClick(); } catch (err) { console.error(err); }
        toast.remove();
      };
      toast.appendChild(actBtn);
    }

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
    }, action ? 6500 : 3800);
  }

  function formatDuration(seconds) {
    const s = Math.round(Number(seconds) || 0);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
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
    } catch { }
    return '';
  }

  async function getFirebaseToken() {
    if (window.firebase && firebase.auth && firebase.auth().currentUser) {
      try {
        const refreshed = await firebase.auth().currentUser.getIdToken(false);
        if (refreshed) {
          localStorage.setItem('firebase_id_token', refreshed);
          return refreshed;
        }
      } catch (e) {
        console.warn('Firebase token refresh error:', e);
      }
    }
    return localStorage.getItem('firebase_id_token') || sessionStorage.getItem('firebase_id_token') || localStorage.getItem('motionclone_token') || '';
  }

  async function callApi(path, options = {}) {
    let token = await getValidToken();
    const fbToken = await getFirebaseToken();
    const reqHeaders = {
      'X-Frameforge-Token': token,
      ...(fbToken ? { 'Authorization': `Bearer ${fbToken}` } : {}),
      ...(options.headers || {})
    };
    let res = await fetch(path, {
      ...options,
      headers: reqHeaders
    });
    if (res.status === 401) {
      if (window.IS_HOSTED || localStorage.getItem('frameforge_hosted') === '1') {
        localStorage.removeItem('firebase_id_token');
        sessionStorage.removeItem('firebase_id_token');
        window.location.href = '/login';
        return;
      }
    }
    if (res.status === 403) {
      try {
        const s = await fetch('/api/status').then(r => r.json());
        if (s && s.token) {
          cachedToken = s.token;
          window.__APP_TOKEN__ = cachedToken;
          reqHeaders['X-Frameforge-Token'] = cachedToken;
          res = await fetch(path, { ...options, headers: reqHeaders });
        }
      } catch { }
    }
    if (!res.ok) {
      let errDetail = res.statusText;
      try {
        const d = await res.json();
        errDetail = d.detail || d.message || errDetail;
      } catch { }
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
          const modelName = s.model || 'gemini-3.1-pro-preview';
          txt.textContent = `${modelName} Ready`;
          badge.className = 'status-badge';
          badge.title = `AI Model: ${modelName} | Provider: ${s.auth_type || 'Vertex AI'} | Location: ${s.location || 'global'}`;
        } else {
          dot.className = 'status-dot';
          txt.textContent = 'Configure Gemini Key';
          badge.className = 'status-badge warning';
          badge.title = s.error || 'Click to connect Google Gemini or Vertex AI';
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
          txt.textContent = s.gemini ? 'gemini-3.1-pro-preview Ready' : 'Gemini Key Needed';
        }
      } catch { }
    }
  }

  // Update credit balance
  async function updateCreditBalance() {
    try {
      const data = await callApi('/api/credits/balance');
      const el = $('user-credits-val');
      const menuEl = $('user-credits-menu-val');
      if (typeof data.balance === 'number') {
        if (el) el.textContent = data.balance;
        if (menuEl) menuEl.textContent = data.balance;
      }
    } catch (e) {
      console.warn('Credits balance lookup failed:', e);
    }
  }

  // Update credit preflight estimate
  async function updateCreditEstimate() {
    if (!activeJobId) return;
    try {
      const est = await callApi('/api/dashboard/preflight-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: activeJobId,
          engine_type: 'compose'
        })
      });
      const bpVal = $('estimate-credits-val');
      const mgVal = $('estimate-credits-merger-val');
      if (bpVal && typeof est.credits_required === 'number') {
        bpVal.textContent = Math.max(5, Math.round(est.credits_required / 2));
      }
      if (mgVal && typeof est.credits_required === 'number') {
        mgVal.textContent = est.credits_required;
      }
    } catch (e) {
      console.warn('Credit estimate calculation failed:', e);
    }
  }

  // Initialize Firebase Auth and current user profile
  async function initFirebaseAndUser() {
    try {
      const cfgRes = await fetch('/api/auth/config').then(r => r.json()).catch(() => null);
      if (cfgRes && cfgRes.hosted) {
        window.IS_HOSTED = true;
        localStorage.setItem('frameforge_hosted', '1');
      }
      if (window.firebase && cfgRes && cfgRes.projectId) {
        const config = {
          apiKey: cfgRes.apiKey || 'AIzaSyFakeKeyForLocalDev123',
          authDomain: cfgRes.authDomain || (cfgRes.projectId + '.firebaseapp.com'),
          projectId: cfgRes.projectId,
          appId: cfgRes.appId || '1:123456789:web:abcdef'
        };
        if (!firebase.apps.length) {
          firebase.initializeApp(config);
        }
      }
    } catch (e) {
      console.warn('Auth init warning:', e);
    }

    try {
      const me = await callApi('/api/me');
      if (me && (me.email || me.hosted)) {
        const userBadge = $('user-email-display');
        const avatarEl = $('user-avatar-circle');
        if (me.email) {
          if (userBadge) {
            userBadge.textContent = me.email;
            userBadge.style.display = 'block';
          }
          if (avatarEl) {
            avatarEl.textContent = me.email.charAt(0).toUpperCase();
            avatarEl.title = me.email;
          }
        }
        const signoutBtn = $('btn-signout');
        if (signoutBtn) {
          signoutBtn.style.display = 'inline-flex';
          signoutBtn.onclick = async () => {
            try {
              await fetch('/api/auth/logout', { method: 'POST' });
            } catch { }
            if (window.firebase && firebase.auth) {
              await firebase.auth().signOut().catch(() => { });
            }
            localStorage.removeItem('firebase_id_token');
            sessionStorage.removeItem('firebase_id_token');
            localStorage.removeItem('motionclone_token');
            document.cookie = 'motionclone_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            window.location.href = '/login';
          };
        }
        if (me.hosted) {
          const keyBtn = $('btn-configure-key');
          if (keyBtn) keyBtn.style.display = 'none';
        }
      } else {
        const userBadge = $('user-email-display');
        if (userBadge) userBadge.style.display = 'none';
        const signoutBtn = $('btn-signout');
        if (signoutBtn) signoutBtn.style.display = 'none';
        const keyBtn = $('btn-configure-key');
        if (keyBtn) keyBtn.style.display = 'inline-flex';
      }
    } catch (e) {
      // If 401 in hosted mode, callApi redirects to /login
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
      if (projectState.duration || projectState.target_duration) {
        setTargetDuration(projectState.duration || projectState.target_duration);
      }
      if (projectState.voice_id) {
        setVoice(projectState.voice_id);
      }
      if (projectState.style || projectState.genre) {
        setStyle(projectState.style || projectState.genre);
      }
      renderAllViews();
      updateCreditEstimate();
      updateCreditBalance();
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

  // Target Duration Switcher (Phase 2)
  function setTargetDuration(dur) {
    activeDuration = dur || '30s';
    if (projectState) {
      projectState.duration = activeDuration;
      projectState.target_duration = activeDuration;
    }
    document.querySelectorAll('.duration-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.duration === activeDuration);
    });
    const durBadge = $('badge-active-duration');
    if (durBadge) {
      durBadge.textContent = activeDuration;
    }
    const timelineLabel = $('timeline-duration-label');
    if (timelineLabel) {
      timelineLabel.textContent = `${activeDuration} Target`;
    }
  }

  // Narration Voice Switcher (Phase 4)
  function setVoice(voiceId) {
    activeVoice = voiceId || 'hm_omega';
    if (projectState) {
      projectState.voice_id = activeVoice;
    }
    document.querySelectorAll('.voice-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.voice === activeVoice);
    });
  }

  let previewAudioObj = null;
  function previewVoiceAudition(voiceId) {
    const v = voiceId || activeVoice || 'hm_omega';
    if (previewAudioObj) {
      previewAudioObj.pause();
      previewAudioObj = null;
    }
    previewAudioObj = new Audio(`/api/dashboard/tts/preview?voice=${v}&t=${Date.now()}`);
    previewAudioObj.play().catch(e => console.warn('Voice preview error:', e));
    showToast(`🎙️ Auditioning voice: ${v === 'hm_omega' ? 'Omega (Male)' : 'Beta (Female)'}...`, 'info');
  }

  // Style Switcher (Auto, Science explainer, Icon explainer)
  function setStyle(style) {
    activeStyle = style || 'auto';
    if (projectState) {
      projectState.style = activeStyle;
    }
    document.querySelectorAll('.style-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.style === activeStyle);
    });

    const voiceGroup = $('voice-control-group');
    if (voiceGroup) {
      voiceGroup.style.display = (activeStyle === 'auto' || activeStyle === '3d') ? 'flex' : 'none';
    }

    const planBtn = $('btn-generate-plan-direct');
    if (planBtn) {
      if (activeStyle === '3d') {
        planBtn.innerHTML = '🧊 Generate 3D Story';
      } else if (activeStyle === 'science') {
        planBtn.innerHTML = '🔬 Generate Science Explainer';
      } else if (activeStyle === 'icon') {
        planBtn.innerHTML = '✨ Generate Icon Explainer';
      } else {
        planBtn.innerHTML = '📝 Generate Script & Plan';
      }
    }

    const genreCard = $('genre-voiceover-card');
    if (genreCard && activeStyle === 'auto') {
      genreCard.style.display = 'none';
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

  // =========================================================================
  // Consolidated AI Execution Monitor Telemetry & Log Handlers
  // =========================================================================
  let execTimerInterval = null;
  let execStartTime = null;

  function setExecutionStatus({
    agent = 'AI Director',
    stage = 'Idle',
    model = 'gemini-2.5-flash',
    tokens = null,
    status = 'idle', // 'idle' | 'working' | 'active' | 'error'
    credits = null,
    log = null,
    duration = null,
    isError = false
  } = {}) {
    const dot = $('exec-status-dot');
    const title = $('exec-stage-title');
    const badge = $('exec-model-badge');
    const timer = $('exec-duration-timer');
    const credTag = $('exec-credits-tag');
    const agentName = $('exec-agent-name');
    const stageName = $('exec-stage-name');
    const modelName = $('exec-model-name');
    const tokensCount = $('exec-tokens-count');
    const retryBtn = $('btn-retry-exec-action');

    if (dot) dot.className = `status-indicator-dot ${status}`;
    if (title) title.textContent = stage === 'Idle' ? 'Execution Monitor: Idle' : `${stage}…`;
    if (badge) badge.textContent = model;
    if (agentName) agentName.textContent = agent;
    if (stageName) stageName.textContent = stage;
    if (modelName) modelName.textContent = model;
    if (tokensCount && tokens !== null) tokensCount.textContent = tokens;
    if (credTag && credits !== null) credTag.textContent = `🪙 ${credits}`;

    if (status === 'working') {
      if (!execStartTime) execStartTime = Date.now();
      if (!execTimerInterval) {
        execTimerInterval = setInterval(() => {
          if (timer && execStartTime) {
            const elSec = ((Date.now() - execStartTime) / 1000).toFixed(1);
            timer.textContent = `${elSec}s`;
          }
        }, 100);
      }
      if (retryBtn) retryBtn.style.display = 'none';
    } else {
      if (execTimerInterval) {
        clearInterval(execTimerInterval);
        execTimerInterval = null;
      }
      if (duration !== null && timer) {
        timer.textContent = `${duration.toFixed(1)}s`;
      }
      execStartTime = null;
      if (retryBtn) retryBtn.style.display = isError ? 'inline-block' : 'none';
    }

    if (log) {
      appendExecutionLog(log, isError ? 'error' : (status === 'active' ? 'success' : 'normal'));
    }
  }

  function appendExecutionLog(msg, type = 'normal') {
    const term = $('exec-terminal-logs');
    if (!term) return;
    const line = document.createElement('div');
    line.className = `terminal-log-line ${type}`;
    const timeStr = new Date().toLocaleTimeString();
    line.textContent = `[${timeStr}] ${msg}`;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
  }

  // Timeline Scene Reordering, Duplication and Deletion
  function moveTimelineScene(fromIdx, direction) {
    const scenes = projectState?.scene_plan?.scenes;
    if (!scenes) return;
    const toIdx = fromIdx + direction;
    if (toIdx < 0 || toIdx >= scenes.length) return;
    const temp = scenes[fromIdx];
    scenes[fromIdx] = scenes[toIdx];
    scenes[toIdx] = temp;
    activeSceneIndex = toIdx;
    renderTimelineScenes();
    renderSceneInspector();
  }

  function duplicateTimelineScene(idx) {
    const scenes = projectState?.scene_plan?.scenes;
    if (!scenes || !scenes[idx]) return;
    const clone = JSON.parse(JSON.stringify(scenes[idx]));
    clone.headline = (clone.headline || 'Scene') + ' (Copy)';
    scenes.splice(idx + 1, 0, clone);
    activeSceneIndex = idx + 1;
    renderTimelineScenes();
    renderSceneInspector();
    showToast(`Duplicated Scene ${idx + 1}`, 'success');
  }

  function deleteTimelineScene(idx) {
    const scenes = projectState?.scene_plan?.scenes;
    if (!scenes || !scenes[idx]) return;
    if (scenes.length <= 1) {
      alert('A video must have at least one scene.');
      return;
    }
    if (!confirm(`Delete Scene ${idx + 1}?`)) return;
    scenes.splice(idx, 1);
    activeSceneIndex = Math.max(0, Math.min(idx, scenes.length - 1));
    renderTimelineScenes();
    renderSceneInspector();
    showToast(`Deleted Scene ${idx + 1}`, 'info');
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
              <div class="scene-block-header">
                <span class="scene-block-num">#${idx + 1}</span>
                <span class="scene-block-meta">${((shot.t_end - shot.t_start) || 3).toFixed(1)}s</span>
              </div>
              <div class="scene-block-title">📐 ${escapeHtml(shot.shot_type || `Shot ${idx + 1}`)}</div>
              <div class="scene-block-meta">
                <span>${escapeHtml(shot.camera_motion || 'push-in')}</span>
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

    const templateIconMap = {
      'kinetic_text': '⚡',
      'character_story': '👤',
      'finance_breakdown': '💰',
      'timeline_gap': '⏳',
      'money_flow': '💸',
      'dashboard_3d_float': '🌟',
      'interactive_cursor_click': '🖱️',
      'fact_card': '📊',
      'stat_counter': '🔢',
      'comparison_split': '⚖️',
      'bullet_list': '📋',
      'quote': '💬',
      'full_bleed_image': '🖼️',
      'cta_card': '🎯',
      'title_card': '🏷️',
      'lower_third': '💬',
      'transparent_callout': '✨'
    };

    container.innerHTML = scenes.map((s, idx) => {
      const isActive = idx === activeSceneIndex ? 'active' : '';
      const icon = templateIconMap[s.template] || '🎬';

      return `
        <div class="scene-block ${isActive}" data-index="${idx}">
          <div class="scene-block-header">
            <span class="scene-block-num">#${idx + 1}</span>
            <div class="scene-block-actions" onclick="event.stopPropagation()">
              <button type="button" class="btn-scene-action" data-action="move-left" data-index="${idx}" title="Move Earlier">◀</button>
              <button type="button" class="btn-scene-action" data-action="move-right" data-index="${idx}" title="Move Later">▶</button>
              <button type="button" class="btn-scene-action" data-action="dup" data-index="${idx}" title="Duplicate">📋</button>
              <button type="button" class="btn-scene-action btn-del" data-action="del" data-index="${idx}" title="Delete">🗑️</button>
            </div>
          </div>
          <div class="scene-block-title" title="${escapeHtml(s.headline || s.title || `Scene ${idx + 1}`)}">${icon} ${escapeHtml(s.headline || s.title || `Scene ${idx + 1}`)}</div>
          <div class="scene-block-meta">
            <span>${escapeHtml(s.template ? s.template.replace(/_/g, ' ') : 'kinetic')}</span>
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

    container.querySelectorAll('.btn-scene-action').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const idx = parseInt(btn.dataset.index, 10);
        if (action === 'move-left') moveTimelineScene(idx, -1);
        else if (action === 'move-right') moveTimelineScene(idx, 1);
        else if (action === 'dup') duplicateTimelineScene(idx);
        else if (action === 'del') deleteTimelineScene(idx);
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
        if ($('scene-camera-select')) $('scene-camera-select').value = shot.camera_motion || 'slow_push_in';
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
    if (heading) heading.textContent = `Scene ${activeSceneIndex + 1}: ${(s.template || 'kinetic_text').replace(/_/g, ' ')}`;
    if (badge) badge.textContent = `Scene ${activeSceneIndex + 1} of ${scenes.length}`;

    if ($('scene-template-select')) $('scene-template-select').value = s.template || 'kinetic_text';
    if ($('scene-headline-input')) $('scene-headline-input').value = s.headline || '';
    if ($('scene-subtitle-input')) $('scene-subtitle-input').value = s.subtitle || '';
    if ($('scene-vo-en-input')) $('scene-vo-en-input').value = s.voiceover_script_en || '';
    if ($('scene-vo-hi-input')) $('scene-vo-hi-input').value = s.voiceover_script_hi || '';
    if ($('scene-duration-input')) $('scene-duration-input').value = s.duration_seconds || 3.0;
    if ($('scene-transition-select')) $('scene-transition-select').value = s.transition || 'cut';
    if ($('scene-camera-select')) $('scene-camera-select').value = s.camera_motion || 'slow_push_in';
    if ($('scene-art-direction-select')) $('scene-art-direction-select').value = s.art_direction || 'cinematic_clean';
    if ($('scene-character-pose-select')) $('scene-character-pose-select').value = s.character_pose || 'none';
    if ($('scene-prop-select')) $('scene-prop-select').value = s.scene_prop || s.prop || 'none';

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
            <button type="button" class="chat-card-btn" id="btn-render-preview-chat">⚡ Render 30 FPS Remotion Preview</button>
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

    setExecutionStatus({
      agent: 'Video Architect',
      stage: 'Deconstructing Reference',
      model: 'gemini-2.5-flash',
      status: 'working',
      log: 'Deconstructing reference video motion, cuts, and kinetic typography…'
    });

    showOverlay('Deconstructing Reference…', 'Google Gemini is analyzing pacing, cuts, and motion rules');
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
      updateCreditEstimate();
      updateCreditBalance();

      setExecutionStatus({
        agent: 'Video Architect',
        stage: 'Blueprint Extracted',
        model: 'gemini-2.5-flash',
        status: 'active',
        credits: 10,
        log: `Reference blueprint extracted with ${res.blueprint?.shots?.length || 0} shots.`
      });

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
      setExecutionStatus({
        agent: 'Video Architect',
        stage: 'Deconstruct Failed',
        status: 'error',
        isError: true,
        log: e.message
      });
      showToast('Notice: ' + e.message, 'error');
      appendChatBubble('agent', `⚠️ Notice: ${e.message}`);
    }
  }

  async function handleGenerateScenePlan() {
    if (!activeJobId) {
      try {
        const created = await callApi('/api/dashboard/create-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Explainer Project' })
        });
        activeJobId = created.job_id;
      } catch (err) {
        showToast('Please select or create an explainer project first.', 'error');
        return;
      }
    }

    if (activeStyle && activeStyle !== 'auto') {
      return handleGenrePipeline();
    }

    const topicInput = $('topic-brief-input')?.value.trim();
    const brandInput = $('brand-name-input')?.value.trim();
    const userStory = topicInput || 'Next-Gen Autonomous AI Platform that saves teams 15 hours a week.';
    const brandName = brandInput || projectState?.name || 'MotionClone AI';

    setExecutionStatus({
      agent: 'Script & Scene Planner',
      stage: 'Generating Script & Scenes',
      model: 'gemini-2.5-flash',
      status: 'working',
      log: `Generating bilingual voiceover script and Remotion scene plan for "${brandName}"…`
    });

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
          target_duration: activeDuration,
          voice_id: activeVoice,
          music_track_id: $('music-track-select')?.value || 'tech_upbeat'
        })
      });

      projectState.scene_plan = res.scene_plan;
      hideOverlay();
      showToast('✨ Scene plan & voiceover ready!', 'success');
      renderAllViews();
      updateCreditEstimate();
      updateCreditBalance();

      setExecutionStatus({
        agent: 'Script & Scene Planner',
        stage: 'Scene Plan Ready',
        model: 'gemini-2.5-flash',
        status: 'active',
        credits: 15,
        log: `Scene plan generated: ${res.scene_plan.scenes.length} scenes mapped with bilingual voiceover.`
      });

      appendChatBubble(
        'agent',
        `🎉 ${res.message}\n${res.scene_plan.scenes.length} Remotion scenes with synchronized audio and motion graphics are mapped in the timeline. Use the 30 FPS Preview or Render button to compile.`
      );

    } catch (e) {
      hideOverlay();
      setExecutionStatus({
        agent: 'Script & Scene Planner',
        stage: 'Planning Failed',
        status: 'error',
        isError: true,
        log: e.message
      });
      showToast('Scene plan error: ' + e.message, 'error');
      alert('Scene plan error: ' + e.message);
    }
  }

  // Genre Pipeline (Science & Icon explainer modes)
  async function handleGenrePipeline() {
    if (!activeJobId) {
      try {
        const created = await callApi('/api/dashboard/create-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Genre Explainer Video' })
        });
        activeJobId = created.job_id;
      } catch (err) {
        showToast('Please select or create an explainer project first.', 'error');
        return;
      }
    }

    const topicInput = $('topic-brief-input')?.value.trim();
    const topic = topicInput || 'Action games and visual attention';
    let targetSec = 40;
    if (activeDuration) {
      if (activeDuration.endsWith('m')) targetSec = parseInt(activeDuration, 10) * 60;
      else if (activeDuration.endsWith('s')) targetSec = parseInt(activeDuration, 10);
      else {
        const n = parseInt(activeDuration, 10);
        if (!isNaN(n)) targetSec = n;
      }
    }

    setExecutionStatus({
      agent: activeStyle === 'science' ? 'Science Director' : 'Icon Director',
      stage: 'Planning Genre Scenes',
      model: 'gemini-2.5-flash',
      status: 'working',
      log: `Planning ${activeStyle} explainer for "${topic}" (${targetSec}s)…`
    });

    showOverlay(`Generating ${activeStyle === 'science' ? 'Science' : 'Icon'} Scene Plan…`, 'Matching visual components to script beats');
    updatePipelineStep(3);

    try {
      const res = await callApi(`/api/dashboard/project/${activeJobId}/genre-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genre: activeStyle,
          topic: topic,
          language: activeLanguage === 'hi' ? 'hindi' : 'english',
          seconds: targetSec
        })
      });

      // If step 2 returns need.length, toast the missing props and do not continue.
      if (res.need && res.need.length > 0) {
        hideOverlay();
        const missing = res.need.map(n => typeof n === 'string' ? n : (n.need_icon || n.need_prop || n.concept || n.kind || n.name || JSON.stringify(n))).join(', ');
        showToast(`Missing required props: ${missing}`, 'error');
        appendChatBubble('agent', `⚠️ Missing required props: ${missing}. Stopped without continuing.`);
        setExecutionStatus({
          agent: activeStyle === 'science' ? 'Science Director' : 'Icon Director',
          stage: 'Missing Props',
          status: 'error',
          isError: true,
          log: `Missing props: ${missing}`
        });
        return;
      }

      if (!res.ok) {
        hideOverlay();
        const probs = (res.problems || []).join('; ') || 'Genre planning failed';
        showToast(`Genre plan error: ${probs}`, 'error');
        appendChatBubble('agent', `⚠️ ${probs}`);
        setExecutionStatus({
          agent: activeStyle === 'science' ? 'Science Director' : 'Icon Director',
          stage: 'Planning Failed',
          status: 'error',
          isError: true,
          log: probs
        });
        return;
      }

      // Step 2 succeeded: reload project to get written scene_plan.json
      await loadProject(activeJobId);
      hideOverlay();
      showToast('✨ Beat script ready! Record voiceover and drop audio below.', 'success');

      setExecutionStatus({
        agent: activeStyle === 'science' ? 'Science Director' : 'Icon Director',
        stage: 'Beats Ready',
        model: 'gemini-2.5-flash',
        status: 'active',
        log: `Generated ${res.scenes || (projectState?.scene_plan?.scenes || []).length} beats for "${topic}".`
      });

      // Populate beats in UI for narrator
      displayGenreBeats(projectState?.scene_plan?.scenes || []);

    } catch (e) {
      hideOverlay();
      showToast('Genre planning error: ' + e.message, 'error');
      setExecutionStatus({
        agent: activeStyle === 'science' ? 'Science Director' : 'Icon Director',
        stage: 'Planning Failed',
        status: 'error',
        isError: true,
        log: e.message
      });
    }
  }

  function displayGenreBeats(scenes) {
    const card = $('genre-voiceover-card');
    if (!card) return;
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const beatsList = $('genre-beats-list');
    if (beatsList) {
      beatsList.innerHTML = scenes.map((sc, idx) => {
        const text = sc.voiceover_script_en || sc.narration_marked || sc.headline || `Beat ${idx + 1}`;
        const dur = sc.duration_seconds || sc.duration || 3;
        return `
          <div class="genre-beat-row">
            <span class="genre-beat-tag">Beat ${idx + 1} (${dur}s)</span>
            <span class="genre-beat-text">${escapeHtml(text)}</span>
          </div>
        `;
      }).join('');
    }

    const badge = $('genre-status-badge');
    if (badge) {
      badge.textContent = `${scenes.length} Beats Ready`;
    }

    const feedback = $('genre-feedback-banner');
    if (feedback) feedback.style.display = 'none';
    const actions = $('genre-actions-bar');
    if (actions) actions.style.display = 'none';
  }

  async function handleVoiceoverUpload(file) {
    if (!activeJobId) {
      showToast('Please select or create a project first.', 'error');
      return;
    }
    if (!file) return;

    showOverlay('Aligning Voiceover Audio…', 'Detecting sentence pauses and matching scene cuts to beats');
    setExecutionStatus({
      agent: 'Voiceover Aligner',
      stage: 'Aligning Audio',
      model: 'FFmpeg + Silence Detection',
      status: 'working',
      log: `Aligning uploaded voiceover (${file.name}, ${(file.size / 1024).toFixed(0)} KB) to beats…`
    });

    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await callApi(`/api/dashboard/project/${activeJobId}/voiceover-upload`, {
        method: 'POST',
        body: fd
      });

      hideOverlay();

      const banner = $('genre-feedback-banner');
      const confPill = $('genre-confidence-pill');
      const durPill = $('genre-duration-pill');
      const warnList = $('genre-warnings-list');
      const actions = $('genre-actions-bar');

      const conf = typeof res.confidence === 'number' ? res.confidence : 0;
      const confPct = Math.round(conf * 100);

      if (banner) banner.style.display = 'block';
      if (actions) actions.style.display = 'flex';

      if (confPill) {
        confPill.textContent = `Confidence: ${confPct}%`;
        confPill.className = `genre-confidence-pill ${conf >= 0.5 ? 'confidence-good' : 'confidence-low'}`;
      }
      if (durPill) {
        durPill.textContent = `Total: ${(res.total || 0).toFixed(1)}s`;
      }
      if (warnList) {
        if (res.warnings && res.warnings.length > 0) {
          warnList.innerHTML = res.warnings.map(w => `<div>⚠️ ${escapeHtml(w)}</div>`).join('');
        } else {
          warnList.innerHTML = `<div style="color:var(--success, #15803d);">✓ All ${res.total ? res.total.toFixed(1) + 's' : ''} audio successfully aligned to beat pauses.</div>`;
        }
      }

      if (!res.ok || conf < 0.5) {
        showToast(`⚠️ Alignment confidence is ${confPct}%. You can re-upload or proceed.`, 'warning');
        setExecutionStatus({
          agent: 'Voiceover Aligner',
          stage: 'Low Confidence Alignment',
          status: 'warning',
          log: `Confidence: ${confPct}%. Warnings: ${(res.warnings || []).join('; ')}`
        });
      } else {
        showToast(`✅ Voiceover aligned (${confPct}% confidence). Rendering video…`, 'success');
        setExecutionStatus({
          agent: 'Voiceover Aligner',
          stage: 'Alignment Complete',
          status: 'active',
          log: `Aligned audio in ${(res.total || 0).toFixed(1)}s with ${confPct}% confidence.`
        });

        // Step 4: generate with use_existing_scene_plan: true
        await triggerProjectGenerate({ useExistingScenePlan: true, fps: 30 });
      }

    } catch (e) {
      hideOverlay();
      showToast('Voiceover upload failed: ' + e.message, 'error');
      setExecutionStatus({
        agent: 'Voiceover Aligner',
        stage: 'Upload Failed',
        status: 'error',
        isError: true,
        log: e.message
      });
    }
  }

  let lastGenerationParams = null;
  let overlayTimerInterval = null;
  let overlayStartTime = null;

  function viewGeneratedVideo() {
    hideGenerationSuccessBox();
    $('btn-view-rebuilt')?.click();
    renderVideoStage();
    const player = $('dashboard-video-player');
    if (player) {
      player.scrollIntoView({ behavior: 'smooth', block: 'center' });
      player.currentTime = 0;
      player.play().catch(() => { });
    }
  }
  window.viewGeneratedVideo = viewGeneratedVideo;

  function retryProjectGenerate() {
    hideGenerationFailureBox();
    triggerProjectGenerate(lastGenerationParams || { useExistingScenePlan: true, fps: 30 });
  }
  window.retryProjectGenerate = retryProjectGenerate;
  window.setStyle = setStyle;
  window.getActiveStyle = () => activeStyle;
  window.handleGenrePipeline = handleGenrePipeline;
  window.handleVoiceoverUpload = handleVoiceoverUpload;
  window.displayGenreBeats = displayGenreBeats;

  function showGenerationSuccess({ timeFormatted, totalSeconds }) {
    hideGenerationFailureBox();
    hideNeedsAttentionBox();

    const box = $('generation-success-box');
    const badge = $('generation-time-badge');
    if (badge) badge.textContent = `⏱️ in ${timeFormatted}`;
    if (box) box.style.display = 'flex';

    const renderTimeBadge = $('badge-render-time');
    if (renderTimeBadge) {
      renderTimeBadge.textContent = `⏱️ Generated in ${timeFormatted}`;
      renderTimeBadge.style.display = 'inline-flex';
    }
    const monitorBadgeTime = $('monitor-badge-time');
    if (monitorBadgeTime) {
      monitorBadgeTime.textContent = `⏱️ ${timeFormatted}`;
      monitorBadgeTime.style.display = 'inline-flex';
    }

    showToast(`🎬 Video is generated in ${timeFormatted}!`, 'success', {
      label: 'View here ↗',
      onClick: viewGeneratedVideo
    });

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification('🎬 Video is generated!', {
          body: `Your video was generated in ${timeFormatted}. Click here to view!`,
          icon: '/favicon.ico'
        });
        notif.onclick = () => {
          window.focus();
          viewGeneratedVideo();
        };
      } catch { }
    }

    appendChatBubble(
      'agent',
      `🎬 Your 30 FPS Explainer Video is generated in ${timeFormatted}!`,
      `<div style="margin-top:8px;"><button type="button" class="chat-action-btn" onclick="window.viewGeneratedVideo()">▶ View here ↗</button></div>`
    );
  }

  function hideGenerationSuccessBox() {
    const box = $('generation-success-box');
    if (box) box.style.display = 'none';
  }

  function showGenerationFailure({ stage, error, issues, onRetry }) {
    hideGenerationSuccessBox();
    hideNeedsAttentionBox();

    const box = $('generation-failure-box');
    const reasonEl = $('generation-failure-reason');
    const issuesEl = $('generation-failure-issues');
    const retryBtn = $('btn-retry-generation');

    const stageStr = stage || 'Video Generation';
    const errorStr = error || 'An unexpected error occurred during rendering.';

    if (reasonEl) {
      reasonEl.innerHTML = `<strong>Stage:</strong> ${escapeHtml(stageStr)}<br><strong>Why:</strong> ${escapeHtml(errorStr)}`;
    }

    if (issuesEl) {
      issuesEl.innerHTML = '';
      if (issues && issues.length) {
        issues.forEach(iss => {
          const row = document.createElement('div');
          row.className = 'issue-row';
          row.innerHTML = `<span class="issue-code">[${escapeHtml(iss.code || 'ISSUE')}]</span> <span>${escapeHtml(iss.message || '')}</span>`;
          issuesEl.appendChild(row);
        });
      }
    }

    if (retryBtn) {
      retryBtn.onclick = () => {
        if (typeof onRetry === 'function') onRetry();
        else retryProjectGenerate();
      };
    }

    if (box) box.style.display = 'flex';

    showToast(`❌ Video generation failed: ${errorStr}`, 'error', {
      label: '🔄 Retry',
      onClick: () => {
        if (typeof onRetry === 'function') onRetry();
        else retryProjectGenerate();
      }
    });

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('❌ Video Generation Failed', {
          body: `Failed at ${stageStr}: ${errorStr}. Click to retry.`,
          icon: '/favicon.ico'
        });
      } catch { }
    }

    appendChatBubble(
      'agent',
      `❌ Video generation failed at stage: ${stageStr}\nWhy: ${errorStr}`,
      `<div style="margin-top:8px;"><button type="button" class="chat-action-btn retry-btn" onclick="window.retryProjectGenerate()">🔄 Retry Video Generation</button></div>`
    );
  }

  function hideGenerationFailureBox() {
    const box = $('generation-failure-box');
    if (box) box.style.display = 'none';
  }

  async function triggerProjectGenerate({ useExistingScenePlan = true, fps = 30 } = {}) {
    if (!activeJobId) {
      alert('Please select or create an explainer project first.');
      return;
    }

    const scenes = projectState?.scene_plan?.scenes;
    if (useExistingScenePlan && (!scenes || !Array.isArray(scenes) || scenes.length === 0)) {
      showToast('⚠️ Please generate a Script & Scene Plan (Step 2) first before rendering.', 'warning');
      const planBtn = $('btn-generate-plan-direct');
      if (planBtn) {
        planBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    lastGenerationParams = { useExistingScenePlan, fps: 30 };
    hideGenerationSuccessBox();
    hideGenerationFailureBox();

    if ('Notification' in window && Notification.permission === 'default') {
      try { Notification.requestPermission().catch(() => { }); } catch { }
    }

    setExecutionStatus({
      agent: 'Remotion Render Engine',
      stage: 'Rendering 30 FPS MP4',
      model: 'Remotion 4.0 + FFmpeg',
      status: 'working',
      credits: 20,
      log: 'Synthesizing voiceover, mixing audio, and rendering 30 FPS composition…'
    });

    showOverlay('Rendering 30 FPS Remotion Video…', 'Synthesizing motion graphics, captions, sound effects, and music', true);
    updatePipelineStep(4);
    showToast('🎬 Rendering 30 FPS video...', 'info');

    const renderStartTime = Date.now();

    try {
      const payload = {
        brief: projectState?.name || "AI Explainer Video",
        language: activeLanguage || projectState?.language || "en",
        aspect: activeAspect || projectState?.aspect || "9:16",
        duration: activeDuration || projectState?.duration || "30s",
        voice_id: activeVoice || projectState?.voice_id || "hm_omega",
        music_track: $('music-track-select')?.value || projectState?.music_track || "tech_upbeat",
        use_existing_scene_plan: Boolean(useExistingScenePlan),
        fps: 30
      };

      await callApi(`/api/dashboard/project/${activeJobId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const poll = setInterval(async () => {
        try {
          const s = await callApi(`/api/dashboard/project/${activeJobId}/status`);
          if (s.stage) {
            const descEl = $('stage-overlay-desc');
            if (descEl) descEl.textContent = s.stage + (s.progress ? ` (${s.progress}%)` : '');
            setExecutionStatus({
              agent: 'Remotion Render Engine',
              stage: s.stage,
              model: 'Remotion 4.0 + FFmpeg',
              status: 'working',
              log: `[Progress ${s.progress || 0}%] ${s.stage}`
            });
          }
          if (s.state === 'needs_attention') {
            clearInterval(poll);
            hideOverlay();
            const totalSec = s.elapsed_seconds || Math.round((Date.now() - renderStartTime) / 1000);
            const timeFormatted = formatDuration(totalSec);
            updatePipelineStep(5);
            videoCacheKey = Date.now();
            projectState.preview_url = s.output_url || `/media/${activeJobId}/output.mp4`;
            viewGeneratedVideo();
            showNeedsAttentionBox(s.issues || []);
            setExecutionStatus({
              agent: 'Remotion Render Engine',
              stage: 'Needs Attention',
              model: 'Remotion 4.0 + FFmpeg',
              status: 'active',
              duration: totalSec,
              log: `Render completed with issues: ${(s.issues || []).map(i => i.message).join('; ')}`
            });
            showToast(`⚠️ Video rendered in ${timeFormatted}, but requires attention.`, 'warning', {
              label: 'View here ↗',
              onClick: viewGeneratedVideo
            });
            appendChatBubble(
              'agent',
              `⚠️ Video rendered in ${timeFormatted} with issues that need attention. See the issues listed above.`,
              `<div style="margin-top:8px;"><button type="button" class="chat-action-btn" onclick="window.viewGeneratedVideo()">▶ View here ↗</button></div>`
            );
          } else if (s.state === 'ready' || s.stage === 'Complete' || (s.output_url && s.progress === 100)) {
            clearInterval(poll);
            hideOverlay();
            hideNeedsAttentionBox();
            const totalSec = s.elapsed_seconds || Math.round((Date.now() - renderStartTime) / 1000);
            const timeFormatted = formatDuration(totalSec);
            updatePipelineStep(5);
            videoCacheKey = Date.now();
            projectState.preview_url = s.output_url || `/media/${activeJobId}/output.mp4`;

            viewGeneratedVideo();
            showGenerationSuccess({ timeFormatted, totalSeconds: totalSec });
            setExecutionStatus({
              agent: 'Remotion Render Engine',
              stage: 'Render Complete',
              model: 'Remotion 4.0 + FFmpeg',
              status: 'active',
              duration: totalSec,
              log: `✓ 30 FPS Explainer MP4 generated in ${timeFormatted}.`
            });
          } else if (s.state === 'failed' || s.state === 'error') {
            clearInterval(poll);
            hideOverlay();
            const err = s.error || 'Video generation failed. Check server logs.';
            setExecutionStatus({
              agent: 'Remotion Render Engine',
              stage: s.stage || 'Render Failed',
              model: 'Remotion 4.0 + FFmpeg',
              status: 'error',
              isError: true,
              log: `❌ Error: ${err}`
            });
            showGenerationFailure({
              stage: s.stage || 'Rendering',
              error: err,
              issues: s.issues || [],
              onRetry: retryProjectGenerate
            });
          }
        } catch (err) {
          console.warn('Status poll warning:', err);
        }
      }, 2000);

    } catch (e) {
      hideOverlay();
      setExecutionStatus({
        agent: 'Remotion Render Engine',
        stage: 'Initiation Failed',
        model: 'Remotion 4.0 + FFmpeg',
        status: 'error',
        isError: true,
        log: `❌ Initiation Error: ${e.message}`
      });
      if (e.status === 402 || e.message?.includes('402') || e.message?.includes('credits')) {
        showToast('Insufficient credits to complete this generation.', 'error');
        alert('Insufficient credits: ' + e.message);
      } else {
        const errMsg = e.message || 'Failed to start generation.';
        showToast('Render initiation error: ' + errMsg, 'error');
        showGenerationFailure({
          stage: 'Initiation',
          error: errMsg,
          issues: [],
          onRetry: retryProjectGenerate
        });
      }
    }
  }

  async function handleRenderPreview() {
    const scenes = projectState?.scene_plan?.scenes;
    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      showToast('⚠️ Please generate a Script & Scene Plan (Step 2) first before rendering.', 'warning');
      const planBtn = $('btn-generate-plan-direct');
      if (planBtn) {
        planBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    return triggerProjectGenerate({ useExistingScenePlan: true, fps: 30 });
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

    hideGenerationSuccessBox();
    hideGenerationFailureBox();

    if ('Notification' in window && Notification.permission === 'default') {
      try { Notification.requestPermission().catch(() => { }); } catch { }
    }

    showOverlay('Merging Code & Rendering 30 FPS MP4…', 'Transpiling Remotion JSX, generating voiceover audio, and compiling video', true);
    updatePipelineStep(4);
    const pasteStartTime = Date.now();

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

      showToast('🚀 Code merged! Compiling 30 FPS video...', 'info');

      // Poll job status until complete or error
      const poll = setInterval(async () => {
        try {
          const j = await callApi(`/api/jobs/${activeJobId}`);
          if (j.status === 'needs_attention') {
            clearInterval(poll);
            hideOverlay();
            const totalSec = Math.round((Date.now() - pasteStartTime) / 1000);
            const timeFormatted = formatDuration(totalSec);
            updatePipelineStep(5);
            videoCacheKey = Date.now();
            projectState.preview_url = `/media/${activeJobId}/output.mp4`;
            viewGeneratedVideo();
            showNeedsAttentionBox(j.issues || []);
            showToast(`⚠️ Merged in ${timeFormatted} with issues. Review Needs Attention list.`, 'warning', {
              label: 'View here ↗',
              onClick: viewGeneratedVideo
            });
            appendChatBubble(
              'agent',
              `⚠️ Custom code merged in ${timeFormatted}, but some scenes require attention. See the issues list.`,
              `<div style="margin-top:8px;"><button type="button" class="chat-action-btn" onclick="window.viewGeneratedVideo()">▶ View here ↗</button></div>`
            );
          } else if (j.status === 'complete' || j.status === 'ready') {
            clearInterval(poll);
            hideOverlay();
            hideNeedsAttentionBox();
            const totalSec = Math.round((Date.now() - pasteStartTime) / 1000);
            const timeFormatted = formatDuration(totalSec);
            updatePipelineStep(5);
            videoCacheKey = Date.now();
            projectState.preview_url = `/media/${activeJobId}/output.mp4`;

            viewGeneratedVideo();
            showGenerationSuccess({ timeFormatted, totalSeconds: totalSec });
          } else if (j.status === 'error') {
            clearInterval(poll);
            hideOverlay();
            const err = j.error || 'Check server logs';
            showGenerationFailure({
              stage: j.stage || 'Paste & Render',
              error: err,
              issues: j.issues || [],
              onRetry: handlePasteAndRender
            });
          }
        } catch { }
      }, 2500);

    } catch (e) {
      hideOverlay();
      const errMsg = e.message || 'Merge & Render failed.';
      showToast('Merge & Render failed: ' + errMsg, 'error');
      showGenerationFailure({
        stage: 'Paste & Render Merger',
        error: errMsg,
        issues: [],
        onRetry: handlePasteAndRender
      });
    }
  }

  function showOverlay(title, desc, showTimer = false) {
    const el = $('stage-render-overlay');
    if (el) {
      const t = $('stage-overlay-title');
      const d = $('stage-overlay-desc');
      const timerEl = $('stage-overlay-timer');
      if (t) t.textContent = title;
      if (d) d.textContent = desc;
      if (timerEl) {
        if (showTimer) {
          timerEl.style.display = 'block';
          timerEl.textContent = '⏱️ Time elapsed: 0s';
          overlayStartTime = Date.now();
          if (overlayTimerInterval) clearInterval(overlayTimerInterval);
          overlayTimerInterval = setInterval(() => {
            const elapsed = Math.round((Date.now() - overlayStartTime) / 1000);
            timerEl.textContent = `⏱️ Time elapsed: ${formatDuration(elapsed)}`;
          }, 1000);
        } else {
          timerEl.style.display = 'none';
          if (overlayTimerInterval) clearInterval(overlayTimerInterval);
          overlayTimerInterval = null;
        }
      }
      el.hidden = false;
      el.style.display = 'flex';
    }
  }

  function hideOverlay() {
    if (overlayTimerInterval) {
      clearInterval(overlayTimerInterval);
      overlayTimerInterval = null;
    }
    const el = $('stage-render-overlay');
    if (el) {
      el.hidden = true;
      el.style.display = 'none';
    }
  }

  function showNeedsAttentionBox(issues) {
    const box = $('needs-attention-box');
    const container = $('needs-attention-issues');
    if (!box || !container) return;
    container.innerHTML = '';
    (issues || []).forEach(iss => {
      const row = document.createElement('div');
      row.className = 'issue-row';
      row.innerHTML = `<span class="issue-code">[${iss.code}]</span> <span>${iss.scene_id ? '(Scene: ' + iss.scene_id + ') ' : ''}${iss.message}</span>`;
      container.appendChild(row);
    });
    box.style.display = 'flex';
  }

  function hideNeedsAttentionBox() {
    const box = $('needs-attention-box');
    if (box) box.style.display = 'none';
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
      fd.append('duration', activeDuration);
      fd.append('voice_id', activeVoice);

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

    // Duration Buttons (Phase 2)
    document.querySelectorAll('.duration-pill').forEach(btn => {
      btn.onclick = () => setTargetDuration(btn.dataset.duration);
    });

    // Voice Buttons (Phase 4)
    document.querySelectorAll('.voice-pill').forEach(btn => {
      btn.onclick = () => setVoice(btn.dataset.voice);
    });

    // Style Selector Buttons
    document.querySelectorAll('.style-pill').forEach(btn => {
      btn.onclick = () => setStyle(btn.dataset.style);
    });

    // Genre Voiceover Upload & Alignment Listeners
    const genreDropzone = $('genre-upload-dropzone');
    const genreFileInput = $('genre-voiceover-file-input');

    genreDropzone?.addEventListener('click', () => {
      genreFileInput?.click();
    });

    genreFileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleVoiceoverUpload(e.target.files[0]);
      }
    });

    genreDropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      genreDropzone.classList.add('dragover');
    });

    genreDropzone?.addEventListener('dragleave', () => {
      genreDropzone.classList.remove('dragover');
    });

    genreDropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      genreDropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleVoiceoverUpload(e.dataTransfer.files[0]);
      }
    });

    $('btn-genre-reupload')?.addEventListener('click', (e) => {
      e.stopPropagation();
      genreFileInput?.click();
    });

    $('btn-genre-render')?.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerProjectGenerate({ useExistingScenePlan: true, fps: 30 });
    });

    // Voice Audition Preview Button
    $('btn-preview-voice')?.addEventListener('click', (e) => {
      e.stopPropagation();
      previewVoiceAudition(activeVoice);
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
      if (label) label.textContent = '🎬 30 FPS Preview';
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
          From Reference Video to 30 FPS Remotion Motion Graphics
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

    $('btn-retry-failed-scenes')?.addEventListener('click', () => {
      hideNeedsAttentionBox();
      showToast('🔄 Retrying scenes...', 'info');
      triggerProjectGenerate({ useExistingScenePlan: true, fps: 30 });
    });

    // Account Dropdown Menu Toggle & Outside Click Dismiss
    $('btn-account-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = $('account-dropdown-menu');
      if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
      }
    });

    document.addEventListener('click', (e) => {
      const menu = $('account-dropdown-menu');
      const container = $('account-menu-container');
      if (menu && container && !container.contains(e.target)) {
        menu.style.display = 'none';
      }
    });

    // Preview Monitor Column Toggle
    $('btn-toggle-monitor')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const col = $('stage-preview-column');
      if (col) {
        col.classList.toggle('collapsed');
      }
    });

    // Topic & Project Setup Collapsible Card
    const toggleTopicBrief = () => {
      const card = $('topic-brief-card');
      if (card) {
        card.classList.toggle('collapsed');
      }
    };
    $('topic-brief-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTopicBrief();
    });
    $('topic-brief-header')?.addEventListener('click', () => {
      toggleTopicBrief();
    });

    // AI Execution Monitor Expand & Actions
    const toggleExecDetails = () => {
      const details = $('execution-monitor-details');
      const btn = $('btn-toggle-exec-details');
      if (details) {
        const isHidden = details.style.display === 'none';
        details.style.display = isHidden ? 'flex' : 'none';
        if (btn) btn.textContent = isHidden ? '▴' : '▾';
      }
    };
    $('execution-monitor-toggle')?.addEventListener('click', (e) => {
      if (e.target.closest('#btn-clear-exec-logs') || e.target.closest('#btn-retry-exec-action')) return;
      toggleExecDetails();
    });
    $('btn-clear-exec-logs')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const term = $('exec-terminal-logs');
      if (term) term.innerHTML = '<div class="terminal-log-line text-muted">[Logs cleared.]</div>';
    });
    $('btn-retry-exec-action')?.addEventListener('click', (e) => {
      e.stopPropagation();
      retryProjectGenerate();
    });

    // Add Scene Button in Timeline
    $('btn-add-scene')?.addEventListener('click', () => {
      if (!projectState) return;
      if (!projectState.scene_plan) projectState.scene_plan = { scenes: [] };
      if (!projectState.scene_plan.scenes) projectState.scene_plan.scenes = [];
      const newIdx = projectState.scene_plan.scenes.length;
      projectState.scene_plan.scenes.push({
        template: 'kinetic_text',
        headline: `New Key Scene ${newIdx + 1}`,
        subtitle: 'Add supporting detail',
        voiceover_script_en: 'Enter narration script for this scene.',
        voiceover_script_hi: '',
        duration_seconds: 3.0,
        transition: 'cut',
        camera_motion: 'slow_push_in',
        art_direction: 'cinematic_clean',
        character_pose: 'none',
        scene_prop: 'none'
      });
      activeSceneIndex = newIdx;
      renderTimelineScenes();
      renderSceneInspector();
      showToast(`Added Scene ${newIdx + 1}`, 'success');
    });

    // Success & Failure Banner Actions
    $('btn-view-generated-video')?.addEventListener('click', () => {
      viewGeneratedVideo();
    });

    $('btn-retry-generation')?.addEventListener('click', () => {
      retryProjectGenerate();
    });

    $('btn-dismiss-success-banner')?.addEventListener('click', () => {
      hideGenerationSuccessBox();
    });

    $('btn-dismiss-failure-banner')?.addEventListener('click', () => {
      hideGenerationFailureBox();
    });

    // Timeline Preview Render Button
    $('btn-preview-render')?.addEventListener('click', () => {
      handleRenderPreview();
    });

    $('btn-render-final-mp4')?.addEventListener('click', () => {
      handleRenderPreview();
    });

    $('btn-render-video')?.addEventListener('click', () => {
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
      s.camera_motion = $('scene-camera-select')?.value || s.camera_motion || 'slow_push_in';
      s.art_direction = $('scene-art-direction-select')?.value || s.art_direction || 'cinematic_clean';
      s.character_pose = $('scene-character-pose-select')?.value || s.character_pose || 'none';
      s.scene_prop = $('scene-prop-select')?.value || s.scene_prop || 'none';

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
        showToast('✓ Scene edits saved to project!', 'success');
      } catch (e) {
        try {
          await callApi(`/api/dashboard/project/${activeJobId}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(projectState)
          });
          renderTimelineScenes();
          showToast('✓ Scene edits saved to project!', 'success');
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
                  <p style="font-size:11px; margin:0 0 6px; color:var(--muted);">Google Gemini will deconstruct the pacing, cuts, and visual hierarchy.</p>
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
                  <p style="font-size:11px; margin:0 0 6px; color:var(--muted);">Google Gemini will deconstruct the pacing, cuts, and visual hierarchy.</p>
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
    await initFirebaseAndUser();
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
      } catch { }
    }
    hideOverlay();

    // Greeting Message
    appendChatBubble('agent', '👋 Welcome to MotionClone: Reference-to-Video Explainer Studio! I am your AI Creative Director. Upload a reference video or paste JSX in "Paste & Render" to build an original 30 FPS motion graphics explainer.');

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
          From Reference Video to 30 FPS Remotion Motion Graphics
        </p>
      </div>
    </AbsoluteFill>
  );
};
`;
    }
  });
})();

