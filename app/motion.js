(() => {
  const g = window.gsap;
  if (!g) return;
  g.registerPlugin(window.ScrollTrigger);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  let paused = false, intro, scrollScene;
  try { paused = localStorage.getItem('desiree-motion-paused') === '1'; } catch {}
  const enabled = () => !reduce.matches && !paused;
  const stop = (root = document) => {
    for (const record of animations) if (root === document || root === record.el || root.contains(record.el)) record.tween.progress(1).kill();
  };
  function animate(el, frames, options = {}) {
    if (!el || !enabled()) return null;
    g.killTweensOf(el);
    let complete;
    const finished = new Promise(resolve => complete = resolve);
    const record = {el, tween:null};
    const normalize = frame => {
      const copy = {...frame};
      if (copy.translate) { copy.y = parseFloat(copy.translate.split(' ').at(-1)); delete copy.translate; }
      return copy;
    };
    record.tween = g.fromTo(el, normalize(frames[0]), {
      ...normalize(frames.at(-1)), duration:(options.duration || 440)/1000,
      delay:(options.delay || 0)/1000, ease:'power3.out',
      onComplete:() => { animations.delete(record); g.set(el,{clearProps:'transform,opacity,translate'}); complete(); },
      onInterrupt:() => { animations.delete(record); complete(); }
    });
    animations.add(record);
    return {finished,cancel:() => record.tween.kill()};
  }
  function home() {
    intro?.kill(); scrollScene?.kill();
    if (!enabled()) return;
    const title = document.querySelector('#home .page-heading'), composer = document.querySelector('#home-form');
    const doors = document.querySelectorAll('.world-doors a');
    intro = g.timeline({defaults:{duration:.8,ease:'power3.out'}});
    intro.fromTo(title,{y:18,opacity:0},{y:0,opacity:1,clearProps:'transform,opacity'},0)
      .fromTo(composer,{y:24,opacity:0,scale:.98},{y:0,opacity:1,scale:1,clearProps:'transform,opacity'},.12)
      .fromTo('.quick-actions button',{y:10,opacity:0},{y:0,opacity:1,stagger:.07,clearProps:'transform,opacity'},.32)
      .fromTo(doors,{y:18,opacity:0},{y:0,opacity:1,stagger:.075,clearProps:'transform,opacity'},.42)
      .fromTo('.home-grid',{y:24,opacity:0},{y:0,opacity:1,clearProps:'transform,opacity'},.38);
    const preview = document.querySelector('#studio-preview .piano');
    if (preview) intro.fromTo(preview.querySelectorAll('rect'),{scaleY:.05,opacity:0,transformOrigin:'50% 100%'},{scaleY:1,opacity:1,stagger:.045,duration:.6,clearProps:'transform,opacity'},.65);
    scrollScene = window.ScrollTrigger.create({trigger:'.home-hero',start:'top top',end:'bottom top',onUpdate:self => window.dispatchEvent(new CustomEvent('desiree:scroll',{detail:self.progress}))});
    window.ScrollTrigger.refresh();
  }
  function view(root) {
    if (!enabled()) return;
    animate(root.querySelector('.page-heading'),[{y:12,opacity:.45},{y:0,opacity:1}],{duration:560});
    const panels=[...root.querySelectorAll('.composer,.memory-form,.source-section,.memory-card,.library,.session-detail,.answer,.connection,.receipt')].slice(0,7);
    panels.forEach((panel,i)=>animate(panel,[{y:16,opacity:.55},{y:0,opacity:1}],{duration:620,delay:60+i*40}));
  }
  function publish() {
    document.documentElement.dataset.motion = enabled() ? 'on' : 'paused';
    const button = document.querySelector('#motion-toggle');
    if (button) {
      button.setAttribute('aria-pressed',String(paused));
      button.setAttribute('aria-label',paused ? 'Reprendre les animations' : 'Mettre les animations en pause');
      button.title = reduce.matches ? 'Mouvements réduits selon votre préférence système' : button.getAttribute('aria-label');
    }
    if (!enabled()) { intro?.progress(1).kill(); scrollScene?.kill(); stop(); }
    window.dispatchEvent(new CustomEvent('desiree:motion',{detail:enabled()}));
  }
  document.addEventListener('click',event => {
    if (event.target.closest('#motion-toggle')) {
      paused = !paused;
      try { localStorage.setItem('desiree-motion-paused',paused ? '1' : '0'); } catch {}
      publish();
    }
  });
  reduce.addEventListener('change',publish);
  document.addEventListener('DOMContentLoaded',publish,{once:true});
  window.DesireeMotion = {animate,home,view,enabled,leave:root => {stop(root); intro?.progress(1).kill(); scrollScene?.kill();},version:g.version};
})();
