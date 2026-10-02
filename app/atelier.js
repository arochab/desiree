'use strict';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const labels = {home:'Aujourd’hui',assistant:'Conversation',inbox:'Messages',memory:'Mémoire',studio:'Studio',connections:'Connexions',proof:'Journal'};
const domains = {work:'Travail',studio:'Studio',personal:'Personnel'};
const statuses = {queued:'En attente',running:'En cours',completed:'Réponse proposée',needs_review:'À revérifier',failed:'Interrompu',interrupted:'Interrompu au redémarrage'};
const prompts = {
  brief:'Fais mon briefing de chief of staff. Relis Gmail et actualise WhatsApp, ouvre les messages importants, lis mon agenda et mes actions, puis croise-les avec mes objectifs. Trois actions utiles maximum avec leurs sources et la date des captures. Propose seulement les actions nouvelles dans mon suivi, sans doublonner ni réactiver celles terminées ou écartées. Distingue ce qui dépend de moi de ce que je dois attendre. Sépare faits et recommandations, sans supposer une échéance ni un message non lu.',
  focus:'Aide-moi à décider où concentrer mon effort. Croise mes objectifs, les messages disponibles et les projets. Propose un ordre simple avec raisons, sources et incertitudes. Ne crée aucune fausse urgence.',
  music:'Liste mes sessions Ableton et reprenons une idée. Appuie-toi sur ce que tu peux réellement lire et sur ma mémoire. N’évalue pas le son sans l’avoir entendu.',
  midi:'Prépare une proposition de clip MIDI de basse en la mineur, 4 mesures en 4/4, 124 BPM, 8 notes maximum. Utilise propose_midi. Crée seulement une proposition, jamais une modification dans une session existante. Explique brièvement le motif.'
};
const paths = {
  home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  chat:'<path d="M4 4h16v12H9l-5 4Z"/><path d="M8 8h8M8 12h5"/>',
  inbox:'<path d="M4 4h16l2 12v4H2v-4Z"/><path d="M2 16h6l2 2h4l2-2h6"/>',
  memory:'<path d="M4 4h7v16H4ZM11 6h7l3 13-7 1Z"/><path d="M7 8h1M15 10h2"/>',
  music:'<path d="M10 17V5l10-2v12M10 8l10-2"/><ellipse cx="7" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  connect:'<path d="m8 3 2 4m6-4-2 4M6 8h12v4a6 6 0 0 1-12 0ZM12 18v3"/>',
  journal:'<path d="M5 3h14v18H5ZM9 8h6M9 12h6M9 16h3"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  refresh:'<path d="M20 10a8 8 0 0 0-14-5L3 8m0-5v5h5M4 14a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/>',
  moon:'<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  send:'<path d="m5 12 7-7 7 7M12 5v15"/>',
  brief:'<path d="M4 4h16v16H4ZM8 8h8M8 12h8M8 16h4"/>',
  focus:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  external:'<path d="M14 4h6v6M20 4l-9 9M10 4H4v16h16v-6"/>',
  check:'<path d="m5 12 4 4L19 6"/>'
};
paths.calendar='<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M13 14h2M7 18h2"/>';
let state = null, pollTimer, noticeTimer, refreshing, activeView = '', inboxFilter = 'all', memoryFilter = 'all';
let historyOpen = false, selectedRun = null, selectedSet = null, inspected = null, readerItem = null, readerSerial = 0;
let runKey = '', proposalKey = '';
let homeEntered = false;
const dialogEpoch = new WeakMap();

