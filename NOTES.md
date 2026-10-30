# NOTES DU PROJET NVG-TV (Companion)

Document de reprise du projet. À lire avant toute modification.

## 1. Vue d'ensemble

- **Site** : PWA statique (HTML + JavaScript, pas de framework), servie sur `https://app.nvg-tv.com`.
- **Application Android** : TWA qui ouvre le même site. Pas de code séparé.
- **Backend** : Supabase (projet `fxewefwwpowhnacrxfdp`) : base PostgreSQL, authentification, fonctions Edge.
- **Hébergement** : 1&1 IONOS, dossier `/APP` en SFTP. Le dossier WordPress à la racine de l'hébergement n'appartient pas à l'app : ne jamais y toucher.
- **Déploiement** : chaque `git push` sur `main` déclenche le workflow GitHub Actions `Deploy SFTP` (`.github/workflows/deploy.yml`), qui envoie les fichiers du dépôt dans `/APP`. Il ne supprime jamais rien côté serveur.

## 2. Fichiers principaux

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de toutes les pages (modules), menu, fenêtres (présence, notification, admin membre) |
| `app.js` | Démarrage, navigation entre modules (`showTab`), session, statut Twitch, bannière d'installation |
| `users.js` | Connexion, inscription, « Mon compte », panel admin des membres, notifications push |
| `events.js` | Calendrier, présence, logistique, création des événements (admin) |
| `catalog.js` | Catalogue de matériel (admin) |
| `games.js` | Propositions de jeux et bannières |
| `notifications.js` | Notifications (liste, lu / non lu, envoi admin) |
| `supabase-config.js` | URL du projet et clé publique (anon) |
| `sw.js` | Service worker (notifications push) |
| `manifest.json` | Manifest PWA |
| `Logos/` | Logos, icônes, photos de la boutique |
| `.github/workflows/deploy.yml` | Déploiement SFTP automatique |
| `.github/scripts/deploy_sftp.py` | Script de déploiement |
| `.well-known/assetlinks.json` | Vérification de l'application Android (TWA). Ne pas supprimer |

## 3. Base de données (Supabase, schéma `public`)

| Table | Contenu | Protection (RLS) |
|---|---|---|
| `nvg_users` | Profils (pseudo, grade, rôle, avatar, chaîne Twitch, `notif_baseline`) | **Active** |
| `nvg_events` | Événements, présences (`attendance` en JSON), `watch_mode`, `streams` | Active : lecture publique, création et suppression admin, mise à jour par les membres connectés (présences) |
| `nvg_games` | Propositions de jeux | Active : lecture publique, proposition et vote connectés, suppression admin |
| `nvg_notifications` | Notifications envoyées | Active : lecture publique, envoi et suppression admin |
| `nvg_notification_reads` | Notifications lues par utilisateur | **Active** |
| `nvg_subscriptions` | Abonnements push des appareils | Active : chacun ne voit et ne gère que ses propres abonnements (la fonction `send-push` utilise la clé de service) |
| `nvg_equipment_catalog` | Catalogue de matériel (`category`) | Active : lecture publique, écriture admin |

Fonctions et triggers :
- `nvg_is_admin()` : vrai si l'utilisateur connecté est admin (`role = 'admin'` ou rang Grand Jarl / Divinité).
- `nvg_protect_roles` (trigger) : bloque la modification du rang ou du rôle par un non-admin.
- `nvg_create_profile` (trigger sur `auth.users`) : crée le profil « Petit Viking » à chaque inscription.
- `nvg_admin_set_email(target, new_email)` : permet à un admin de changer l'e-mail de connexion d'un membre.

Fonction Edge `steam-header` : récupère la bannière d'un jeu (Steam ou image de partage de la page). Sans authentification particulière.
Fonction Edge `twitch-live` : statut et nombre de spectateurs de la chaîne NVG via l'API Twitch. Cache de 15 secondes. Utilise les secrets `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET`.
Fonction Edge `send-push` : envoie les notifications push. Déjà présente avant ce projet.

## 4. Secrets et accès (les valeurs ne sont PAS ici)

