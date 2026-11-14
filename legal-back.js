// --- RETOUR CONTEXTUEL DES PAGES LÉGALES ---
// Les mentions légales et la politique de confidentialité sont servies depuis
// app.nvg-tv.com, mais elles sont aussi liées depuis le Tournoi des 9 Mondes et
// l'espace bot Discord. Le lien « Retour » doit alors ramener à l'espace d'où
// l'on vient, et non à l'application NVG.
//
// L'origine est transmise par l'espace appelant dans le paramètre `from`
// (l'en-tête Referer ne contient que le domaine entre sous-domaines) ; à
// défaut, on se rabat sur le Referer. Le paramètre est conservé lors des
// allers-retours entre les deux pages légales.

(function () {
  'use strict';

  const APP_HOST = 'app.nvg-tv.com';

  const LABELS = {
    'letournoides9mondes.nvg-tv.com': 'Retour au Tournoi des 9 Mondes',
    'bot-discord.nvg-tv.com': 'Retour à l’espace du bot'
  };

  // N'accepte qu'une adresse HTTPS du domaine nvg-tv.com, hors application
  // elle-même : le paramètre d'URL ne doit jamais servir de redirection ouverte.
  function parseOrigin(raw) {
    if (!raw) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:') return null;
      if (!/(^|\.)nvg-tv\.com$/i.test(url.hostname)) return null;
      if (url.hostname === APP_HOST) return null;
      return url;
    } catch (_err) {
      return null;
    }
  }

  const params = new URLSearchParams(window.location.search);
  const origin = parseOrigin(params.get('from')) || parseOrigin(document.referrer);
  if (!origin) return;

  const backLink = document.querySelector('footer .back-link');
  if (backLink) {
    backLink.href = origin.href;
    backLink.textContent = '← ' + (LABELS[origin.hostname] || 'Retour à l’espace NVG');
  }

  // Conserve l'espace d'origine quand on passe d'une page légale à l'autre.
  document.querySelectorAll('a[href$="privacy.html"], a[href$="mentions-legales.html"]').forEach((link) => {
    const url = new URL(link.getAttribute('href'), window.location.href);
    if (url.hostname !== window.location.hostname) return;
    url.searchParams.set('from', origin.href);
    link.href = url.href;
  });
})();