function esc(value){return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function clean(value){return String(value ?? '').replace(/[\u2013\u2014]/g,', ');}
function icon(name){return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.journal}</svg>`;}
function sourceIcon(name){return ['gmail','whatsapp'].includes(name)?`<img class="brand-icon" src="vendor/${name}.svg" alt="" width="24" height="24">`:icon({claude:'chat',studio:'music',memory:'memory',calendar:'calendar',tokens:'journal'}[name] || 'connect');}
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));root.querySelectorAll('[data-source-icon]').forEach(el=>el.innerHTML=sourceIcon(el.dataset.sourceIcon));}
function date(value){if(!value)return 'Date non fournie';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function url(value){try{const u=new URL(value);const allowed=['mail.google.com','web.whatsapp.com','www.youtube.com','producer-pal.org','calendar.google.com'].includes(u.hostname)||(u.hostname==='www.google.com'&&u.pathname.startsWith('/calendar/'));return u.protocol==='https:'&&allowed?u.href:null;}catch{return null;}}
function download(value){return /^\/api\/brain\/exports\/[a-f0-9]{16}\.mid$/.test(value || '')?'exports/example.mid':null;}
function inline(value){return esc(clean(value)).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,(_,label,target)=>{const safe=url(target.replace(/&amp;/g,'&'));return safe?`<a href="${esc(safe)}" target="_blank" rel="noreferrer">${label}</a>`:label;});}
function rich(value){
  const lines=clean(value).split('\n');let out='',paragraph=[],list=null;
  const flush=()=>{if(paragraph.length){out+=`<p>${inline(paragraph.join('\n')).replace(/\n/g,'<br>')}</p>`;paragraph=[];}if(list){out+=`</${list}>`;list=null;}};
  for(const line of lines){const heading=line.match(/^#{1,6}\s+(.+)/),item=line.match(/^(?:([-*])\s+|(\d+)\.\s+)(.+)/);
    if(heading){flush();out+=`<h3>${inline(heading[1])}</h3>`;}
    else if(item){if(paragraph.length)flush();const type=item[1]?'ul':'ol';if(list!==type){flush();list=type;out+=`<${type}>`;}out+=`<li${item[2]?` value="${Number(item[2])}"`:''}>${inline(item[3])}</li>`;}
    else if(!line.trim())flush();else{if(list)flush();paragraph.push(line);}
  }flush();return out;
}
function motion(el,frames,options={}){if(window.DesireeMotion)return window.DesireeMotion.animate(el,frames,options);if(el&&!reduced.matches)return el.animate(frames,{duration:440,easing:'cubic-bezier(.16,1,.3,1)',...options});}
function homeEntrance(){
  if(activeView!=='home'||!state)return;
  homeEntered=true;
  window.DesireeMotion?.home();
}
function toast(message,error=false){clearTimeout(noticeTimer);const el=$('#notice');el.textContent=message;el.classList.toggle('error',error);el.hidden=false;motion(el,[{opacity:0,translate:'0 8px'},{opacity:1,translate:'0 0'}]);noticeTimer=setTimeout(()=>el.hidden=true,6500);}
async function api(path,body){return window.DesireeDemo.call(path,body);}
async function busy(button,task){if(button.disabled)return;const before=button.innerHTML;button.disabled=true;button.setAttribute('aria-busy','true');try{return await task();}catch(error){toast(error.message,true);}finally{button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML=before;}}
function validateField(field,message){
  const id=field.id+'-error';let error=$('#'+id);
  if(field.value.trim()){field.removeAttribute('aria-invalid');field.removeAttribute('aria-describedby');error?.remove();return true;}
  if(!error){error=document.createElement('p');error.id=id;error.className='field-error';error.setAttribute('role','alert');field.after(error);}
  error.textContent=message;field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',id);field.focus();return false;
}
const sourceName = source => source==='gmail'?'Gmail':'WhatsApp';
function coverage(box){const c=box.coverage;return typeof c==='string'?c:c?.description || 'Aperçus visibles uniquement. Historique incomplet.';}
function allMessages(){return (state?.inbox || []).flatMap(box=>(box.items || []).map(item=>({...item,source:box.source,captured:box.observed_at})));}
function cachedMessage(id){for(const run of state?.runs || [])for(const t of run.trace || [])if(t.tool==='read_message'&&t.result?.id===id&&t.result.available&&t.result.body)return t.result;return null;}
function oldCapture(box){const age=(Date.now()-new Date(box?.observed_at).getTime())/3600000;return Boolean(box?.stale||age>24);}
function taskCard(task){
  const status={suggested:'Suggestion',ready:'À faire',waiting:'En attente',done:'Terminé',dismissed:'Écarté'}[task.status]||task.status;
  const sources=(task.sources||[]).map(s=>s.kind==='message'&&!s.archived?`<button class="task-source" data-message="${esc(s.id)}">${sourceIcon(s.source)}<span>${esc(s.title)}</span></button>`:url(s.url)?`<a class="task-source" href="${esc(url(s.url))}" target="_blank" rel="noreferrer">${sourceIcon(s.source)}<span>${esc(s.title)}${s.archived?`<small>Capture du ${esc(date(s.observed_at))}</small>`:''}</span></a>`:'<span class="subtle">Source absente de cette capture</span>').join('');
  const button=(target,label,primary=false)=>`<button class="${primary?'primary':'secondary'}" data-task="${esc(task.id)}" data-task-status="${target}" aria-label="${esc(label+' : '+task.title)}">${label}</button>`;
  const controls=task.status==='suggested'?button('ready','Ajouter',true)+button('dismissed','Écarter'):task.status==='done'||task.status==='dismissed'?button('ready','Rouvrir'):button('done','Terminer',true)+(task.status==='ready'?button('waiting','En attente'):button('ready','Reprendre'));
  return `<article class="task-row" data-task-id="${esc(task.id)}"><div class="task-heading"><h3>${esc(task.title)}</h3><span class="result-tag">${esc(status)}</span></div><p>${esc(task.reason)}</p><details><summary>Sources</summary><div class="task-sources">${sources}</div></details><div class="buttons">${controls}<button class="text-button" data-edit-task="${esc(task.id)}" aria-label="${esc('Ajuster : '+task.title)}">Ajuster</button></div></article>`;
}
function renderWorkspace(){
  const workspace=state?.workspace||{},tasks=workspace.tasks||[],active=tasks.filter(t=>!['done','dismissed'].includes(t.status)),closed=tasks.filter(t=>['done','dismissed'].includes(t.status));
  $('#tasks-count').textContent=active.length?`${active.length} en suivi`:'';
  $('#home-tasks').innerHTML=active.length?active.slice(0,3).map(taskCard).join('')+(active.length>3?`<details><summary>${active.length-3} autres actions</summary>${active.slice(3).map(taskCard).join('')}</details>`:''):'<p class="empty">Ton suivi est libre. Le prochain briefing pourra proposer des actions avec leurs sources.</p><button class="text-button" data-prompt="brief">Préparer mon briefing'+icon('chevron')+'</button>';
  $('#task-history').hidden=!closed.length;$('#closed-tasks').innerHTML=closed.map(taskCard).join('');
  const calendar=workspace.calendar||{};const events=(calendar.events||[]).filter(e=>{const end=e.end.length===10?new Date(e.end+'T00:00:00+02:00'):new Date(e.end);return end.getTime()>Date.now();}).sort((a,b)=>a.start.localeCompare(b.start));
  const when=e=>e.start.length===10?new Date(e.start+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})+' · Toute la journée':date(e.start);
  $('#home-agenda').innerHTML=calendar.available?`${events.length?events.slice(0,3).map(e=>`<article class="agenda-event" data-event-id="${esc(e.id)}"><span class="agenda-date">${esc(when(e))}</span><h3>${esc(e.summary)}</h3>${e.location?`<p>${esc(e.location)}</p>`:''}${url(e.web_link)?`<a class="text-button" href="${esc(url(e.web_link))}" target="_blank" rel="noreferrer">Voir le rendez-vous${icon('external')}</a>`:''}</article>`).join(''):'<p class="empty">Aucun rendez-vous à venir dans cette capture.</p>'}<details class="agenda-coverage"><summary class="${oldCapture(calendar)?'warning':''}">Capture du ${esc(date(calendar.observed_at))}${oldCapture(calendar)?' · À renouveler':''}</summary><p>${esc(calendar.coverage)}</p><p>${esc(date(calendar.window_start))} au ${esc(date(calendar.window_end))}${calendar.has_more?' · Résultats paginés, incomplets':''}</p></details>`:'<p class="empty">Aucune capture de ton agenda principal.</p>';
}
function proofLabel(kind){return ({'agent.run':'Conversation avec outils','studio.inspect':'Session Ableton inspectée','studio.live.read':'Set ouvert consulté','approved.memory':'Souvenir enregistré','approved.midi':'Fichier MIDI créé','approved.reply':'Brouillon validé','inbox.read':'Conversation consultée','inbox.sync':'Capture des messages','routine.studio-inventory':'Inventaire du studio'})[kind] || kind;}
function piano(p){
  if(!p.notes?.length)return '';
  const lo=Math.min(...p.notes.map(n=>n.pitch))-1,hi=Math.max(...p.notes.map(n=>n.pitch))+1,step=88/(hi-lo+1);
  const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  return `<div class="piano-wrap"><div class="piano-label"><span>${esc(p.bars)} mesures</span><span>${esc(p.tempo)} BPM</span></div><svg class="piano" viewBox="0 0 640 120" role="img" aria-label="${esc(p.notes.length)} notes du clip MIDI">${Array.from({length:p.bars+1},(_,i)=>`<path d="M${10+i*620/p.bars} 12V108" stroke="#647767"/><text x="${14+i*620/p.bars}" y="119" fill="#f3e1b3" font-size="10">${i<p.bars?i+1:''}</text>`).join('')}${p.notes.map(n=>`<rect x="${10+n.start/(p.bars*4)*620}" y="${12+(hi-n.pitch)*step}" width="${Math.max(2,n.duration/(p.bars*4)*620-2)}" height="${Math.max(3,step-2)}" rx="3" fill="#f1dc92"><title>${names[n.pitch%12]}${Math.floor(n.pitch/12)-1}, temps ${n.start+1}, durée ${n.duration}</title></rect>`).join('')}</svg></div>`;
}
function messageRow(item){const repeated=item.subject===item.sender;return `<button class="message-preview" data-source="${esc(item.source)}" data-message="${esc(item.id)}"><span class="message-icon">${sourceIcon(item.source)}</span><span class="message-copy"><span class="message-top"><span class="message-sender">${esc(item.sender || item.subject)}</span><span class="message-time">${esc(item.source==='gmail'?sourceName(item.source):item.timestamp || sourceName(item.source))}</span></span><span class="message-subject">${esc(repeated?item.excerpt || 'Ouvrir la conversation':item.subject || item.sender)}</span>${repeated?'':`<span class="message-excerpt">${esc(item.excerpt || 'Ouvrir la conversation')}</span>`}</span><span class="message-open">${icon('chevron')}</span></button>`;}
function exportCard(p){const target=download(p.receipt?.body?.download);return `<article class="proposal"><span class="result-tag">${icon('check')}Fichier créé</span><h3>${esc(p.payload.name)}</h3>${piano(p.payload)}<p class="subtle">${esc(p.payload.notes?.length || 0)} notes. Aucun changement dans le Set Ableton.</p>${target?`<a class="text-button" href="${esc(target)}" download>Télécharger le MIDI${icon('download')}</a>`:''}</article>`;}
function route(){
  const requested=location.hash.slice(1)||'home',name=labels[requested]?requested:'home';
  $$('.view').forEach(el=>el.hidden=el.id!==name);$$('nav a').forEach(el=>{const current=el.dataset.view===name;el.classList.toggle('active',current);if(current)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('#breadcrumb').textContent=labels[name];$('#breadcrumb-icon').innerHTML=icon({home:'home',assistant:'chat',inbox:'inbox',memory:'memory',studio:'music',connections:'connect',proof:'journal'}[name]);setMenu(false);
  if(activeView!==name){const moveFocus=Boolean(activeView&&state);window.DesireeMotion?.leave();$$('.view').forEach(view=>view.getAnimations({subtree:true}).forEach(a=>a.cancel()));activeView=name;window.scrollTo({top:0,behavior:'instant'});if(name==='home')homeEntrance();else if(window.DesireeMotion?.view)window.DesireeMotion.view($('#'+name));else motion($('#'+name),[{opacity:.4,transform:'translateX(12px)'},{opacity:1,transform:'translateX(0)'}]);if(moveFocus){const heading=$('#'+name+' h1');heading.tabIndex=-1;heading.focus({preventScroll:true});}window.dispatchEvent(new CustomEvent('desiree:view',{detail:name}));}
}
function renderHome(){
  const latest=(state.runs || []).find(r=>r.status==='completed'&&/brief/i.test(r.question));
  $('#brief-date').textContent=latest?date(latest.updated):'';
  if(latest){const text=clean(latest.answer),items=[...text.matchAll(/^\d+\.\s+(.+)$/gm)].slice(0,3).map(m=>m[1]);
    const limitation=text.match(/\*\*Couverture\s*:\*\*\s*(.+)/)?.[1];
    const actions=items.map(t=>{
      const title=t.match(/\*\*([^*]+)\*\*/)?.[1]||t.replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').split(/[.!?]/)[0].slice(0,100);
      const safe=url(t.match(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/)?.[2]),message=allMessages().find(m=>m.url===safe);
      const destination=message?`data-message="${esc(message.id)}"`:`data-run="${esc(latest.id)}"`;
      return `<li><button class="brief-action" ${destination} title="${message?'Voir le message lié à cette suggestion':'Voir le contexte dans le briefing'}"><span>${esc(title)}</span>${icon('chevron')}</button>${safe?`<a class="brief-source" href="${esc(safe)}" target="_blank" rel="noreferrer" aria-label="Ouvrir la source : ${esc(title)}">Source${icon('external')}</a>`:''}</li>`;
    }).join('');
    $('#brief-content').innerHTML=`${items.length?`<ol class="brief-actions">${actions}</ol>`:`<button class="brief-action" data-run="${esc(latest.id)}"><span>Ton dernier briefing</span>${icon('chevron')}</button>`}<div class="brief-footer"><details class="brief-coverage-toggle"><summary>Suggestions${limitation?', capture partielle':''}</summary><p class="brief-coverage">${limitation?inline(limitation):'Synthèse proposée par Désirée, à relire avec ses sources.'}</p></details><button class="text-button" data-run="${esc(latest.id)}">Le briefing complet</button></div>`;
  }else $('#brief-content').innerHTML='<p class="empty">Demandez votre premier briefing.</p>';
  const messages=allMessages(),linked=new Set((state.workspace?.tasks||[]).filter(t=>!['done','dismissed'].includes(t.status)).flatMap(t=>t.source_ids)),mail=messages.filter(i=>i.source==='gmail');
  const gmail=[...mail.filter(i=>linked.has(i.id)||linked.has(i.native_id)),...mail.filter(i=>!linked.has(i.id)&&!linked.has(i.native_id))].slice(0,2),whatsapp=messages.filter(i=>i.source==='whatsapp').slice(0,1);
  $('#home-messages').innerHTML=messages.length?`<div class="message-list">${[...gmail,...whatsapp].map(messageRow).join('')}</div>`:'<p class="empty">Reliez ou actualisez vos sources dans Connexions.</p>';
  $('#inbox-count').textContent=messages.length || '';
  const running=(state.runs || []).filter(r=>['running','queued'].includes(r.status)).length;$('#running-count').hidden=!running;$('#running-count').textContent=running;
  const clip=(state.proposals || []).find(p=>p.kind==='midi'&&p.status==='completed'&&download(p.receipt?.body?.download));
  const recent=state.catalog?.sets?.[0];
  $('#studio-preview').innerHTML=clip?`${piano(clip.payload)}<h3>${esc(clip.payload.name)}</h3><div class="studio-caption"><span>${esc(clip.payload.notes.length)} notes</span><span>MIDI créé</span></div><div class="studio-actions"><a class="text-button" href="#studio">Ouvrir le studio${icon('chevron')}</a><a class="icon-button" href="${esc(download(clip.receipt.body.download))}" download aria-label="Télécharger le MIDI" title="Télécharger le MIDI">${icon('download')}</a></div>`:recent?`<h3>${esc(recent.name)}</h3><p>${esc(date(recent.modified*1000))}</p><button class="text-button" data-set="${esc(recent.id)}">Lire la session${icon('chevron')}</button>`:'<p class="empty">Aucune session accessible.</p>';
  const goal=state.memories.find(m=>/600|positionnement|freelance/i.test(m.text)) || state.memories[0];
  $('#home-memory').innerHTML=goal?`<p>${esc(goal.text)}</p><details><summary>Origine de ce contexte</summary><p class="subtle">${esc(goal.source)}<br>${esc(date(goal.created))}</p></details>`:'<p class="empty">Ajoutez un objectif dans Mémoire.</p>';
  $('#home-sources').innerHTML=(state.inbox || []).map(box=>`<div class="health-row"><div class="health-label"><span>${sourceName(box.source)}</span><span class="${box.refresh_error?'warning':''}">${box.refresh_error?'À réactualiser':box.available?'Exemples fictifs':'Indisponible'}</span></div><small>${box.available?`Capture du ${esc(date(box.observed_at))}`:'Connexion à vérifier'}</small></div>`).join('')+`<div class="health-row"><div class="health-label"><span>Ableton</span><span>${state.catalog?.available?'Fichiers accessibles':'Inaccessible'}</span></div><small>${state.catalog?.sets?.length || 0} sessions enregistrées</small></div>`;
  const issues=(state.inbox||[]).filter(b=>b.refresh_error||!b.available).length;$('#source-summary').textContent=issues?`${issues} à vérifier`:'Captures partielles';$('#source-summary').classList.toggle('warning',issues>0);
  const suggestions=state.workspace?.tasks?.length?state.workspace.tasks.filter(t=>t.status==='suggested').length:latest?[...clean(latest.answer).matchAll(/^\d+\.\s+(.+)$/gm)].slice(0,3).length:0;
  $('#home-observation').textContent=suggestions?`${suggestions} suggestion${suggestions>1?"s":""} à examiner.`:'Je rassemble tes sources. Demande-moi un briefing.';
  const worlds={gmail:state.inbox.find(b=>b.source==='gmail'),whatsapp:state.inbox.find(b=>b.source==='whatsapp'),memory:{available:true,count:state.memories.length},studio:{available:Boolean(state.catalog?.available),count:state.catalog?.sets?.length||0}};
  for(const [key,world] of Object.entries(worlds)){const available=Boolean(world?.available);$(`[data-world="${key}"]`).dataset.available=String(available);$('#world-'+key).textContent=key==='gmail'||key==='whatsapp'?(world?.refresh_error||oldCapture(world)?'À réactualiser':available?world.backend==='codex_connector_snapshot'?`${world.items.length} mails capturés`:'Exemples fictifs':'À vérifier'):available?`${world.count} ${key==='memory'?'souvenirs':'sessions'}`:'À vérifier';$('#world-'+key).classList.toggle('warning',Boolean(world?.refresh_error||oldCapture(world)));}
  window.DesireeViewState={worlds:Object.fromEntries(Object.entries(worlds).map(([key,world])=>[key,{available:Boolean(world?.available),error:Boolean(world?.refresh_error)}])),running};
  window.dispatchEvent(new CustomEvent('desiree:state',{detail:window.DesireeViewState}));
  if(!homeEntered)homeEntrance();
}
function renderConversation(force=false){
  if(!state)return;
  const key=JSON.stringify([state.runs.map(r=>[r.id,r.updated,r.status,r.usage?.validation]),historyOpen,selectedRun]);if(key===runKey&&!force)return;runKey=key;
  const runs=selectedRun?state.runs.filter(r=>r.id===selectedRun):historyOpen?state.runs:state.runs.slice(0,1);
  $('#history-toggle').setAttribute('aria-expanded',String(historyOpen));$('#history-toggle').textContent=historyOpen?'Masquer l’historique':'Échanges précédents';
  queueMicrotask(renderReviewNotes);
  $('#conversation').innerHTML=runs.length?runs.map(r=>`<article class="answer"><p class="ask">${esc(r.question)}</p><div class="run-state"><span>${esc(statuses[r.status] || r.status)}</span><span>${esc(date(r.updated))}</span></div>${['queued','running'].includes(r.status)?'<div class="progress" aria-label="Réponse en préparation"></div>':''}<div class="response">${r.answer?rich(r.answer):`<p>${r.trace?.length?`${r.trace.length} appels d’outils enregistrés. La synthèse est en préparation.`:'Désirée prépare sa réponse…'}</p>`}</div>${r.trace?.length?`<details><summary>${r.trace.length} appels d’outils, sources et résultats</summary>${r.trace.map(t=>`<h3>${esc(t.tool)}</h3><pre>${esc(JSON.stringify(t.result,null,2))}</pre>`).join('')}</details>`:''}${r.usage?.seconds?`<p class="usage-note">${esc(r.usage.provider || '')}, exécution ${esc(r.usage.seconds)} s. Ce temps ne mesure pas un gain de temps humain.</p>`:''}</article>`).join(''):'<p class="empty">Posez une question pour commencer. Les outils utilisés et leurs résultats resteront consultables.</p>';
}
function renderReviewNotes(){
  const runs=selectedRun?state.runs.filter(r=>r.id===selectedRun):historyOpen?state.runs:state.runs.slice(0,1);
  $$('#conversation .answer').forEach((article,index)=>{
    const reason=runs[index]?.usage?.validation?.reason;
    if(!reason)return;
    const note=document.createElement('p');note.className='field-error';note.textContent=reason;
    article.querySelector('.run-state').after(note);
  });
}
function renderProposals(){
  const key=JSON.stringify(state.proposals);if(key===proposalKey)return;proposalKey=key;
  $('#proposal-title').textContent=state.proposals.some(p=>p.status==='pending')?'À examiner':state.proposals.some(p=>p.status==='needs_review')?'À vérifier':state.proposals.some(p=>p.status==='executing')?'En cours':state.proposals.some(p=>p.status==='completed')?'Résultats':'Propositions';
  $('#proposals').innerHTML=state.proposals.filter(p=>['pending','completed','needs_review','executing'].includes(p.status)).map(p=>p.status==='completed'&&p.kind==='midi'?exportCard(p):`<article class="proposal"><span class="result-tag">${p.status==='pending'?'À valider':p.status==='completed'?'Enregistré':p.status==='executing'?'En cours':'À vérifier'}</span><h3>${p.kind==='memory'?'Un souvenir à conserver':p.kind==='reply'?'Une réponse préparée':esc(p.payload.name)}</h3>${p.kind==='midi'?piano(p.payload):`<p>${esc(p.payload.text)}</p>`}<p class="subtle">${p.kind==='reply'?'Brouillon local. Aucun message envoyé.':p.kind==='midi'?'Crée un nouveau fichier MIDI. Le Set reste inchangé.':'Ajoute ce contexte à la mémoire.'}</p>${p.status==='pending'?`<div class="buttons"><button class="primary" data-approve="${esc(p.id)}">${p.kind==='midi'?'Créer le fichier MIDI':'Valider'}</button><button class="secondary" data-reject="${esc(p.id)}">Écarter</button></div>`:''}</article>`).join('') || '<p class="empty">Les réponses et idées à valider apparaîtront ici.</p>';
  $('#studio-exports').innerHTML=state.proposals.filter(p=>p.kind==='midi'&&p.status==='completed').map(exportCard).join('');
}
function renderMessages(){
  if(!state)return;
  const query=$('#inbox-search').value.toLocaleLowerCase('fr-FR');let count=0;
  $('#messages').innerHTML=(state.inbox || []).filter(box=>inboxFilter==='all'||box.source===inboxFilter).map(box=>{
    const items=(box.items || []).filter(i=>[i.sender,i.subject,i.excerpt].join(' ').toLocaleLowerCase('fr-FR').includes(query));count+=items.length;
    return `<section class="source-section"><div class="source-heading"><h2>${sourceIcon(box.source)}${sourceName(box.source)} <span class="source-count">${items.length}</span></h2><button class="secondary" data-sync="${esc(box.source)}">${box.backend==='codex_connector_snapshot'?'Relire la capture':'Actualiser '+sourceName(box.source)}</button></div><details class="source-coverage"><summary><span>${box.available?`Capture partielle du ${esc(date(box.observed_at))}`:'Source indisponible'}</span>${box.refresh_error||oldCapture(box)?'<span class="warning">À actualiser</span>':''}</summary><p>${esc(box.available?coverage(box):box.reason || 'Source indisponible.')}${box.refresh_error?` Dernier essai échoué : ${esc(box.refresh_error)} La capture précédente est conservée.`:''}${box.backend==='codex_connector_snapshot'?' Pour renouveler cette observation, demande à Codex une nouvelle lecture Gmail.':''}</p></details>${items.length?`<div class="message-list">${items.map(i=>messageRow({...i,source:box.source,captured:box.observed_at})).join('')}</div>`:'<p class="empty">Aucun échange correspondant dans cette capture.</p>'}</section>`;
  }).join('') || '<p class="empty">Aucune source présente. Consultez Connexions.</p>';
}
function renderMemories(){if(!state)return;const items=state.memories.filter(m=>memoryFilter==='all'||m.domain===memoryFilter);$('#memory-count').textContent=`${items.length} souvenirs`;$('#memories').innerHTML=items.map(m=>`<article class="memory-card" data-domain="${esc(m.domain)}"><span class="domain">${icon(m.domain==='studio'?'music':m.domain==='work'?'brief':'memory')}${esc(domains[m.domain] || m.domain)}</span><p>${esc(m.text)}</p><small>${esc(m.source)}<br>${esc(date(m.created))}</small></article>`).join('') || '<p class="empty">Aucun souvenir dans ce domaine. Vous pouvez en ajouter ci-dessus.</p>';}
function renderSets(){if(!state)return;const query=$('#set-search').value.toLocaleLowerCase('fr-FR'),items=(state.catalog?.sets || []).filter(s=>s.name.toLocaleLowerCase('fr-FR').includes(query));$('#set-count').textContent=state.catalog?.sets?.length || 0;$('#sets').innerHTML=items.map(s=>`<button class="set ${s.id===selectedSet?'selected':''}" data-set="${esc(s.id)}"><span>${esc(s.name)}<small>${esc(date(s.modified*1000))}</small></span>${icon('chevron')}</button>`).join('') || `<p class="empty">${esc(state.catalog?.reason || 'Aucune session correspondante.')}</p>`;}
function renderSession(report){
  if(!report){$('#session-detail').innerHTML=`<span class="result-tag">${icon('music')}Lecture des fichiers enregistrés</span><h2 class="session-title-empty">Choisissez une session.</h2><p class="session-subtitle">Pistes, appareils et repères, sans modifier votre fichier.</p><p class="footnote">Cette lecture n’est pas une écoute du son ni une évaluation du mix.</p>`;return;}
  const tracks=report.tracks || [],rows=tracks.map(t=>`<div class="track"><strong>${esc(t.name)}</strong><span>${esc(t.kind)}, ${Number(t.midi_clips || 0)+Number(t.audio_clips || 0)} clips</span></div>`);
  $('#session-detail').innerHTML=`<span class="result-tag">${esc(report.source?.creator || 'Ableton Live')}</span><h2 class="session-title">${esc(report.source?.filename?.replace(/\.als$/i,'') || 'Session')}</h2><p class="session-subtitle">Lecture du ${esc(date(report.observed_at))}, sans écoute audio.</p><div class="session-facts"><div><strong>${esc(report.tempo_bpm ?? 'Non lu')}</strong><span>BPM enregistrés</span></div><div><strong>${tracks.length}</strong><span>pistes</span></div><div><strong>${report.locators?.length || 0}</strong><span>repères</span></div></div><h3>Les repères</h3><div class="locator-list">${(report.locators || []).map(l=>`<span>${esc(l.name)}</span>`).join('') || '<span>Aucun repère enregistré</span>'}</div><h3>Les pistes</h3>${rows.slice(0,8).join('')}${rows.length>8?`<details><summary>Afficher les ${rows.length-8} autres pistes</summary>${rows.slice(8).join('')}</details>`:''}<p class="source-integrity ${report.set_unchanged?'':'warning'}">${icon(report.set_unchanged?'check':'journal')}${report.set_unchanged?'Source inchangée après lecture.':'La source a changé pendant la lecture.'}</p><details><summary>Empreinte et rapport de lecture</summary><pre>${esc(JSON.stringify(report,null,2))}</pre></details>`;
}
function renderConnections(){
  const calendar=state.workspace?.calendar||{};
  const boxes=state.inbox || [],entries=[{key:'claude',name:'Réponses',description:'Exemples pré-écrits. Aucun modèle IA appelé depuis cette démonstration.',status:'Scénario'},...boxes.map(b=>({key:b.source,name:sourceName(b.source),description:coverage(b),status:'Données fictives'})),{key:'studio',name:'Ableton, fichiers',description:'Rapports fictifs et fichier MIDI exemple téléchargeable. Aucun fichier personnel lu.',status:'Démonstration'},{key:'studio',name:'Ableton, Live',description:'Le pilotage de Live reste à raccorder dans le produit personnel.',status:'Non connecté'},{key:'tokens',name:'Claude Eats Tokens',description:'Le suivi de consommation reste à raccorder dans le produit personnel.',status:'Non connecté'},{key:'calendar',name:'Calendrier',description:calendar.coverage,status:'Données fictives'}];
  $('#connections-list').innerHTML=entries.map(({key,name,description,status,detail})=>`<article class="connection" data-source="${key}"><div class="connection-heading"><span class="source-emblem">${sourceIcon(key)}</span><h2>${esc(name)}</h2><span class="result-tag ${status==='À réactualiser'?'warning':''}">${esc(status)}</span></div><p>${esc(description)}</p>${detail?`<details><summary>Détails de la capture</summary><p>${esc(detail)}</p></details>`:''}${['gmail','whatsapp'].includes(key)?`<button class="text-button connection-link" data-open-source="${key}">Voir les messages${icon('chevron')}</button>`:key==='studio'?`<a class="text-button connection-link" href="#studio">Ouvrir le studio${icon('chevron')}</a>`:''}</article>`).join('');
  const routine=state.routines?.[0];$('#routine-enabled').checked=Boolean(routine?.enabled);$('#routine-detail').textContent=routine?.enabled?'Prochaine exécution au plus tôt : '+date(routine.next_at*1000):'Désactivé. Aucun inventaire récurrent lancé.';
}
function renderReceipts(){const opened=new Set($$('#receipts details[open]').map(d=>d.dataset.receipt));$('#receipts').innerHTML=state.receipts.map(r=>`<details class="receipt" data-receipt="${esc(r.id)}" ${opened.has(r.id)?'open':''}><summary><span>${esc(proofLabel(r.kind))}</span><small>${esc(date(r.created))}</small></summary><p>Empreinte SHA-256 du reçu : ${esc(r.sha256)}</p><pre>${esc(JSON.stringify(r.body,null,2))}</pre></details>`).join('') || '<p class="empty">Aucune action enregistrée pour le moment.</p>';}
async function refresh(){
  if(refreshing)return refreshing;
  refreshing=(async()=>{try{state=await api('state');$('#presence').textContent='Démonstration accessible';$('#presence-dot').classList.add('online');$('#connection-error').hidden=!state.workspace?.import_error;$('#connection-error').textContent=state.workspace?.import_error||'';renderHome();renderWorkspace();renderConversation();renderProposals();renderMessages();renderMemories();renderSets();renderConnections();renderReceipts();clearTimeout(pollTimer);if(state.runs.some(r=>['queued','running'].includes(r.status)))pollTimer=setTimeout(()=>refresh().catch(()=>{}),2000);}catch(error){$('#presence').textContent='Connexion interrompue';$('#presence-dot').classList.remove('online');$('#connection-error').hidden=false;$('#connection-error').textContent='Désirée ne répond pas. Les données affichées peuvent être anciennes. Relancez l’application sur cet ordinateur, puis actualisez.';clearTimeout(pollTimer);throw error;}finally{refreshing=null;}})();return refreshing;
}
async function submit(question,provider,parent){await api('chat',{question,provider,parent_id:parent || null});selectedRun=null;historyOpen=false;location.hash='assistant';$('#question').value='';$('#home-question').value='';$('#continue-last').checked=false;await refresh();}
function stage(question){$('#question').value=question;$('#continue-last').checked=false;selectedRun=null;renderConversation();location.hash='assistant';requestAnimationFrame(()=>$('#question').focus({preventScroll:true}));toast('Demande préparée. Relisez puis cliquez sur Demander.');}
function setMenu(open){const mobile=matchMedia('(max-width:760px)').matches;$('#rail').classList.toggle('open',mobile&&open);$('#rail').inert=mobile&&!open;$('#main').inert=mobile&&open;$('#mobile-menu').setAttribute('aria-expanded',String(mobile&&open));if(mobile&&open)$('#rail nav a').focus();}
function showDialog(id){const dialog=$('#'+id);dialogEpoch.set(dialog,(dialogEpoch.get(dialog)||0)+1);window.gsap?.killTweensOf(dialog);dialog.getAnimations().forEach(a=>a.cancel());dialog.classList.remove('dialog-leaving');if(!dialog.open)dialog.showModal();motion(dialog,id==='reader'?[{transform:'translateX(100%)'},{transform:'translateX(0)'}]:[{transform:'translateY(-22px) scale(.97)',opacity:.35},{transform:'translateY(0) scale(1)',opacity:1}],{duration:520});}
function closeDialog(id){const dialog=$('#'+id);if(!dialog.open)return Promise.resolve();const epoch=(dialogEpoch.get(dialog)||0)+1;dialogEpoch.set(dialog,epoch);dialog.getAnimations().forEach(a=>a.cancel());dialog.classList.add('dialog-leaving');const animation=motion(dialog,id==='reader'?[{transform:'translateX(0)'},{transform:'translateX(100%)'}]:[{transform:'translateY(0) scale(1)',opacity:1},{transform:'translateY(-12px) scale(.98)',opacity:0}],{duration:280});const finish=()=>{if(dialogEpoch.get(dialog)===epoch){dialog.close();dialog.classList.remove('dialog-leaving');}};if(!animation){finish();return Promise.resolve();}return animation.finished.catch(()=>{}).then(finish);}
function readerBody(item,result){
  $('#reader-meta').textContent=`${item.sender || ''} | ${item.timestamp || 'Date du message non fournie'}`;
  $('#reader-body').innerHTML=result?.available&&result.body?`<p class="reader-coverage">Texte consulté le ${esc(date(result.observed_at))}.</p><div class="reader-body-text">${esc(result.body)}</div><p class="reader-coverage">${esc(typeof result.coverage==='string'?result.coverage:coverage(result))}</p>`:`<div class="reader-preview"><p>${esc(item.excerpt || 'Aucun aperçu textuel.')}</p></div><p class="reader-coverage">Aperçu capturé le ${esc(date(item.captured))}. Le fil complet n’a pas été chargé dans ce lecteur.${result?.reason?' '+esc(result.reason):''}</p>`;
}
function openMessage(id){const item=allMessages().find(i=>i.id===id);if(!item){toast('Ce message ne figure plus dans la capture. Consulte sa source.',true);return;}readerItem=item;const serial=++readerSerial;$('#reader-source').innerHTML=`${sourceIcon(item.source)}<span>${esc(sourceName(item.source))}</span>`;$('#reader-title').textContent=item.subject || item.sender;readerBody(item,cachedMessage(id));const target=url(item.url);$('#reader-actions').innerHTML=`${target?`<a class="text-button" href="${esc(target)}" target="_blank" rel="noreferrer">Ouvrir la source</a>`:''}<button class="secondary" data-read-message="${esc(id)}">${id.startsWith('gmail:api:')?'Lire le message':'Lire le fil'}</button><button class="primary" data-reply="${esc(id)}">Préparer une réponse</button>`;showDialog('reader');if(item.detail_available&&!cachedMessage(id))api('tool',{name:'read_message',arguments:{message_id:id}}).then(result=>{if($('#reader').open&&serial===readerSerial)readerBody(item,result);}).catch(error=>{if($('#reader').open&&serial===readerSerial)toast(error.message,true);});}
async function inspectSet(id,button){return busy(button,async()=>{location.hash='studio';selectedSet=id;renderSets();$('#session-detail').innerHTML='<p class="busy-label">Lecture de la session enregistrée…</p>';try{inspected=await api('inspect',{set_id:id});renderSession(inspected);await refresh();motion($('#session-detail'),[{opacity:.4},{opacity:1}]);}catch(error){$('#session-detail').innerHTML=`<p class="warning">Lecture interrompue : ${esc(error.message)}</p><p class="footnote">Sélectionnez la session pour réessayer.</p>`;throw error;}});}
function search(){
  const query=$('#global-search').value.trim().toLocaleLowerCase('fr-FR');
  const candidates=[...(state?.workspace?.tasks||[]).filter(t=>!['done','dismissed'].includes(t.status)).map(t=>({kind:'task',id:t.id,title:t.title,body:t.reason,label:'Action proposée ou suivie',glyph:'check'})),...(state?.workspace?.calendar?.events||[]).map(e=>({kind:'agenda',id:e.id,title:e.summary,body:[e.start,e.location].join(' '),label:'Agenda principal',glyph:'calendar'})),...allMessages().map(i=>({kind:'message',id:i.id,title:i.subject || i.sender,body:[i.sender,i.excerpt].join(' '),label:sourceName(i.source),glyph:'inbox'})),...(state?.memories || []).map(m=>({kind:'memory',id:m.id,title:m.text,body:m.source,label:'Mémoire, '+(domains[m.domain] || m.domain),glyph:'memory'})),...(state?.catalog?.sets || []).map(s=>({kind:'set',id:s.id,title:s.name,body:'',label:'Session Ableton',glyph:'music'}))];
  const items=candidates.filter(i=>[i.title,i.body].join(' ').toLocaleLowerCase('fr-FR').includes(query)).slice(0,12);$('#search-results').innerHTML=items.map(i=>`<button class="search-result" data-search-kind="${i.kind}" data-search-id="${esc(i.id)}">${icon(i.glyph)}<span><small>${esc(i.label)}</small>${esc(i.title)}</span></button>`).join('') || '<p class="empty">Aucune correspondance dans les données présentes.</p>';
}
function theme(mode){document.documentElement.dataset.theme=mode;$('#theme-toggle').innerHTML=icon(mode==='dark'?'sun':'moon');$('#theme-toggle').setAttribute('aria-label',mode==='dark'?'Activer le mode clair':'Activer le mode sombre');window.dispatchEvent(new CustomEvent('desiree:theme',{detail:mode}));try{localStorage.setItem('desiree-material-theme',mode);}catch{}}

document.addEventListener('click',async event=>{
  const source=event.target.closest('[data-open-source]');
  if(source){$(`[data-world="${source.dataset.openSource}"]`).click();return;}
  const world=event.target.closest('[data-world]');
  if(world&&['gmail','whatsapp'].includes(world.dataset.world)){
    event.preventDefault();inboxFilter=world.dataset.world;$('#inbox-search').value='';
    $$('[data-inbox-filter]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.inboxFilter===inboxFilter)));
    renderMessages();location.hash='inbox';return;
  }
  const b=event.target.closest('button');
  if(!b){if(event.target.closest('#rail nav a,#rail .brand'))setMenu(false);else if($('#rail').classList.contains('open')&&!event.target.closest('#rail'))setMenu(false);return;}
  if(b.dataset.prompt){stage(prompts[b.dataset.prompt]);return;}
  if(b.dataset.run){selectedRun=b.dataset.run;historyOpen=false;renderConversation(true);location.hash='assistant';return;}
  if(b.dataset.message){openMessage(b.dataset.message);return;}
  if(b.dataset.close){await closeDialog(b.dataset.close);return;}
  if(b.hasAttribute('data-search')){showDialog('search-dialog');search();$('#global-search').focus();return;}
  if(b.dataset.inboxFilter){inboxFilter=b.dataset.inboxFilter;$$('[data-inbox-filter]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));renderMessages();return;}
  if(b.dataset.memoryFilter){memoryFilter=b.dataset.memoryFilter;$$('[data-memory-filter]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));renderMemories();return;}
  if(b.dataset.set){await inspectSet(b.dataset.set,b);return;}
  if(b.dataset.searchKind){$('#search-dialog').close();if(b.dataset.searchKind==='message')openMessage(b.dataset.searchId);else if(b.dataset.searchKind==='set')await inspectSet(b.dataset.searchId,b);else if(['task','agenda'].includes(b.dataset.searchKind)){location.hash='home';requestAnimationFrame(()=>{const target=$(`[${b.dataset.searchKind==='task'?'data-task-id':'data-event-id'}="${CSS.escape(b.dataset.searchId)}"]`);if(target){for(let p=target.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;target.scrollIntoView({block:'center',behavior:'auto'});target.querySelector('button,a')?.focus({preventScroll:true});}else toast('Cet élément ne figure plus dans les prochaines actions ou les rendez-vous à venir.');});}else{memoryFilter='all';$$('[data-memory-filter]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.memoryFilter==='all')));renderMemories();location.hash='memory';}return;}
  if(b.dataset.readMessage){const serial=readerSerial,item=readerItem;await busy(b,async()=>{b.innerHTML='<span class="busy-label">Lecture…</span>';const result=await api('tool',{name:'read_message',arguments:{message_id:item.id}});if($('#reader').open&&serial===readerSerial)readerBody(item,result);if(!result.available)toast(result.reason || 'Fil indisponible. La capture précédente est conservée.',true);await refresh();});return;}
  if(b.dataset.task){await busy(b,async()=>{const id=b.dataset.task,status=b.dataset.taskStatus;const result=await api('task',{id,status});await refresh();if(result.status!==status)throw Error('État non enregistré.');const next=$(`[data-task-id="${CSS.escape(id)}"] button[data-task]`);if(next?.getClientRects().length)next.focus({preventScroll:true});else{$('#tasks-title').tabIndex=-1;$('#tasks-title').focus({preventScroll:true});}toast('Suivi de l’action enregistré.');});return;}
  if(b.dataset.editTask){const task=state.workspace.tasks.find(t=>t.id===b.dataset.editTask);if(!task)return;$('#task-edit-id').value=task.id;$('#task-edit-title').value=task.title;$('#task-edit-reason').value=task.reason;showDialog('task-editor');$('#task-edit-title').focus();return;}
  if(b.dataset.reply){const item=readerItem;$('#reader').close();stage(`Prépare une réponse à ${item.sender}, dans ${sourceName(item.source)}. Lis d’abord le fil ${item.id} avec read_message. Vérifie l’auteur de chaque message et croise le contexte avec ma mémoire. Si le fil est indisponible, dis-le et ne présente pas un brouillon comme validé. Utilise propose_reply pour préparer un brouillon local, sans l’envoyer.`);return;}
  if(b.dataset.sync){await busy(b,async()=>{b.innerHTML='<span class="busy-label">Lecture…</span>';const result=await api('sync',{source:b.dataset.sync});await refresh();if(result.import_error||result.refresh_error||!result.available)toast('Lecture interrompue. '+(result.import_error || result.refresh_error || result.reason || '')+' La capture précédente est conservée.',true);else toast(result.backend==='codex_connector_snapshot'?'Capture Gmail relue. Sa date d’observation reste inchangée.':sourceName(b.dataset.sync)+' : nouvelle capture partielle enregistrée.');});return;}
  if(b.dataset.approve||b.dataset.reject){await busy(b,async()=>{const result=await api('approve',{id:b.dataset.approve || b.dataset.reject,accept:Boolean(b.dataset.approve)});await refresh();const expected=b.dataset.approve?'completed':'rejected';if(result.status!==expected){toast('Action non terminée. Consultez son état dans les propositions.',true);return;}toast(b.dataset.approve?'Validation enregistrée. Consultez le résultat et son reçu.':'Proposition écartée.');});return;}
});
$('#home-form').addEventListener('submit',event=>{event.preventDefault();if(!validateField($('#home-question'),'Écris une demande pour commencer.'))return;busy(event.submitter,()=>submit($('#home-question').value.trim(),'claude',null));});
$('#chat-form').addEventListener('submit',event=>{event.preventDefault();if(!validateField($('#question'),'Écris ta demande avant de continuer.'))return;const parent=$('#continue-last').checked?state?.runs.find(r=>r.status==='completed')?.id:null;busy(event.submitter,()=>submit($('#question').value.trim(),$('#provider').value,parent));});
$('#memory-form').addEventListener('submit',event=>{event.preventDefault();if(!validateField($('#memory-text'),'Ajoute une chose à retenir.'))return;busy(event.submitter,async()=>{const p=await api('propose',{kind:'memory',payload:{text:$('#memory-text').value.trim(),domain:$('#memory-domain').value}});const result=await api('approve',{id:p.proposal_id,accept:true});await refresh();if(result.status!=='completed'){toast('Enregistrement non terminé. Consultez la proposition avant de réessayer.',true);return;}$('#memory-text').value='';toast('Souvenir enregistré. Son origine reste visible dans la mémoire.');});});
$('#task-edit-form').addEventListener('submit',event=>{event.preventDefault();if(!validateField($('#task-edit-title'),'Précise l’action à suivre.')||!validateField($('#task-edit-reason'),'Précise la raison.'))return;busy(event.submitter,async()=>{await api('task/edit',{id:$('#task-edit-id').value,title:$('#task-edit-title').value.trim(),reason:$('#task-edit-reason').value.trim()});await closeDialog('task-editor');await refresh();toast('Action ajustée. Ses sources restent conservées.');});});
$('#live-read').addEventListener('click',event=>busy(event.currentTarget,async()=>{const r=await api('live',{});$('#live-state').textContent=r.available?'Set ouvert consulté. Le résultat est conservé dans le journal.':r.reason || 'Le pont ne répond pas. Chargez le module dans Ableton puis réessayez.';await refresh();}));
$('#routine-enabled').addEventListener('change',async event=>{event.target.disabled=true;try{await api('routine',{enabled:event.target.checked});await refresh();toast('Réglage de l’inventaire enregistré.');}catch(error){toast(error.message,true);await refresh().catch(()=>{});}finally{event.target.disabled=false;}});
$('#refresh').addEventListener('click',event=>busy(event.currentTarget,async()=>{await refresh();toast('Données de l’espace relues. Les sources externes n’ont pas été actualisées.');}));
$('#history-toggle').addEventListener('click',()=>{historyOpen=!historyOpen;selectedRun=null;renderConversation(true);});
$('#inbox-search').addEventListener('input',()=>state&&renderMessages());$('#set-search').addEventListener('input',()=>state&&renderSets());$('#global-search').addEventListener('input',search);
$('#mobile-menu').addEventListener('click',()=>setMenu(!$('#rail').classList.contains('open')));
$('#mobile-close').addEventListener('click',()=>{setMenu(false);$('#mobile-menu').focus();});
$('#theme-toggle').addEventListener('click',()=>theme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
window.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setMenu(false);showDialog('search-dialog');search();$('#global-search').focus();}if(event.key==='Escape'){const dialog=$$('dialog[open]').at(-1);if(dialog){event.preventDefault();closeDialog(dialog.id);}const open=$('#rail').classList.contains('open');setMenu(false);if(open)$('#mobile-menu').focus();readerSerial++;}if(event.key==='Tab'&&$('#rail').classList.contains('open')){const controls=[...$('#rail').querySelectorAll('a,button')].filter(el=>el.getClientRects().length),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
$('#reader').addEventListener('close',()=>readerSerial++);
$$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))closeDialog(dialog.id);}));
$$('form').forEach(form=>form.noValidate=true);
$$('textarea,input[type=text]').forEach(field=>field.addEventListener('input',()=>{if(field.hasAttribute('aria-invalid')&&field.value.trim())validateField(field,'');}));
reduced.addEventListener('change',()=>{if(reduced.matches)document.getAnimations().forEach(a=>{if(a.effect.getComputedTiming().endTime===Infinity)a.cancel();else a.finish();});});
window.addEventListener('hashchange',route);window.addEventListener('scroll',()=>$('.top').classList.toggle('scrolled',window.scrollY>12),{passive:true});
matchMedia('(max-width:760px)').addEventListener('change',()=>{$('#main').inert=false;setMenu(false);});
icons();try{theme(localStorage.getItem('desiree-material-theme')==='light'?'light':'dark');}catch{theme('dark');}
$('#today').textContent=new Date().toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long'});
const hour=Number(new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'numeric',hourCycle:'h23'}).format(new Date()));$('#home-title').innerHTML=`${hour>=18||hour<5?'Bonsoir':'Bonjour'} <span>Adam.</span>`;
route();renderSession(null);refresh().then(()=>{const saved=state.receipts.find(r=>r.kind==='studio.inspect');if(saved){inspected=saved.body;const name=inspected.source?.filename?.replace(/\.als$/i,'');selectedSet=state.catalog.sets.find(s=>s.name===name)?.id;renderSession(inspected);renderSets();}}).catch(error=>toast(error.message,true));