| Secret | Où il est stocké | Usage |
|---|---|---|
| Identifiants SFTP (hôte, utilisateur, mot de passe) | Secrets GitHub : `SFTP_HOST`, `SFTP_USER`, `SFTP_PASSWORD` | Déploiement |
| Client ID et Secret Twitch (application NVGTV) | Secrets Supabase : `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Fonction `twitch-live` |
| Jeton d'accès Supabase (Management API) | Variable d'environnement Windows `SUPABASE_ACCESS_TOKEN` | Administration de la base à distance |
| Clé publique (anon) | `supabase-config.js` | Normal : elle est publique par conception |
| Clé VAPID publique | `users.js` | Normal : elle est publique par conception |

**Ne jamais** mettre de mot de passe, de secret ou de clé `service_role` dans le dépôt.

## 5. Règles métier décidées

### Grades et rôles
- Grades : `Petit Viking` (défaut), `Viking` (staff), `Grand Jarl` (admin), `Divinité` (admin).
- Rôle `admin` ou `staff` en base, en plus du grade.
- Le compte `asterz` / `asterz@virtual-lan.fr` reçoit automatiquement le grade Divinité (voir `handleSuccessfulAuth` dans `app.js`).
- Les Petit Vikings (et visiteurs) ne voient pas le bouton de présence ni le nombre de participants.

### Événements
- **NVG** : événements sur plusieurs jours. Les 4 saisons (NVG Spring, Summer, Autumn, Winter) sont des catégories qui ne changent que le logo. Le titre affiché est toujours `[NVG]`.
- **Nieuwheim** : soirée en ligne, un seul jour, avec heure de départ. Titre `[Nieuwheim]`. Pas de sélection de matériel. L'inscription exige la case d'engagement (présence à l'heure sur Discord et sur le stream). Le bouton Enregistrer reste grisé tant qu'elle n'est pas cochée.
- Le choix de présence est différent selon la catégorie : **Covoiturage / Transport** pour NVG, **Pour la soirée** pour Nieuwheim.
- « Où regarder » : `à venir` (aucun), `chaîne NVG` (lien vers le module Live), `liste de streams`. Pour Nieuwheim, la liste de streams inclut automatiquement les participants qui ont choisi « Je stream » et renseigné leur chaîne.
- Cartes du calendrier : ratio 8:5, tailles proportionnelles à la carte (unités `cqi`), grille de 320 à 460 px.

### Catalogue et logistique
- Catégories : **Câblage** (les câbles ont une longueur et une couleur, choisies par le participant), **Interface audio** (casques et cartes son), **Interface vidéo**, **Périphérique PC**.
- Couleurs de câbles : noir, blanc, rouge, bleu, jaune, vert, gris, rose, orange. Longueurs : 1 à 20 m.
- Logistique : une icône par catégorie à droite de chaque matériel, et des filtres par catégorie.

### Notifications
- Lu / non lu enregistré en base (`nvg_notification_reads`). Les notifications antérieures à `notif_baseline` sont considérées comme lues.
- Activation des push : bannière après connexion (délai de 7 jours si refusée), et bouton dans « Mon compte » qui affiche l'état réel.
- Un abonnement par appareil (clé : endpoint).

### Live Twitch
- Statut via `twitch-live`, toutes les 30 secondes uniquement quand l'onglet est visible, et immédiatement au retour sur l'onglet.

### Menu
- Ordre : NVG en Live, Calendrier, Boutique, Propositions de jeux (Staff & Admin), Logistique (Admin), Administration (Admin).
- Sur téléphone : barre fixe en haut (logo, NVG-TV, profil), bouton ☰ fixe sous la barre, menu en panneau.

## 6. Procédure de déploiement

1. Modifier les fichiers dans le dépôt local.
2. `git add`, `git commit`, `git push origin main`.
3. Vérifier le workflow : `gh run list --repo AsterZKalhan/NVG-App --limit 1`.
4. Recharger le site avec Ctrl+F5 (le service worker peut garder l'ancienne version).

Pour modifier la base : passer par le SQL Editor de Supabase, ou par la Management API avec `SUPABASE_ACCESS_TOKEN`.
Pour déployer une fonction Edge : `curl` vers `/v1/projects/{ref}/functions/deploy?slug=...` (voir l'historique du projet).

## 7. Points à surveiller

- **Sécurité de la base** : toutes les tables sont protégées par des règles (RLS). Limite connue : tout membre connecté peut modifier la liste des participants de n'importe quel événement, et voter ou modifier un jeu (les règles ne vérifient pas la colonne modifiée). Pour aller plus loin, il faudrait un trigger qui limite la modification à la seule colonne `attendance`. Pour annuler les règles d'une table : `alter table public.<table> disable row level security;`.
- **Secrets exposés dans une conversation** : le secret Twitch et le mot de passe SFTP ont été écrits dans un échange. Les régénérer (console Twitch, IONOS) et mettre à jour les secrets GitHub et Supabase.
- **Dashlane sous Firefox** : le popup se ferme sur le champ e-mail. Ça ne se produit pas sur Chrome ni sur les autres sites. Problème d'extension, non résolu côté site.
- **Tailwind via CDN** : avertissement dans la console (usage en production non recommandé). Sans impact fonctionnel.
- **Lien de réinitialisation du mot de passe** : la « Site URL » dans Supabase doit être `https://app.nvg-tv.com`.
- **Compte de test** : `petitviking.test@nvg-test.fr` a été supprimé.
- **Abonnements push** : les anciens abonnements d'appareils restent en base jusqu'à réabonnement. Les erreurs d'envoi éventuelles viennent de là.
- **Photos boutique** : les versions transparentes (`*-transparent.png`) sont prêtes mais non utilisées.

