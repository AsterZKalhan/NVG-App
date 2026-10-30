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
