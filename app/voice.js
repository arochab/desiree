(() => {
  const input=document.querySelector('#voice-input'),read=document.querySelector('#voice-brief');
  input.disabled=false;read.disabled=false;
  input.title='Voir la voix locale dans le guide. Aucun microphone ouvert ici.';
  input.querySelector('span').textContent='Voir la voix';
  read.textContent='Guide audio';
  [input,read].forEach(button=>button.addEventListener('click',()=>{location.href='../guide/Guide.html#voice';}));
  document.querySelector('#demo-reset').addEventListener('click',()=>window.DesireeDemo.reset());
})();