## 8. Guide de modification (à lire avant de changer quelque chose)

### 8.1 Méthode de travail recommandée
- **Une modification = un commit**, avec un message clair. Ça permet d'annuler proprement (`git revert <commit>`) si un changement casse quelque chose.
- **Tester avant de pousser** : sur ordinateur (Chrome ou Firefox), puis sur téléphone après déploiement. Le déploiement se fait seul à chaque push sur `main`, donc un push cassé part directement en production.
- **Vérifier le déploiement** : `gh run list --repo AsterZKalhan/NVG-App --limit 1` (doit afficher `success`).
- **Après un déploiement**, toujours recharger avec Ctrl+F5, et sur téléphone fermer complètement la PWA ou vider les données du site (Chrome : `chrome://settings/siteData`).
- **Ne jamais pousser un fichier partiellement modifié** : vérifier `git status` et `git diff --ignore-cr-at-eol` avant chaque commit.

### 8.2 Pièges déjà rencontrés (à ne pas refaire)
- **Accents et PowerShell** : les accents passés dans une commande PowerShell peuvent être mal encodés. Pour écrire du texte avec accents, préférer l'outil d'édition (`edit`) ou écrire un fichier temporaire avec l'outil `write`, puis le lire dans PowerShell avec `[IO.File]::ReadAllText`. Pour les requêtes vers l'API Supabase, envoyer le corps en UTF-8 (`[Text.Encoding]::UTF8.GetBytes(...)`).
- **Accent grave (backtick)** dans une chaîne PowerShell entre guillemets doubles : il sert d'échappement. Utiliser `[char]96` ou des guillemets simples.
- **Fins de ligne** : les fichiers sont en CRLF sur le PC. Un remplacement sur plusieurs lignes doit en tenir compte (normaliser avant de comparer).
- **Remplacement multiple** : un texte identique peut exister à plusieurs endroits. Toujours vérifier le nombre d'occurrences avant de remplacer.
- **Sections cachées par défaut** : toutes les sections `tab-content` ont la classe `hidden` dans le HTML. Ne jamais enlever cette classe, sinon un module apparaît brièvement au chargement.
- **Surbrillance fixe du menu** : ne pas mettre de couleur de fond (`bg-white/10`, `text-white`) en dur sur un bouton du menu. La surbrillance est gérée par `showTab` ; une couleur fixe reste visible au chargement.
- **Position des éléments** : le bloc du compte (`userProfileBadge`) est en `fixed` sur mobile et `absolute` sur PC. Quand on change ses classes, vérifier le `top` (`md:top-auto`) et le `right`.
- **Cache du service worker** : `sw.js` ne met rien en cache (pas de `fetch`), mais le navigateur peut garder un ancien JavaScript. D'où le Ctrl+F5.
- **Lecture de l'adresse au démarrage** : `handleSuccessfulAuth` ouvre le calendrier à la fin. Le module demandé (`#nom`) est donc lu tout au début de `DOMContentLoaded` (variable `initialHash`).

### 8.3 Ajouter un nouveau module (page)
1. **HTML** (`index.html`) : ajouter une section dans `<main>` :
   `<section id="monmodule" class="tab-content hidden space-y-6"> ... </section>`
   La classe `hidden` est obligatoire.
