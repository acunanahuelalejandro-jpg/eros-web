(() => {
  'use strict';
  if (window.ErosPagina?.activa) { window.ErosPagina.redirigir(); return; }
  const root = document.createElement('section'); root.className = 'eros-pagina-estado';
  const heart = document.createElement('div'); heart.className = 'eros-pagina-corazon'; heart.textContent = '♡'; heart.setAttribute('aria-hidden','true');
  const title = document.createElement('h1'); title.textContent = 'Abrí el enlace de tu regalo';
  const text = document.createElement('p'); text.textContent = 'Usá el link completo o el QR que te compartieron.';
  root.append(heart,title,text); document.body.append(root);
})();
