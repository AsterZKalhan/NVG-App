# Performance du site du Tournoi des 9 Mondes

Ce document recense ce qui pèse aujourd'hui au chargement, et les pistes classées
par gain attendu. Les tailles sont celles des fichiers du dépôt (non compressés).

## Mesures (fichiers du dépôt)

| Fichier | Taille | Remarque |
|---|---|---|
| `tournoi-site/Logos/no-logo.jpeg` | 2,7 Mo | image par défaut des équipes, beaucoup trop lourde |
| `tournoi-site/Logos/logo-9mondes.png` | 1,8 Mo | logo principal, affiché en haut de page |
| `tournoi-site/Logos/logo-nvg.png` | 188 Ko | repli de l'entête |
| `tournoi-site/Logos/favicon.png` | 38 Ko | |
| `tournoi-site/tournament.js` | 255 Ko | un seul fichier, non minifié |
| `tournoi-site/index.html` | 65 Ko | |
| `tournoi-site/auth-shared.js` | 4 Ko | |

Scripts chargés depuis des CDN (non mesurés ici) :
- `https://cdn.tailwindcss.com` : le compilateur Tailwind tourne **dans le navigateur**
  à chaque chargement de page. C'est probablement le plus gros coût.
- `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` : version majeure seulement,
  donc la version réellement chargée peut changer sans prévenir.

## Données chargées au démarrage

`loadPublic()` fait 5 requêtes à chaque chargement : jeux, tournois, inscriptions publiques,
équipes publiques, **tous les matchs** (sans limite). Les matchs grossissent avec chaque
tournoi, et ils sont tous chargés même si on ne regarde qu'un tournoi.

`loadAdmin()` ajoute jusqu'à 500 inscriptions, 1 000 comptes, 500 équipes avec leurs membres
et 2 000 participations. Il est déclenché à chaque action admin.

## Pistes, par gain attendu

1. **Remplacer le compilateur Tailwind du CDN par un CSS précompilé** (build à la publication,
   ou CSS committé). Supprime le coût de compilation à chaque visite.
2. **Redimensionner les images** : logo principal en WebP de quelques dizaines de Ko,
   image par défaut `no-logo` ramenée à ~256 px. Les téléversements de visuels de jeux et
   d'équipes doivent être réduits côté navigateur avant envoi (canvas, 512 px, WebP).
3. **Épingler la version de Supabase JS** (`@2.x.y`) et charger les scripts en `defer`.
4. **Minifier `tournament.js`** au déploiement (étape de build dans `Deploy tournoi SFTP`),
   et activer la compression gzip et le cache des fichiers statiques sur l'hébergement.
5. **Ne charger que ce qui est affiché** : matchs filtrés par tournoi ouvert, pagination
   ou recherche serveur pour les listes admin, colonnes limitées au strict nécessaire.
   Charger le détail admin seulement à l'ouverture d'un onglet.
6. **Rendu ciblé** : après une action, ne re-rendre que le bloc concerné au lieu de tout
   le panneau ; anti-rebond sur les champs de recherche.

## Méthode pour mesurer avant/après

- Chrome, onglet privé, cache vidé, Lighthouse (performance) sur la fiche d'un tournoi et
  sur le panneau admin.
- Noter : First Contentful Paint, Largest Contentful Paint, taille totale transférée,
  nombre de requêtes Supabase au démarrage.
- Refaire la mesure après chaque étape pour savoir ce qui a réellement gagné.