2. **Menu** : ajouter un bouton dans `<nav id="mainNav">`, avec la classe `nav-btn` et `onclick="showTab('monmodule')"`. Pour un module réservé au staff ou aux admins, copier le modèle de `navGamesBtn` (classe `hidden` au départ, affiché par `app.js` selon `hasStaffRights` / `hasAdminRights`).
3. **Droits** : les règles d'accès par module sont dans `showTab` (`app.js`) : `games` (staff), `admin` et `logistics` (admin). Ajouter une condition ici si besoin.
4. **Données** : si le module affiche des données, créer une fonction de chargement, et l'appeler depuis `showTab` (comme `loadUsers` pour `admin`) ou depuis le module.
5. **Adresse** : `showTab` met à jour l'adresse (`#monmodule`) et rouvre le module après actualisation automatiquement.

### 8.4 Changer le design
- **Couleurs** : le site utilise Tailwind (CDN). Fond `#07090e`, cartes `#121722`, bordures `#1f293d`, accent rouge `red-600`, or `amber-500`. Garder ces couleurs pour rester cohérent.
- **Cartes d'événements** : style dans la balise `<style>` de `index.html` (classe `.event-card` et `.ec-*`). Les tailles sont proportionnelles à la carte (unités `cqi`) et plafonnées (`min(...)`). Le ratio est 8:5 (`aspect-ratio`). La grille (`.events-grid`) passe de 1 à plusieurs colonnes entre 320 et 460 px.
- **Notifications** : carte dans `notifications.js` (fonction `loadNotifications`, variable `htmlContent`). La liste admin compacte est `htmlCompact`.
- **Menu PC / mobile** : sur mobile (moins de 768 px), barre fixe en haut (`fixed top-0`), bouton ☰ fixe sous la barre, menu en panneau fixe. Sur PC (768 px et plus), colonne latérale `md:sticky md:h-screen`, et le bloc du compte en `md:absolute md:bottom-5`.
- **Toujours tester les deux tailles** : ordinateur et téléphone.

### 8.5 Modifier la base de données (Supabase)
- **Accès** : SQL Editor du tableau de bord, ou la Management API avec `SUPABASE_ACCESS_TOKEN` (voir section 6).
- **Nouvelle colonne** : `alter table public.<table> add column if not exists <nom> <type> ...` avec une valeur par défaut, pour ne pas casser les lignes existantes.
- **Nouvelle table** : activer la RLS (`alter table ... enable row level security`) **et** écrire les règles (`create policy`) dans la même opération. Une table sans RLS est accessible à tout le monde avec la clé publique.
- **Règles** : `public.nvg_is_admin()` sert à vérifier les admins. `auth.uid()::text` donne l'identifiant de l'utilisateur connecté (les identifiants de `nvg_users` sont des textes).
- **Tester une règle** avant de la garder : transaction de test avec `set local role authenticated` et `request.jwt.claims`, puis `raise exception` pour annuler. Vérifier aussi l'accès anonyme avec la clé publique (REST).
- **Revenir en arrière** : `alter table public.<table> disable row level security;` ou `drop policy`.

### 8.6 Fonctions Edge (serveur Supabase)
- Trois fonctions : `send-push` (notifications push, utilise la clé de service), `steam-header` (bannières de jeux), `twitch-live` (statut Twitch, cache 15 s).
- **Déployer ou mettre à jour** une fonction : fichier `index.ts` + `metadata.json` (`{"entrypoint_path":"index.ts","name":"<nom>","verify_jwt":true|false}`), puis `curl.exe` vers `https://api.supabase.com/v1/projects/<ref>/functions/deploy?slug=<nom>` en multipart (`metadata` et `file`). Voir l'historique pour la commande exacte.
- **Secrets** : `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` (dans Supabase, jamais dans le code).

### 8.7 Git : rappels
- Voir l'historique : `git log --oneline -20`.
- Annuler un commit déjà poussé : `git revert <hash>` puis `git push origin main` (ne pas réécrire l'historique de `main`).
- Récupérer les modifications faites sur GitHub avant de travailler : `git pull origin main`.
- Les modifications faites directement sur GitHub (par exemple l'ajout de photos) déclenchent aussi le déploiement.
- Ne jamais committer de secret : vérifier avec une recherche avant de pousser si besoin.
