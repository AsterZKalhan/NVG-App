// --- SESSION PARTAGÉE ENTRE LES ESPACES NVG ---
// Une même connexion sert sur app.nvg-tv.com, bot-discord.nvg-tv.com et
// letournoides9mondes.nvg-tv.com. Le jeton Supabase est conservé dans des
// cookies du domaine parent .nvg-tv.com au lieu du stockage local, qui est
// propre à chaque sous-domaine.
//
// - découpage en plusieurs cookies (la session dépasse souvent 4 Ko) ;
// - repli sur le stockage local si les cookies sont refusés ou hors production ;
// - migration transparente des sessions déjà enregistrées en stockage local.

(function () {
  'use strict';

  const COOKIE_DOMAIN = '.nvg-tv.com';
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 an
  const CHUNK_SIZE = 3000; // marge sous la limite de 4 Ko par cookie
  const MAX_CHUNKS = 12;

  function sharingEnabled() {
    const host = window.location.hostname;
    return window.location.protocol === 'https:' &&
      (host === 'nvg-tv.com' || host.endsWith('.nvg-tv.com'));
  }

  // Supabase utilise plusieurs clés (session, vérificateur PKCE…) : le nom du
  // cookie est dérivé de la clé pour ne pas les mélanger.
  function cookieName(key, suffix) {
    const base = String(key || 'session').replace(/[^A-Za-z0-9_-]/g, '_');
    return 'nvg_' + base + (suffix === undefined ? '' : '_' + suffix);
  }

  function readCookie(name) {
    const target = name + '=';
    const parts = document.cookie ? document.cookie.split('; ') : [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].indexOf(target) === 0) {
        try {
          return decodeURIComponent(parts[i].slice(target.length));
        } catch (_err) {
          return null;
        }
      }
    }
    return null;
  }

  function writeCookie(name, value) {
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; Domain=' + COOKIE_DOMAIN + '; Path=/; Max-Age=' + COOKIE_MAX_AGE +
      '; Secure; SameSite=Lax';
  }

  function eraseCookie(name) {
    document.cookie = name + '=; Domain=' + COOKIE_DOMAIN +
      '; Path=/; Max-Age=0; Secure; SameSite=Lax';
  }

  function eraseChunks(key) {
    eraseCookie(cookieName(key, 'n'));
    for (let i = 0; i < MAX_CHUNKS; i++) eraseCookie(cookieName(key, i));
  }

  function legacyGet(key) {
    try { return window.localStorage.getItem(key); } catch (_err) { return null; }
  }

  function legacySet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_err) { /* stockage indisponible */ }
  }

  function legacyRemove(key) {
    try { window.localStorage.removeItem(key); } catch (_err) { /* stockage indisponible */ }
  }

  function readShared(key) {
    const base = cookieName(key);
    const count = parseInt(readCookie(base + '_n') || '0', 10) || 0;
    if (count < 1 || count > MAX_CHUNKS) return null;
    let value = '';
    for (let i = 0; i < count; i++) {
      const chunk = readCookie(base + '_' + i);
      if (chunk === null) return null;
      value += chunk;
    }
    return value;
  }

  function writeShared(key, value) {
    eraseChunks(key);
    if (typeof value !== 'string' || !value) return false;
    const chunks = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE));
    if (chunks.length > MAX_CHUNKS) return false;
    const base = cookieName(key);
    for (let i = 0; i < chunks.length; i++) writeCookie(base + '_' + i, chunks[i]);
    writeCookie(base + '_n', String(chunks.length));
    // Vérifie que le navigateur a bien accepté les cookies avant de supprimer
    // la copie locale de la session.
    return readShared(key) === value;
  }

  window.NVG_SHARED_AUTH_STORAGE = {
    getItem(key) {
      if (sharingEnabled()) {
        const shared = readShared(key);
        if (shared !== null) return shared;
      }
      const legacy = legacyGet(key);
      if (legacy !== null && sharingEnabled() && writeShared(key, legacy)) {
        legacyRemove(key); // migration : la session locale rejoint le cookie partagé
      }
      return legacy;
    },
    setItem(key, value) {
      if (sharingEnabled() && writeShared(key, value)) {
        legacyRemove(key);
        return;
      }
      legacySet(key, value);
    },
    removeItem(key) {
      if (sharingEnabled()) eraseChunks(key);
      legacyRemove(key);
    }
  };
})();
