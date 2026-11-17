# Performance du site du Tournoi des 9 Mondes

Ce document recense ce qui pèse aujourd'hui au chargement, et les pistes classées
par gain attendu. Les tailles sont celles des fichiers du dépôt (non compressés).

## Mesures (fichiers du dépôt)

| Fichier | Taille | Remarque |
|---|---|---|
| `tournoi-site/Logos/no-logo.jpeg` | 12 Ko | image par défaut (256 px) |
| `tournoi-site/Logos/logo-9mondes.webp` | 28 Ko | logo principal (WebP 600 px) |
| `tournoi-site/Logos/logo-nvg.png` | 188 Ko | repli de l'entête |
| `tournoi-site/Logos/favicon.png` | 38 Ko | |
| `tournoi-site/tournament.js` | 257 Ko | source lisible ; minifié au déploiement |
| `tournoi-site/index.html` | 65 Ko | |
| `tournoi-site/auth-shared.js` | 4 Ko | |

Scripts chargés depuis des CDN (non mesurés ici) :
- `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0` : version épinglée, chargée
  en `defer` (plus de blocage du rendu).

## Données chargées au démarrage

`loadPublic()` fait 5 requêtes à chaque chargement : jeux, tournois, inscriptions publiques,
équipes publiques, et les matchs (avec la liste des colonnes utiles). Les matchs grossissent
avec chaque tournoi : ils sont tous chargés sur le site, alors qu'on n'en regarde qu'un. Piste
restante : ne les charger qu'à l'ouverture d'une fiche.

`loadAdmin()` ajoute jusqu'à 500 inscriptions, 1 000 comptes, 500 équipes avec leurs membres
et 2 000 participations. Il est déclenché à chaque action admin.

## État d'avancement

- **Fait** : logo principal converti en WebP 600 px (1,8 Mo → 29 Ko) ; image par défaut
  `no-logo.jpeg` ramenée à 256 px (2,7 Mo → 12 Ko). Références mises à jour.
- **Fait** : CSS précompilé. Le compilateur Tailwind du CDN est retiré ; le workflow
  `deploy-tournament.yml` compile `tournoi-site/tailwind.css` (Tailwind 3.4.17, configuration
  dans `tournoi-site/tailwind.config.js`) avant l'envoi. Si la compilation échoue, rien n'est
  déployé. En local, sans Node, le site s'affiche sans style : le CSS n'existe qu'après
  compilation.
- **Fait** : versions épinglées. Le SDK Supabase est chargé en `2.119.0` (au lieu de `@2`),
  avec `defer` sur les scripts du site et de l'application : le téléchargement ne bloque plus
  l'affichage. L'ordre des scripts est conservé (`defer` respecte l'ordre du document).
- **Fait** : minification au déploiement. `terser@5` minifie `tournoi-site/tournament.js`
  (≈ 257 Ko → ≈ 120 Ko) et tous les scripts de l'application (`*.js` à la racine, sauf
  `sw.js`) avant l'envoi SFTP. Le dépôt garde les sources lisibles ; `node --check` valide
  chaque fichier minifié. Les noms globaux sont conservés (pas de `--mangle toplevel`), car
  les `onclick` des pages les appellent.
- **Fait** : moins de données au démarrage. Les matchs sont lus avec la liste des colonnes
  utiles (au lieu de `*`), et l'onglet tournoi de l'application ne demande que les matchs des
  tournois publiés (`.in('tournament_id', …)`).
- **Reste** : compression gzip côté hébergement, réduction des listes admin (pagination ou
  recherche serveur), rendu ciblé après action.

## Mesures en production (17 novembre 2026)

Relevé Chrome (cache vidé, réseau réel), en Ko transférés :

| Page | Total | Scripts | CSS | Images | Requêtes |
|---|---|---|---|---|---|
| Site du tournoi | 352 | 245 | 26 | 40 | 19 |
| Application | 540 → 411 | 148 | 1 → 28 | 307 → 185 | 30 |

- **Hébergement sans compression** : le serveur (Apache) envoie `tournament.js` brut
  (197 Ko). Avec gzip, le même fichier ferait environ 50 Ko. C'est le plus gros gain
  restant, mais il se règle côté hébergement (option de compression du panneau, ou
  `.htaccess` avec `mod_deflate`) et non dans le dépôt.
- **Application** : `logo-nvg.png` était affiché à 200 px maximum mais servi en 1983×1692
  (188 Ko) ; ramené à 400 px (67 Ko). `favicon.png` (512 px, 59 Ko) ramené à 180 px (25 Ko).
- **Application** : le compilateur Tailwind du CDN (≈ 398 Ko, non compté dans la mesure
  ci-dessus car bloqué par le poste de test) est remplacé par `tailwind.css` compilé
  (28 Ko). Il n'y a plus de compilation CSS dans le navigateur.

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
