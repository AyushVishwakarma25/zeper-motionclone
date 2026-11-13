const $=id=>document.getElementById(id);
let token=window.__APP_TOKEN__||'',current=null,view='result',editing=false,lastPlan='',polling=false,ready=false,submitting=false;
async function refreshToken(){
  try{
    const res=await fetch('/api/status');
    const s=await res.json();
    if(s&&s.token){token=s.token;return s.token;}
  }catch{}
  return '';
}
async function api(path,options={}){
  if(!token&&path!=='/api/status')await refreshToken();
  let r=await fetch(path,{...options,headers:{'X-Frameforge-Token':token,...(options.headers||{})}});
  if(r.status===403&&path!=='/api/status'){
    const newToken=await refreshToken();
    if(newToken){
      r=await fetch(path,{...options,headers:{'X-Frameforge-Token':newToken,...(options.headers||{})}});
    }
  }
  if(!r.ok){
    let d;
    try{d=await r.json()}catch{d={detail:r.statusText}}
    const error=new Error(typeof d.detail==='string'?d.detail:'Check the project settings and try again.');
    error.status=r.status;
    throw error;
  }
  return r.json();
}
window.api = api;
window.getToken = () => token;
window.refreshToken = refreshToken;
Object.defineProperty(window, 'current', {
  get: () => current,
  set: (v) => { current = v; }
});
function error(message){setText('global-error',message);if($('global-error'))$('global-error').hidden=!message}
function brief(){return {brand:'',instructions:'',mode:'hyperframes',accent:'#b9abff',keep_audio:$('keep-audio')?.checked??true,auto_review:false}}
function fillBrief(b){if($('brand'))$('brand').value=b.brand;if($('instructions'))$('instructions').value=b.instructions;if($('accent'))$('accent').value=b.accent;if($('keep-audio'))$('keep-audio').checked=b.keep_audio;if($('auto-review'))$('auto-review').checked=b.auto_review;const m=document.querySelector(`[name=mode][value=${b.mode}]`);if(m)m.checked=true}
async function status(){
  try{
    const s=await api('/api/status');token=s.token;ready=!!(s.hyperframes&&s.ffmpeg);
    const isAIReady = !!(s.gemini || s.chatgpt);
    setText('connection',!ready?'Setup needed':isAIReady?'Ready':'AI needed');
    $('connection-dot')?.classList.toggle('connected',ready&&isAIReady);
    if($('connection'))$('connection').title=ready?(isAIReady?'Renderer and Google Gemini are ready':'Renderer ready; configure Gemini in Settings'):'Check the local renderer setup';
    if($('auth-help'))$('auth-help').hidden=isAIReady;if($('connection-notice'))$('connection-notice').hidden=true;
    window.onAccountStatus?.(s);
    if(!s.ffmpeg)error('FFmpeg is missing. Install FFmpeg and restart the app.');
    return s;
  }catch(e){setText('connection','Disconnected');$('connection-dot')?.classList.remove('connected');if($('connection-notice'))$('connection-notice').hidden=false;return null;}
}
window.checkStatus = status;
function importError(message) {
  setText('import-error',message);
  if($('import-error'))$('import-error').hidden=!message;
  $('url')?.setAttribute('aria-invalid',String(!!message && !$('video')?.files?.length));
}
function fileChanged() {
  const file=$('video').files[0];
  $('filename').textContent=file?file.name:'';
  $('selected-file').hidden=!file;
  $('filehint').textContent=file?`${(file.size/1048576).toFixed(1)} MB selected`:`Drag & drop · MP4, MOV, WebM · ${document.body.dataset.hosted==='true'?25:250} MB max`;
  if(file)$('url').value='';
  importError('');
}
$('remove-video').addEventListener('click',()=>{$('video').value='';fileChanged();$('url').focus();});
$('video').addEventListener('change',fileChanged);
$('logo').addEventListener('change',()=>{$('logo-label').textContent=$('logo').files[0]?.name||'＋ Add your logo'});
for(const name of ['dragenter','dragover'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.add('dragging')});
for(const name of ['dragleave','drop'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.remove('dragging')});
$('dropzone').addEventListener('drop',e=>{if(submitting||$('import-fields').disabled)return;const f=[...e.dataTransfer.files].find(f=>f.type.startsWith('video/')||/\.(mp4|mov|webm|mkv)$/i.test(f.name));if(f){const dt=new DataTransfer();dt.items.add(f);$('video').files=dt.files;fileChanged()}});
document.addEventListener('paste',e=>{if(submitting||$('editor-view').hidden||document.body.classList.contains('is-project')||$('import-fields').disabled)return;const f=[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('video/'));if(f){const dt=new DataTransfer();dt.items.add(f);$('video').files=dt.files;fileChanged();e.preventDefault()}});
$('url').addEventListener('input',()=>{if($('url').value){$('video').value='';fileChanged()}importError('');});
$('create-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(submitting || current && ['queued','running'].includes(current.status))return;
  importError('');error('');
  const file=$('video').files[0],url=$('url').value.trim();
  if(!file&&!url){importError('Paste a video link or upload a file to get started.');$('url').focus();return;}
  if(!file && (!$('url').validity.valid || !url.startsWith('https://'))){importError('Use a complete public video link starting with https://.');$('url').focus();return;}
  const uploadLimit=document.body.dataset.hosted==='true'?25:250;
  if(file && file.size>uploadLimit*1048576){importError(`This video is larger than ${uploadLimit} MB. Use a video link or choose a smaller file.`);return;}
  const data=new FormData();
  Object.entries(brief()).forEach(([key,value])=>data.append(key,String(value)));
  if(file)data.append('video',file);else data.append('url',url);
  if($('logo').files[0])data.append('logo',$('logo').files[0]);
  submitting=true;
  $('import-fields').disabled=true;$('new-project').disabled=true;
  $('create').disabled=true;setControl('create','Starting…','loader');
  $('create-form').setAttribute('aria-busy','true');
  try{
    const connection=await status();
    if(!connection)throw new Error('The app is disconnected. Start MotionClone, then try again.');
    if(!(connection.gemini || connection.chatgpt))throw new Error('Configure Google Gemini or Vertex AI in Settings, then try again.');
    if(!ready)throw new Error('Run Start MotionClone to install HyperFrames and check FFmpeg, then try again.');
    current=await api('/api/jobs',{method:'POST',body:data});
    editing=false;lastPlan='';
    localStorage.setItem('frameforge-project',current.id);show(current);editorPage();await refreshLibrary();
  }catch(e){importError(e.message);}
  finally{
    submitting=false;
    const busy=!!current&&['queued','running'].includes(current.status);
    $('import-fields').disabled=busy;$('create').disabled=busy;
    $('new-project').disabled=false;
    setControl('create',busy?'Rebuilding…':'Rebuild video',busy?'loader':'layers');
    $('create-form').setAttribute('aria-busy',String(busy));
  }
});
function setSource(player,url){if(url&&player.getAttribute('src')!==url){player.src=url;player.load()}}
function switchView(next){view=next;for(const id of ['result','source','compare']){$(id+'-tab').classList.toggle('active',id===view);$(id+'-tab').setAttribute('aria-selected',String(id===view));$(id+'-tab').tabIndex=id===view?0:-1}updatePlayers()}
function updatePlayers(){if(!current){window.syncComparison?.(null,view);return;}const f=current.files;const result=f.output?f.output:f['output.mp4']||f['preview.mp4'];const source=f['source.mp4'];if(source)setSource($('source-video'),source);if(result)setSource($('result-video'),result+'?v='+current.created+'-'+(current.status==='complete'?current.events?.length:0));const hasMedia=!!(result||source);$('empty-stage').hidden=hasMedia;$('players').hidden=!hasMedia;$('players').classList.toggle('compare',view==='compare'&&!!result);$('result-video').hidden=view==='source'||!result;$('source-video').hidden=!!result&&view==='result';$('source-video').controls=view!=='compare';$('render-pending').hidden=!!result||!source||!['running','queued'].includes(current.status);window.syncComparison?.(current,view)}
for(const v of ['result','source','compare'])$(v+'-tab').addEventListener('click',()=>switchView(v));
const videoTabs=['result','source','compare'];
videoTabs.forEach((name,index)=>$(name+'-tab').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;
  switchView(videoTabs[next]);$(videoTabs[next]+'-tab').focus();
}));
let syncing=false;
for(const event of ['play','pause','seeking'])$('result-video').addEventListener(event,()=>{if(view!=='compare'||syncing)return;syncing=true;const a=$('result-video'),b=$('source-video');if(event==='seeking'||Math.abs(a.currentTime-b.currentTime)>.025){const fps=current?.media?.fps||30;const t=Math.min(Math.max(0,a.duration-.001),(Math.floor(a.currentTime*fps)+.5)/fps);if(event==='seeking'&&Math.abs(a.currentTime-t)>.001)a.currentTime=t;b.currentTime=t;}b.muted=true;if(event==='play')b.play().catch(()=>{});if(event==='pause')b.pause();syncing=false});
const setText=(id,val)=>{const el=$(id);if(el)el.textContent=val;};
function show(job){current=job;window.current=job;window.dispatchEvent(new CustomEvent('project-show',{detail:job}));const busy=['queued','running'].includes(job.status);if($('create'))$('create').disabled=busy;if($('progress-panel'))$('progress-panel').hidden=!busy;setText('job-stage',job.stage);if($('progress'))$('progress').value=job.progress;setText('percent',job.progress+'%');setText('project-name',job.name);setText('mode-label',job.brief?.mode==='adapt'?'ORIGINAL MOTION + NEW BRAND':'EDITABLE LAYER RECONSTRUCTION');setText('progress-note',job.brief?.mode==='hyperframes'?'Completed scenes save automatically. Retry resumes saved work.':job.brief?.mode==='faithful'?'Preserving source artwork and audio. No AI analysis.':job.progress<48?'Analyzing visual detail can take several minutes.':'Frames are rendered and checked on this computer.');if($('job-error'))$('job-error').hidden=!['error','cancelled','interrupted'].includes(job.status);setText('job-error-text',job.error||job.stage);const complete=job.status==='complete';if($('finished'))$('finished').hidden=!complete;if(complete){setText('finished-title',job.brief?.mode==='hyperframes'?'Rebuilt video — review the match.':job.brief?.mode==='faithful'?'Original video export.':job.plan?.title||'Your film is ready.');setText('finished-detail',job.verification?`${job.verification.dimensions.join(' × ')} · ${job.verification.fps} fps · ${job.verification.actual_frames} frames ${job.brief?.mode==='hyperframes'?'compared':job.verification.visual_check==='passed'?'checked for export integrity':'checked'}${job.timing?.cache_hit?' · Reused verified export':job.timing?.total_seconds?' · Finished in '+Math.ceil(job.timing.total_seconds)+'s':''}${job.warning?' · '+job.warning:''}`:'');if($('download')&&job.files?.['output.mp4'])$('download').href=job.files['output.mp4'];if($('export'))$('export').href=`/api/jobs/${job.id}/export`}
const stepStart=job.started||job.created;const elapsed=Math.max(0,Math.floor(Date.now()/1000-stepStart));if($('progress-note'))$('progress-note').textContent+=` · ${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')} elapsed`;
if(job.media)setText('video-meta',`${job.media.width} × ${job.media.height} / ${job.media.duration.toFixed(1)}s`);
updatePlayers();if($('sheets-panel'))$('sheets-panel').hidden=['faithful','hyperframes'].includes(job.brief?.mode)||!job.sheets?.length;
if($('sheets')&&($('sheets').dataset.job!==job.id||$('sheets').childElementCount!==job.sheets?.length)){$('sheets').replaceChildren();for(const [i,url] of (job.sheets||[]).entries()){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noreferrer';const img=document.createElement('img');img.src=url;img.alt=`Reference contact sheet ${i+1} with timestamped frames`;img.loading='lazy';a.append(img);$('sheets').append(a)}$('sheets').dataset.job=job.id}
setText('sheet-count',(job.sheets?.length||0)+' CONTACT SHEETS');if($('edit-panel'))$('edit-panel').hidden=['faithful','hyperframes'].includes(job.brief?.mode)||!job.plan||busy;if($('rerender'))$('rerender').disabled=busy;if($('refine'))$('refine').disabled=busy;
if(job.plan&&!editing&&JSON.stringify(job.plan)!==lastPlan){lastPlan=JSON.stringify(job.plan);if($('plan-editor'))$('plan-editor').value=JSON.stringify(job.plan,null,2);if($('copy-fields'))$('copy-fields').replaceChildren();for(const [i,track] of (job.plan.tracks||[]).entries()){if(track.kind!=='text')continue;const label=document.createElement('label');label.textContent=track.id;const input=document.createElement('input');input.value=track.text;input.dataset.index=i;input.maxLength=500;input.addEventListener('input',()=>{try{const p=JSON.parse($('plan-editor').value);p.tracks[i].text=input.value;$('plan-editor').value=JSON.stringify(p,null,2);editing=true}catch(e){error('Fix the project JSON before editing text.')}});label.append(input);if($('copy-fields'))$('copy-fields').append(label)}setText('plan-summary',job.plan.summary);if($('observations')){$('observations').replaceChildren();for(const note of (job.plan.observations||[])){const li=document.createElement('li');li.textContent=note;$('observations').append(li)}}}}
if($('plan-editor'))$('plan-editor').addEventListener('input',()=>{editing=true});
window.show = show;
async function refreshLibrary(){try{const jobs=await api('/api/jobs');window.allJobs=jobs;if(jobs.length){$('history').replaceChildren();for(const job of jobs){const b=document.createElement('button');b.className='history-row';const title=document.createElement('span');title.textContent=job.name;const detail=document.createElement('small');detail.textContent=job.status+' · '+new Date(job.created*1000).toLocaleDateString();b.append(title,detail);b.addEventListener('click',()=>{editing=false;lastPlan='';fillBrief(job.brief);show(job);localStorage.setItem('frameforge-project',job.id)});$('history').append(b)}}return jobs}catch{return []}}
window.refreshLibrary = refreshLibrary;
let cancellingId='';
$('cancel').addEventListener('click',async()=>{
  if(!current||cancellingId===current.id)return;
  cancellingId=current.id;$('cancel').disabled=true;setControl('cancel','Cancelling…','loader');
  try{await api(`/api/jobs/${current.id}/cancel`,{method:'POST'});}catch(e){cancellingId='';$('cancel').disabled=false;setControl('cancel','Cancel','stop');error(e.message);}
});
async function retry(){if(!current||$('retry').disabled)return;$('retry').disabled=true;try{error('');current=await api(`/api/jobs/${current.id}/retry`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(brief())});editing=false;show(current)}catch(e){error(e.message)}finally{$('retry').disabled=false}}
$('render-faithful').addEventListener('click',retry);$('retry').addEventListener('click',retry);$('refine').addEventListener('click',retry);
$('rerender').addEventListener('click',async()=>{try{error('');const plan=JSON.parse($('plan-editor').value);current=await api(`/api/jobs/${current.id}/render`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(plan)});editing=false;show(current)}catch(e){error(e.message)}});
if($('refresh-auth'))$('refresh-auth').addEventListener('click',status);
if($('new-project'))$('new-project').addEventListener('click',()=>{if(submitting)return;if(current&&['running','queued'].includes(current.status)){error('Wait for the current video or cancel it before starting another.');return}current=null;window.current=null;editing=false;lastPlan='';localStorage.removeItem('frameforge-project');if($('create-form'))$('create-form').reset();if($('import-fields'))$('import-fields').disabled=false;if(typeof fileChanged==='function')fileChanged();view='result';switchView('result');setText('video-meta','Preview');setControl('create','Rebuild video','layers');if($('create-form'))$('create-form').setAttribute('aria-busy','false');setText('logo-label','＋ Add your logo');for(const id of ['progress-panel','finished','job-error','edit-panel','sheets-panel','players','render-pending']){const el=$(id);if(el)el.hidden=true;}for(const v of ['source-video','result-video']){const el=$(v);if(el){el.pause();el.removeAttribute('src');el.load();}}if($('empty-stage'))$('empty-stage').hidden=false;setText('project-name','Untitled project');if($('create'))$('create').disabled=false;error('');window.scrollTo({top:0,behavior:'smooth'})});
async function poll(){if(polling)return;if(!current){if(!$('connection-notice').hidden)await status();return;}polling=true;try{const old=current.status,id=current.id;const job=await api(`/api/jobs/${id}`);if(current?.id!==id)return;show(job);$('connection-notice').hidden=true;if(old!==job.status)await refreshLibrary()}catch{$('connection-notice').hidden=false;await status();}finally{polling=false}}
window.addEventListener('DOMContentLoaded',async()=>{
  try{
    await status();
    const jobs=await refreshLibrary();
    const requested=new URLSearchParams(location.search).get('project');
    const saved=localStorage.getItem('frameforge-project');
    const job=jobs.find(job=>job.id===requested)||jobs.find(job=>['running','queued'].includes(job.status))||jobs.find(job=>job.id===saved)||jobs[0];
    if(job)await openProject(job.id);
  }catch(e){error('Could not load the project. Refresh the page to reconnect.');}
  setInterval(poll,1800);setInterval(status,30000);
});
