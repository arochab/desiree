'use strict';

window.DesireeDemo = (() => {
  const key = 'desiree-public-demo-v1';
  const now = new Date().toISOString();
  const later = hours => new Date(Date.now() + hours * 3600000).toISOString();
  const mails = [
    {id:'gmail:api:demo001',sender:'Équipe projet',subject:'Point de vendredi',excerpt:'Deux décisions à préparer pour notre prochain point.',time:'09:00',detail_available:true},
    {id:'gmail:api:demo002',sender:'Organisation',subject:'Documents à relire',excerpt:'La synthèse du dernier échange est disponible.',time:'08:30',detail_available:false}
  ];
  const midi = {name:'Basse 01',tempo:127,bars:4,notes:Array.from({length:8},(_,i)=>({pitch:[45,48,52,48][i%4],start:i*2,duration:1,velocity:90}))};
  const initial = {
    mode:'demo',model:{},hub:{},
    catalog:{available:true,sets:[{id:'demo-set',name:'Atelier 01',modified:Date.now()/1000},{id:'demo-set-2',name:'Esquisse 02',modified:Date.now()/1000-86400}]},
    inbox:[{source:'gmail',available:true,backend:'demonstration',observed_at:now,coverage:'Exemples fictifs. Aucune connexion à Gmail.',items:mails},{source:'whatsapp',available:true,observed_at:now,coverage:'Exemple fictif. Aucune connexion à WhatsApp.',items:[{id:'whatsapp:demo001',sender:'Équipe atelier',subject:'Préparation du rendez-vous',excerpt:'Nous pouvons préparer les questions ensemble.',detail_available:false}]}],
    memories:[{id:'demo-memory',text:'Privilégier les réponses courtes, avec leurs sources.',domain:'personal',source:'Préférence fictive',created:now},{id:'demo-memory-2',text:'Réserver un créneau à la musique chaque semaine.',domain:'studio',source:'Préférence fictive',created:now}],
    workspace:{tasks:[{id:'demo-task',title:'Préparer le point de vendredi',reason:'Le message demande de préparer deux décisions. Relire le contexte avant de rédiger les questions.',status:'suggested',domain:'work',created:now,updated:now,source_ids:[mails[0].id],sources:[{id:mails[0].id,kind:'message',source:'gmail',title:mails[0].subject}]}],calendar:{available:true,observed_at:now,window_start:now,window_end:later(336),coverage:'Événements fictifs. Aucune connexion à Google Calendar.',events:[{id:'demo-calendar-1',summary:'Point projet',start:later(24),end:later(25),location:'Visioconférence'},{id:'demo-calendar-2',summary:'Créneau musique',start:later(48),end:later(50)}]}},
    runs:[{id:'demo-run',question:'Prépare mon briefing à partir des sources disponibles.',answer:'Exemple pré-écrit pour découvrir le parcours.\n\n1. Préparer les deux décisions du point projet.\n2. Relire les documents signalés.\n\nCes propositions reposent sur les messages fictifs de cette démonstration.',status:'completed',created:now,updated:now,usage:{provider:'Exemple pré-écrit'},trace:[{tool:'read_inbox',result:{source:'gmail',scenario:'fictif'}},{tool:'read_calendar',result:{scenario:'fictif'}}]}],
    proposals:[{id:'demo-midi',kind:'midi',status:'completed',payload:midi,receipt:{body:{download:'/api/brain/exports/bed5bfc8f1be4f4f.mid'}}}],receipts:[],routines:[{id:'studio-inventory',enabled:0}]
  };
  let data = structuredClone(initial);
  try { const saved = JSON.parse(localStorage.getItem(key)); if(saved?.version===1) { for(const name of ['memories','runs','proposals','receipts']) if(Array.isArray(saved[name])) data[name]=saved[name]; if(Array.isArray(saved.tasks)) data.workspace.tasks=saved.tasks; } } catch {}
  const save = () => { try { localStorage.setItem(key,JSON.stringify({version:1,memories:data.memories,runs:data.runs,proposals:data.proposals,receipts:data.receipts,tasks:data.workspace.tasks})); } catch {} };
  const id = () => 'demo-'+crypto.randomUUID();
  async function receipt(kind,body) {
    const sha = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body)));
    data.receipts.unshift({id:id(),kind,body:{scenario:'Démonstration publique, opération locale',...body},created:new Date().toISOString(),sha256:[...new Uint8Array(sha)].map(b=>b.toString(16).padStart(2,'0')).join('')});
    data.receipts=data.receipts.slice(0,30);save();
  }
  const find = (items,wanted) => { const item=items.find(x=>x.id===wanted); if(!item)throw Error('Élément absent du scénario. Réinitialisez la démonstration.'); return item; };
  async function call(path,body={}) {
    if(path==='state')return structuredClone(data);
    if(path==='tool') { if(body.name!=='read_message')throw Error('Outil absent de la démonstration.'); const message=[...mails,...data.inbox[1].items].find(x=>x.id===body.arguments?.message_id); if(!message)throw Error('Message absent du scénario.'); return {id:message.id,available:true,body:'Bonjour,\n\nPréparons deux décisions : la prochaine étape du projet et les questions encore ouvertes.\n\nCe message est un exemple fictif.',observed_at:now,source:'Démonstration publique'}; }
    if(path==='task') { const t=find(data.workspace.tasks,body.id); if(!['suggested','ready','waiting','done','dismissed'].includes(body.status))throw Error('État non reconnu.');t.status=body.status;t.updated=new Date().toISOString();await receipt('task.update',{id:t.id,status:t.status});return {id:t.id,status:t.status,changed:true}; }
    if(path==='task/edit') { const t=find(data.workspace.tasks,body.id);t.title=String(body.title).slice(0,140);t.reason=String(body.reason).slice(0,700);t.updated=new Date().toISOString();await receipt('task.edit',{id:t.id,title:t.title});return {id:t.id,status:t.status}; }
    if(path==='propose') { const proposal={id:id(),kind:body.kind,status:'pending',payload:body.payload};data.proposals.unshift(proposal);save();return {proposal_id:proposal.id}; }
    if(path==='approve') { const p=find(data.proposals,body.id);p.status=body.accept?'completed':'rejected';if(body.accept&&p.kind==='memory')data.memories.unshift({id:id(),text:String(p.payload.text).slice(0,2000),domain:p.payload.domain,source:'Saisie locale dans la démonstration',created:new Date().toISOString()});if(body.accept&&p.kind==='midi')p.receipt={body:{download:'/api/brain/exports/bed5bfc8f1be4f4f.mid'}};await receipt('approved.'+p.kind,{id:p.id,status:p.status});return {id:p.id,status:p.status}; }
    if(path==='chat') {
      const question=String(body.question||'').slice(0,2000);const music=/midi|basse|musique|ableton|session/i.test(question),reply=/réponse|répond/i.test(question);
      if(music)data.proposals.unshift({id:id(),kind:'midi',status:'pending',payload:structuredClone(midi)});
      if(reply)data.proposals.unshift({id:id(),kind:'reply',status:'pending',payload:{text:'Bonjour, je prépare les deux décisions et les questions ouvertes pour notre prochain point. À bientôt.'}});
      const answer='Exemple pré-écrit, aucun modèle IA appelé.\n\n'+(music?'Une proposition MIDI de démonstration attend votre validation. Le téléchargement contient le motif présenté. Aucune session Ableton ne sera modifiée.':reply?'Un brouillon fictif est proposé à droite. Sa validation reste locale et n’envoie aucun message.':'À partir du scénario : préparez les deux décisions du point projet, puis relisez les documents signalés. Vous pouvez suivre l’action et ouvrir son message source.');
      data.runs.unshift({id:id(),question,answer,status:'completed',created:new Date().toISOString(),updated:new Date().toISOString(),usage:{provider:'Exemple pré-écrit'},trace:[{tool:'demo_scenario',result:{type:'Réponse pré-écrite',external_calls:0}}]});data.runs=data.runs.slice(0,20);await receipt('agent.run',{scenario:'Réponse pré-écrite',external_calls:0});return {id:data.runs[0].id,status:'completed'};
    }
    if(path==='inspect') { const set=find(data.catalog.sets,body.set_id);const report={source:{creator:'Ableton Live, exemple fictif',filename:set.name+'.als'},observed_at:now,tempo_bpm:127,tracks:[{name:'Basse',kind:'MIDI',midi_clips:1},{name:'Batterie',kind:'MIDI',midi_clips:2},{name:'Texture',kind:'Audio',audio_clips:1}],locators:[{name:'Départ'},{name:'Développement'}],set_unchanged:true};await receipt('studio.inspect',{scenario:'Rapport fictif, aucun fichier ALS lu',set_id:body.set_id});return report; }
    if(path==='sync')return {available:false,reason:'Scénario fictif. Aucun compte personnel connecté.'};
    if(path==='live')return {available:false,reason:'Ableton Live reste privé et n’est pas connecté à cette démonstration.'};
    if(path==='routine')throw Error('Les routines restent privées. Aucun inventaire lancé depuis cette démonstration.');
    throw Error('Fonction disponible dans l’espace personnel uniquement. Consultez le guide vidéo.');
  }
  function reset() { data=structuredClone(initial);try{localStorage.removeItem(key);}catch{}location.reload(); }
  return {call,reset};
})();
