# NVG Companion — Normandy Viking Gaming

Application compagnon des événements Normandy Viking Gaming.
PWA statique servie sur **https://app.nvg-tv.com**, empaquetée en application Android
via **TWA (Trusted Web Activity)**.

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
├── events.js / catalog.js / games.js / notifications.js / users.js
├── supabase-config.js
├── manifest.json
├── sw.js
├── Logos/
├── privacy.html      → page publique obligatoire pour le Play Store
├── .well-known/
│   ├── assetlinks.json   → vérification du domaine pour le TWA
│   └── .htaccess         → force le bon Content-Type (Apache)
├── .nojekyll         → nécessaire uniquement si hébergé sur GitHub Pages
└── docs/
```

## Déploiement

1. Commit + push sur GitHub.
2. Synchronisation des fichiers vers l'hébergement (FTP ou GitHub Actions).
3. Vérifier `https://app.nvg-tv.com/.well-known/assetlinks.json` → doit répondre
   **HTTP 200** avec `Content-Type: application/json`.

## Règles

- Ne jamais committer de keystore ni de clé `service_role`.
- `supabase-config.js` contient la clé `anon`, publique par conception : ne pas y
  mettre autre chose.
- Ne pas modifier les fichiers métier (`events.js`, `users.js`, …) pour l'empaquetage Android.
