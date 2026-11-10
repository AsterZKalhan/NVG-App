# NVG Companion — Normandy Viking Gaming

Application compagnon des événements Normandy Viking Gaming.
PWA statique servie sur **https://app.nvg-tv.com**, empaquetée en application Android
via **TWA (Trusted Web Activity)**.

Le dépôt contient aussi l'espace de gestion du bot Discord, servi sur
**https://bot-discord.nvg-tv.com** (dossier `bot-site/`, déployé dans `/BOT`).

- Backend : Supabase (projet partagé, non versionné ici)
- Push : `sw.js` + Edge Function `send-push`
- Package Android : `com.nvg.companion`

## Principe important

L'application Android **ne contient pas le code du site**. Elle ouvre directement
`https://app.nvg-tv.com`. Ce dépôt est donc la source de vérité du site : toute
modification poussée ici doit être déployée sur l'hébergement pour être visible
dans l'app.

## Structure

```
/                     → racine du site (doc root)
├── index.html
├── app.js
├── events.js / catalog.js / games.js / notifications.js / users.js / videos.js
├── contact.js         → boîte de réception admin des messages de contact
├── contact-form.js    → formulaire public de contact
├── supabase-config.js
├── manifest.json
├── sw.js
├── Logos/
├── contact.html       → formulaire de contact public
├── privacy.html      → page publique obligatoire pour le Play Store
├── bot-site/          → espace de gestion du bot Discord (déployé dans /BOT)
├── .well-known/
│   ├── assetlinks.json   → vérification du domaine pour le TWA
│   └── .htaccess         → force le bon Content-Type (Apache)
├── .nojekyll         → nécessaire uniquement si hébergé sur GitHub Pages
└── docs/
```

## Déploiement

1. Commit + push sur GitHub.
2. Synchronisation des fichiers vers l'hébergement (FTP ou GitHub Actions).
   Le workflow `Deploy SFTP` envoie l'application dans `/APP` ; le workflow
   `Deploy bot SFTP` envoie uniquement `bot-site/` dans `/BOT`.
3. Vérifier `https://app.nvg-tv.com/.well-known/assetlinks.json` → doit répondre
   **HTTP 200** avec `Content-Type: application/json`.
4. Vérifier `https://bot-discord.nvg-tv.com/` → doit répondre **HTTP 200**.

## Règles

- Ne jamais committer de keystore ni de clé `service_role`.
- `supabase-config.js` contient la clé `anon`, publique par conception : ne pas y
  mettre autre chose.
- Ne pas modifier les fichiers métier (`events.js`, `users.js`, …) pour l'empaquetage Android.

## Documentation

- `NOTES.md` — architecture, base de données, règles métier, procédures et pièges.
- `DEPLOIEMENT.md` — mise en ligne, vérifications et retour arrière.
- `.github/docs/session-2026-11-02.md` — journal détaillé de la session du
  2 novembre 2026 (Vidéos, contact, confidentialité, nettoyage des notifications).
- `.github/docs/session-2026-11-10.md` — journal de la session du 10 novembre 2026
  (bot Discord, commandes, annonces, espace de gestion).
- `.github/docs/bot-site.md` — fonctionnement de `bot-discord.nvg-tv.com`, droits
  par serveur, configuration OAuth2 et déploiement.
- `.github/docs/propriete-intellectuelle.md` — marque, dessin et droit d'auteur,
  texte de mentions légales pour le site.
- `.github/docs/sauvegarde-supabase.md` — sauvegarde locale manuelle de Supabase
  (base, fonctions Edge, Storage, configuration) et restauration.
- `.github/edge-functions/` — code source des fonctions Edge.
- `.github/sql/` — SQL de référence pour la base (`nvg_contact_messages`,
  nettoyage des notifications live).
