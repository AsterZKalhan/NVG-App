# NOTES DU PROJET NVG-TV (Companion)

Document de reprise du projet. À lire avant toute modification.

## 1. Vue d'ensemble

- **Site** : PWA statique (HTML + JavaScript, pas de framework), servie sur `https://app.nvg-tv.com`.
- **Application Android** : TWA qui ouvre le même site. Pas de code séparé.
- **Backend** : Supabase (projet `fxewefwwpowhnacrxfdp`) : base PostgreSQL, authentification, fonctions Edge.
- **Hébergement** : 1&1 IONOS, dossier `/APP` en SFTP pour l'application et dossier `/BOT` pour l'espace du bot (`bot-discord.nvg-tv.com`). Le dossier WordPress à la racine de l'hébergement n'appartient pas à l'app : ne jamais y toucher.
- **Déploiement** : chaque `git push` sur `main` déclenche le workflow GitHub Actions `Deploy SFTP` (`.github/workflows/deploy.yml`), qui envoie les fichiers du dépôt dans `/APP`. Le workflow `Deploy bot SFTP` (`.github/workflows/deploy-bot.yml`) n'envoie que `bot-site/` dans `/BOT`. Aucun des deux ne supprime rien côté serveur.

## 2. Fichiers principaux

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de toutes les pages (modules), menu, fenêtres (présence, notification, admin membre) |
| `app.js` | Démarrage, navigation entre modules (`showTab`), session, statut Twitch, bannière d'installation |
| `users.js` | Connexion, inscription, « Mon compte », panel admin des membres, notifications push |
| `events.js` | Calendrier, présence, logistique, création des événements (admin) |
| `catalog.js` | Catalogue de matériel (admin) |
| `games.js` | Propositions de jeux et bannières |
| `streams.js` | Module « Streams NVG » (membres avec chaîne Twitch, statut en direct) |
| `videos.js` | Module « Vidéos » (dernières vidéos YouTube via la fonction `youtube-videos`) |
| `contact.html` | Page publique autonome du formulaire de contact (accessible sans compte) |
| `contact-form.js` | Logique du formulaire public (captcha, champs conditionnels, envoi à `contact-message`) |
| `contact.js` | Boîte de réception « Contact » du panneau admin (lecture, lu/non lu, réponse `mailto`, suppression) |
| `notifications.js` | Notifications (liste, lu / non lu, envoi admin) |
| `supabase-config.js` | URL du projet et clé publique (anon) |
| `sw.js` | Service worker (notifications push) |
| `manifest.json` | Manifest PWA |
| `Logos/` | Logos, icônes, photos de la boutique |
| `.github/workflows/deploy.yml` | Déploiement SFTP automatique de l'application (`/APP`) |
| `.github/workflows/deploy-bot.yml` | Déploiement SFTP de l'espace bot (`/BOT`) |
| `.github/scripts/deploy_sftp.py` | Script de déploiement |
| `.well-known/assetlinks.json` | Vérification de l'application Android (TWA). Ne pas supprimer |

## 3. Base de données (Supabase, schéma `public`)

| Table | Contenu | Protection (RLS) |
|---|---|---|
| `nvg_users` | Profils (pseudo, grade, rôle, avatar, chaîne Twitch, `notif_baseline`) | **Active** |
| `nvg_events` | Événements, présences (`attendance` en JSON), `watch_mode`, `streams` | Active : lecture publique, création et suppression admin, mise à jour par les membres connectés (présences) |
| `nvg_games` | Propositions de jeux, rattachées à `Nieuwheim` ou à un événement NVG (`target_type`, `event_id`), avec `comment` et `release_date` (texte, Nieuwheim uniquement) | Active : lecture publique, proposition et vote connectés, suppression admin |
| `nvg_notifications` | Notifications envoyées | Active : lecture publique, envoi et suppression admin |
| `nvg_notification_reads` | Notifications lues par utilisateur | **Active** |
| `nvg_subscriptions` | Abonnements push des appareils | Active : chacun ne voit et ne gère que ses propres abonnements (la fonction `send-push` utilise la clé de service) |
| `nvg_equipment_catalog` | Catalogue de matériel (`category`) | Active : lecture publique, écriture admin |
| `nvg_contact_messages` | Messages du formulaire de contact (identité, e-mail, objet, message, réseaux sociaux, `is_read`, `read_at`) | Active : **lecture, mise à jour et suppression réservées aux admins**. Aucune policy `INSERT` : l'écriture passe uniquement par l'Edge Function `contact-message` (clé de service) |

Fonctions et triggers :
- `nvg_is_admin()` : vrai si l'utilisateur connecté est admin (`role = 'admin'` ou rang Grand Jarl / Divinité).
- `nvg_protect_roles` (trigger) : bloque la modification du rang ou du rôle par un non-admin.
- `nvg_create_profile` (trigger sur `auth.users`) : crée le profil « Petit Viking » à chaque inscription.
- `nvg_admin_set_email(target, new_email)` : permet à un admin de changer l'e-mail de connexion d'un membre.
- `nvg_cleanup_live_notifications()` : supprime les notifications dont le titre est exactement `NVG est en live !` lorsqu'elles ont plus de 48 h, ainsi que les lignes correspondantes de `nvg_notification_reads`. Les autres notifications ne sont jamais touchées. Exécutée par le job `pg_cron` `nvg-cleanup-live-notifications` (`17 * * * *`, soit un décalage maximal de 48 h + 1 h). La colonne `time` étant du texte ISO, la fonction filtre d'abord avec `time ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'` pour ignorer les valeurs invalides. SQL : `.github/sql/cleanup-live-notifications.sql`.

Fonction Edge `steam-header` : récupère la bannière d'un jeu (Steam ou image de partage de la page). Sans authentification particulière.
Fonction Edge `twitch-live` : statut et nombre de spectateurs de la chaîne NVG via l'API Twitch. Cache de 15 secondes. Utilise les secrets `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET`.
- **twitch-eventsub** (Edge, sans JWT) : reçoit le passage en direct de la chaîne NVG (EventSub `stream.online`), vérifie la signature (secret `TWITCH_EVENTSUB_SECRET`), crée une notification (cible `TWITCH_NOTIFY_TARGET`, actuellement « Tous ») et l'envoie par push **uniquement pour la chaîne principale `nvgamingtv`**. Les lives des membres sont seulement annoncés sur Discord. Code source : `.github/edge-functions/twitch-eventsub/index.ts` (non déployé par SFTP). Abonnement créé auprès de Twitch (broadcaster 103197141). Pour restreindre l'envoi : changer le secret `TWITCH_NOTIFY_TARGET`.

Fonction Edge `send-push` : envoie les notifications push. Déjà présente avant ce projet.

Fonction Edge `youtube-videos` (sans JWT) : liste les dernières vidéos de la chaîne YouTube `@nvgamingtv` (`UC7WH5BSCYpme0_6NLBWiAiw`) via l'API publique de la page YouTube (Innertube, sans clé API), cache 10 minutes. Paramètre `?limit=` (1 à 20, 12 par défaut). Le flux RSS de cette chaîne renvoie 404, d'où cette méthode. Utilisée par `videos.js`.

Fonction Edge `contact-message` (sans JWT) : reçoit le formulaire public (`contact.html`). Le `GET` renvoie un défi anti-robot arithmétique signé (HMAC dérivé de `SUPABASE_SERVICE_ROLE_KEY`, valable 10 minutes). Le `POST` vérifie le défi, le honeypot `website`, les champs obligatoires, puis limite à 5 messages / 10 minutes par IP et 3 / heure par e-mail. Elle insère le message avec la clé de service (la table n'a **aucune** policy `INSERT`) et envoie un push aux admins (`Grand Jarl, Divinité`) via `send-push`, **sans** créer de ligne dans `nvg_notifications` (la lecture y est publique et le message contient des données personnelles). Code source : `.github/edge-functions/contact-message/index.ts`.

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
- **Nieuwheim** : soirée en ligne, un seul jour, avec heure de départ. Titre `[Nieuwheim]`. Pas de sélection de matériel. L'inscription exige la case d'engagement (présence à l'heure sur Discord et sur le stream). Le bouton Enregistrer reste grisé tant qu'elle n'est pas cochée. La vue **Logistique** masque aussi la section « Matériel apporté » et les filtres par catégorie pour ces événements.
- Le choix de présence est différent selon la catégorie : **Covoiturage / Transport** pour NVG, **Pour la soirée** pour Nieuwheim.
- « Où regarder » : `à venir` (aucun), `chaîne NVG` (lien vers le module Live), `liste de streams`. Pour Nieuwheim, la liste de streams inclut automatiquement les participants qui ont choisi « Je stream » et renseigné leur chaîne.
- Cartes du calendrier : ratio 8:5, tailles proportionnelles à la carte (unités `cqi`), grille de 320 à 460 px.
- **Démarrage** : l'onglet public est affiché avant la vérification de session. Les derniers événements connus sont relus depuis `localStorage` (`nvg_events_cache_v1`) pour un affichage immédiat, puis `loadEvents` rafraîchit depuis Supabase. Les chargements de départ (`renderAll`) sont lancés en parallèle.

### Catalogue et logistique
- Catégories : **Câblage** (les câbles ont une longueur et une couleur, choisies par le participant), **Interface audio** (casques et cartes son), **Interface vidéo**, **Périphérique PC**.
- Couleurs de câbles : noir, blanc, rouge, bleu, jaune, vert, gris, rose, orange. Longueurs : 1 à 20 m.
- Logistique : une icône par catégorie à droite de chaque matériel, et des filtres par catégorie.

### Notifications
- Lu / non lu enregistré en base (`nvg_notification_reads`). Les notifications antérieures à `notif_baseline` sont considérées comme lues.
- Activation des push : bannière après connexion (délai de 7 jours si refusée), et bouton dans « Mon compte » qui affiche l'état réel.
- Un abonnement par appareil (clé : endpoint).
- **Nettoyage automatique** : les notifications `NVG est en live !` disparaissent de l'historique 48 h après leur apparition (job `pg_cron` horaire, voir section 3). Les autres notifications restent.

### Streams NVG
- Liste des membres avec chaîne Twitch (`nvg_streamers`), triés en direct d'abord, puis par spectateurs et pseudo (`streams.js`). Le lecteur ne se recharge que lorsqu'on change de membre. Le lecteur utilise l'**API Embed JS de Twitch** (`loadTwitchPlayer`), ce qui permet de connaître l'état de lecture (`streamIsPlaying`, événements `PLAY` / `PAUSE` / `ENDED` / `OFFLINE`). Si l'API ne charge pas, une iframe classique sert de secours.
- **Mini-lecteur** : en quittant l'onglet Streams **alors que le flux joue**, la section reste affichée en bas à droite de l'application (classe `streams-pip-mode` sur `#streams`, voir `enterStreamsPip` / `exitStreamsPip` dans `streams.js`). Le flux continue sans rechargement, car le lecteur n'est pas déplacé. Il reprend sa place au retour sur l'onglet. Aucun mini-lecteur si le flux est en pause, arrêté, hors ligne ou bloqué ; s'il est mis en pause pendant le mini-lecteur, celui-ci se ferme (`leaveStreamsPipOnStop`). Le bouton ✕ (`closeStreamsPip`) met le flux en pause et ferme le mini-lecteur.
- Ce mini-lecteur est interne à l'application : les iframes Twitch ne peuvent pas utiliser le Picture-in-Picture natif du navigateur.

### Bot Discord « NVG Vikingbot »
- Configuration dans **Administration → 🤖 Bot Discord NVG** (admins uniquement). Le bot est invité avec les droits administrateur (`permissions=8`), puis chaque serveur reçoit ses annonces : cases à cocher par type et salon de destination (`nvg_discord_routes`).
- Types d'annonces : `live_nvg` (chaîne NVG), `live_member` (membres Viking, Grand Jarl, Divinité uniquement), `event_created`, `game_proposed`.
- Live instantané : `twitch-sync` abonne chaque chaîne éligible à `stream.online` (EventSub) ; `twitch-eventsub` relaie à `discord-bot`, qui vérifie l'éligibilité dans `nvg_streamers`. `twitch-sync` est appelée automatiquement toutes les 15 minutes par la tâche `pg_cron` `nvg-twitch-sync` (via `pg_net`). Elle n'accepte que le secret `TWITCH_SYNC_SECRET`, stocké aussi dans Supabase Vault (`twitch_sync_secret`). Un nouveau membre éligible est donc abonné dans les 15 minutes.
- Événements et propositions de jeux : l'application appelle `announce` après la création (`announceOnDiscord`, `discord-admin.js`). Les modifications ne republient rien.
- Journal `nvg_discord_posts` : un message n'est jamais publié deux fois sur le même salon.
- Commandes slash : `discord-interactions` (Interactions Endpoint URL du portail). `/nextevent` (prochain événement avec détails et bouton calendrier), `/events` (liste des prochains événements, une carte par événement avec le logo de la catégorie, 10 max), `/viking` (membres hors Petit Viking, pseudo cliquable vers la chaîne Twitch), `/live` (chaînes NVG en direct, pseudo cliquable, bouton vers Streams NVG). Signature Ed25519 vérifiée avec la clé publique (secret `DISCORD_PUBLIC_KEY`). Enregistrement via l'onglet « ⌨️ Enregistrer les commandes » (commandes globales, disponibles sur tous les serveurs du bot). Le bot reste hors ligne (pas de connexion Gateway), ce qui n'empêche pas les commandes.
- Mise en page des annonces : carte d'événement proche du calendrier (date en tête, titre `[NVG]` / `[Nieuwheim]`, logo de la saison, catégorie « Event NVG » ou « Nieuwheim », bouton « Voir dans le calendrier »). Annonce de jeu : logo de la catégorie et bouton « Va voter pour ce jeu » (`#games`). Annonce de live : titre, jeu, spectateurs, vignette et avatar via l'API Helix.
- Bouton « Quitter le serveur » dans la configuration : le bot quitte le serveur et ses routes sont supprimées (cascade). Piège Discord : ne pas envoyer `Content-Type: application/json` sur une requête sans corps (`DELETE`), sinon erreur 400 `invalid JSON` (code 50109). Le helper `discord()` de `discord-bot` ne l'ajoute que s'il y a un corps.
- Espace public de gestion : `https://bot-discord.nvg-tv.com/` (code dans `bot-site/`, déployé dans `/BOT`). Connexion avec le compte NVG, puis Discord OAuth2 (`identify guilds`). La fonction `discord-oauth` échange le code, filtre les serveurs où le membre est propriétaire ou a « Gérer le serveur », et remplit `nvg_discord_managers`. Un serveur sans le bot affiche le bouton d'invitation (avec le serveur présélectionné).
- Droits de l'espace : `discord-bot` vérifie chaque action (`list_channels`, `save_routes`, `leave_guild`) contre `nvg_discord_managers`, ou `nvg_is_admin` pour les admins NVG. Le navigateur ne décide jamais des droits. Les admins continuent de voir tous les serveurs du bot dans l'onglet admin de l'app.
- Configuration Discord : redirection OAuth2 `https://bot-discord.nvg-tv.com/` (slash final compris) et secret `DISCORD_OAUTH_SECRET` (client secret OAuth2, jamais dans le dépôt). Détail : `.github/docs/bot-site.md`.
- Journal détaillé : `.github/docs/session-2026-11-10.md`.
- Fonctions Edge : `discord-bot`, `discord-interactions`, `discord-oauth`, `twitch-sync`, `twitch-eventsub` (sans JWT : elles vérifient elles-mêmes l'accès). Le token du bot est dans le secret `DISCORD_BOT_TOKEN`, jamais dans le dépôt.

### Live Twitch
- Statut via `twitch-live`, toutes les 30 secondes uniquement quand l'onglet est visible, et immédiatement au retour sur l'onglet.

### Vidéos YouTube
- Le module « Vidéos » affiche les **3 dernières vidéos** publiées : la première est lue dans le lecteur intégré (YouTube nocookie), les trois vignettes sous le lecteur permettent de changer de vidéo sans quitter l'application. Quitter l'onglet **arrête la lecture** (`stopVideosPlayer`, appelée par `showTab`) ; au retour, la vidéo sélectionnée se recharge depuis le début.
- Sous le lecteur : titre, vues, date et bouton « Ouvrir sur YouTube ». En bas de page : bouton « Aller sur la page YouTube de la NVG ».
- **Mise à jour à la publication** : la fonction `youtube-videos` renvoie un `ETag` calculé uniquement à partir des identifiants des vidéos. Tant qu'aucune nouvelle vidéo n'est publiée, la réponse est `304` (0 octet) et l'affichage ne change pas, même si le nombre de vues évolue. Dès qu'une vidéo sort, l'`ETag` change et l'onglet se met à jour.
- Le navigateur garde les vidéos connues (`localStorage`, clé `nvg_youtube_videos_v2`) pour un affichage immédiat, et revérifie au maximum toutes les 5 minutes, à l'ouverture de l'onglet et au retour sur l'application.
- Bouton **« 🔄 Actualiser »** visible uniquement pour les admins (Grand Jarl, Divinité, `role = admin`), affiché par `handleSuccessfulAuth` (`app.js`, élément `videosRefreshBtn`). Il appelle `forceRefreshVideos()` : requête avec `refresh=1`, sans `If-None-Match`, ce qui ignore l'ETag et le cache serveur de 5 minutes. Retour visuel : « Vidéos actualisées », « Déjà à jour » ou « Échec ».
- **Pas de webhook YouTube** : le flux `feeds/videos.xml` de YouTube renvoie 404 (pour toutes les chaînes aujourd'hui), donc l'abonnement « nouvelle vidéo » (PubSubHubbub) n'est pas possible. La vérification `ETag` est la solution la plus proche, avec un coût réseau quasi nul.
- Si la chaîne change, seule la fonction est à modifier (constante `CHANNEL_ID`).

### Contact
- **Formulaire public** (`contact.html`, accessible sans compte) : Prénom, Nom, Pseudo (facultatif), e-mail de contact (obligatoire), Objet (Demande d'information / Recrutement streameur / Prise de contact / Suggestion).
- **Recrutement streameur** : la chaîne Twitch devient obligatoire, et Instagram, X, Discord et YouTube sont proposés en facultatif. Le message devient facultatif (présentation). Pour les autres objets, un simple message texte est obligatoire, sans limite de caractères (plafond technique de 50 000).
- **Aucun SMTP, aucun e-mail automatique** : le message est stocké dans `nvg_contact_messages` et consultable dans **Administration → 📥 Contact**. Les admins répondent avec le bouton « ✉️ Répondre » (`mailto:` vers l'adresse saisie, objet prérempli), ce qui ouvre le logiciel de messagerie par défaut (Outlook sur le PC d'Aster). Un message peut aussi être marqué lu / non lu ou supprimé.
- **Anti-spam** : captcha arithmétique signé côté serveur + honeypot + limites par IP et par e-mail. Ne jamais ajouter de policy `INSERT` sur la table : cela contournerait ces protections.
- **Notification** : push aux admins uniquement (`Grand Jarl, Divinité`), titre `Nouveau contact app NVG - prénom "pseudo" nom - objet`. Pas d'insertion dans `nvg_notifications` (fuite de données personnelles, car cette table est lisible publiquement).
- Le lien vers le formulaire est présent dans la fenêtre de connexion (accès public) et dans le menu latéral.

### Menu
- Ordre : NVG en Live, Calendrier, Streams NVG, Vidéos, Boutique, Propositions de jeux (Staff & Admin), Logistique (Admin), Administration (Admin), Contact.
- Sur téléphone : barre fixe en haut (logo, NVG-TV, profil), bouton ☰ fixe sous la barre, menu en panneau.

## 6. Procédure de déploiement

1. Modifier les fichiers dans le dépôt local.
2. `git add`, `git commit`, `git push origin main`.
3. Vérifier le workflow : `gh run list --repo AsterZKalhan/NVG-App --limit 1`.
4. Recharger le site avec Ctrl+F5 (le service worker peut garder l'ancienne version).

Pour modifier la base : passer par le SQL Editor de Supabase, ou par la Management API avec `SUPABASE_ACCESS_TOKEN`.
Pour déployer une fonction Edge : `curl` vers `/v1/projects/{ref}/functions/deploy?slug=...` (voir l'historique du projet).

## 7. Points à surveiller

- **Sécurité de la base** : toutes les tables sont protégées par des règles (RLS). Limite connue pour les événements : tout membre connecté peut modifier la liste des participants de n'importe quel événement (les règles ne vérifient pas la colonne modifiée). Pour les **propositions de jeux**, le trigger `nvg_games_guard_trg` (`.github/sql/guard-nvg-games.sql`) n'autorise un membre qu'à ajouter son propre vote (une seule fois) ou à le retirer. Seuls les admins peuvent modifier une proposition ou réinitialiser les votes. Pour annuler les règles d'une table : `alter table public.<table> disable row level security;`.
- **Secrets exposés dans une conversation** : le secret Twitch et le mot de passe SFTP ont été écrits dans un échange. Les régénérer (console Twitch, IONOS) et mettre à jour les secrets GitHub et Supabase.
- **Dashlane sous Firefox** : le popup se ferme sur le champ e-mail. Ça ne se produit pas sur Chrome ni sur les autres sites. Problème d'extension, non résolu côté site.
- **Tailwind via CDN** : avertissement dans la console (usage en production non recommandé). Sans impact fonctionnel.
- **Lien de réinitialisation du mot de passe** : la « Site URL » dans Supabase doit être `https://app.nvg-tv.com`.
- **Compte de test** : `petitviking.test@nvg-test.fr` a été supprimé.
- **Abonnements push** : les anciens abonnements d'appareils restent en base jusqu'à réabonnement. Les erreurs d'envoi éventuelles viennent de là.
- **Photos boutique** : les versions transparentes (`*-transparent.png`) sont prêtes mais non utilisées.
- **Sauvegarde Supabase** : sauvegarde **locale et manuelle** sur le PC, dans `C:\Sauvegarde APP NVG`, par `Lancer_sauvegarde.bat` (script `.github/scripts/backup_local.ps1`). L'archive ZIP n'est pas chiffrée et n'est jamais publiée sur GitHub. Le mot de passe de la base est dans `db-password.txt`, chiffré avec le compte Windows. Les valeurs des secrets Edge ne sont pas exportables : les garder dans un gestionnaire de mots de passe. Voir `.github/docs/sauvegarde-supabase.md`.

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
- **Formulaire de contact public** : ne jamais ajouter de policy `INSERT` sur `nvg_contact_messages`. L'écriture doit passer par l'Edge Function `contact-message`, qui vérifie le captcha, le honeypot et les limites. Une policy publique ouvrirait l'insertion directe de spam avec la clé anon.

### 8.3 Ajouter un nouveau module (page)
0. **Page autonome** (comme `contact.html` ou `privacy.html`) : pas besoin de Tailwind. Reprendre le style de `contact.html` (variables CSS sombres), charger `supabase-config.js` si un appel Supabase est nécessaire, et ajouter la page au menu par un simple lien `<a href="...">`.
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
- **Propositions de jeux** : cartes, filtres (Tous / Nieuwheim / Idées / événement) et badges dans `games.js` (`renderGameFilters`, `renderGamesList`, `gameTargetBadge`). La cible est stockée dans `target_type` (`nieuwheim`, `idea` ou `event`) + `event_id`. « Juste une idée » (`idea`) sert aux jeux sans événement, à rattacher plus tard via Éditer. Le commentaire et la date de sortie (texte libre) ne s'affichent et ne sont enregistrés que pour Nieuwheim. Dans la fiche admin d'un événement, `renderAdminEventGames` (events.js) liste les jeux de l'événement et les idées avec des cases à cocher : un jeu décoché repart en idée à l'enregistrement, et le bouton « Rattacher toutes les idées » les ajoute à l'événement. Le calendrier public n'affiche aucun jeu. Sur les cartes Nieuwheim, le logo complet (`logo-nieuwheim-complet.png`) est affiché directement, sans fond : son lettrage est blanc avec un contour noir, donc lisible sur la carte sombre. Il est recadré en CSS (`gameTargetBadge`) : le fichier 1920x1080 a des marges transparentes avec un contenu centré, d'où la largeur de 127,5 %. Si le logo est remplacé par un cadrage différent, ajuster ces valeurs. **Votes** : colonne `voters` (jsonb) sur `nvg_games`, un vote par membre et par jeu. Le compteur se met à jour immédiatement après le vote ; au survol, une bulle liste les votants. Un membre peut retirer son propre vote en recliquant sur « ✓ Voté ». Les admins disposent en plus de « Reset votes ↺ » sur chaque carte (`resetGameVotes`).
- **Vidéos** : lecteur `.videos-player` (16:9, iframe YouTube nocookie) puis vignettes `.videos-grid` (3 colonnes, `auto-fit`) ; rendu par `renderVideos` / `renderVideosPlayer` / `selectVideo` (`videos.js`).
- **Menu PC / mobile** : sur mobile (moins de 768 px), barre fixe en haut (`fixed top-0`), bouton ☰ fixe sous la barre, menu en panneau fixe. Sur PC (768 px et plus), colonne latérale `md:sticky md:h-screen`, et le bloc du compte en `md:absolute md:bottom-5`.- **Toujours tester les deux tailles** : ordinateur et téléphone.

### 8.5 Modifier la base de données (Supabase)
- **Accès** : SQL Editor du tableau de bord, ou la Management API avec `SUPABASE_ACCESS_TOKEN` (voir section 6).
- **Nouvelle colonne** : `alter table public.<table> add column if not exists <nom> <type> ...` avec une valeur par défaut, pour ne pas casser les lignes existantes.
- **Nouvelle table** : activer la RLS (`alter table ... enable row level security`) **et** écrire les règles (`create policy`) dans la même opération. Une table sans RLS est accessible à tout le monde avec la clé publique.
- **Règles** : `public.nvg_is_admin()` sert à vérifier les admins. `auth.uid()::text` donne l'identifiant de l'utilisateur connecté (les identifiants de `nvg_users` sont des textes).
- **Tester une règle** avant de la garder : transaction de test avec `set local role authenticated` et `request.jwt.claims`, puis `raise exception` pour annuler. Vérifier aussi l'accès anonyme avec la clé publique (REST).
- **Revenir en arrière** : `alter table public.<table> disable row level security;` ou `drop policy`.

### 8.6 Fonctions Edge (serveur Supabase)
- Fonctions en service : `send-push` (notifications push, utilise la clé de service), `steam-header` (bannières de jeux), `twitch-live` (statut Twitch, cache 15 s), `twitch-eventsub` (passage en direct), `youtube-videos` (dernières vidéos YouTube, cache 10 min), `contact-message` (formulaire de contact public, sans JWT), `discord-bot` (annonces et configuration du bot), `discord-interactions` (commandes slash) et `discord-oauth` (connexion Discord de l'espace `/BOT`).
- **Déployer ou mettre à jour** une fonction : fichier `index.ts` + `metadata.json` (`{"entrypoint_path":"index.ts","name":"<nom>","verify_jwt":true|false}`), puis `curl.exe` vers `https://api.supabase.com/v1/projects/<ref>/functions/deploy?slug=<nom>` en multipart (`metadata` et `file`). Voir l'historique pour la commande exacte.
- **Secrets** : `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` (dans Supabase, jamais dans le code).

### 8.7 Git : rappels
- Voir l'historique : `git log --oneline -20`.
- Annuler un commit déjà poussé : `git revert <hash>` puis `git push origin main` (ne pas réécrire l'historique de `main`).
- Récupérer les modifications faites sur GitHub avant de travailler : `git pull origin main`.
- Les modifications faites directement sur GitHub (par exemple l'ajout de photos) déclenchent aussi le déploiement.
- Ne jamais committer de secret : vérifier avec une recherche avant de pousser si besoin.

## 9. Journal des évolutions

- **2 novembre 2026** — Module Vidéos (3 dernières vidéos, lecteur intégré, ETag, actualisation admin), formulaire de contact public avec captcha et Edge Function `contact-message`, boîte de réception admin `📥 Contact`, mise à jour de la page de confidentialité et nettoyage automatique des notifications `NVG est en live !` après 48 h. Détail complet : `.github/docs/session-2026-11-02.md` (non déployé sur le serveur).
- **3 novembre 2026** — Propositions de jeux : vote affiché immédiatement sans rechargement, un vote par membre, bulle au survol listant les votants, retrait de son propre vote, bouton admin de réinitialisation, trigger `nvg_games_guard_trg` limitant les membres à leur propre vote. Logistique : matériel masqué pour les événements Nieuwheim. Vidéos : la lecture s'arrête quand on quitte l'onglet. Détail complet : `.github/docs/session-2026-11-03.md`.
- **7 novembre 2026** — Gestion des membres : liste compacte (avatar, pseudo, e-mail, rang, vérification) avec panneau dépliable pour modifier le rang, la vérification, Twitch, le profil ou supprimer le membre, et tri par rôle ou par nom. Détail complet : `.github/docs/session-2026-11-07.md`.
- **8 novembre 2026** — Streams NVG : mini-lecteur flottant en bas à droite quand on quitte l'onglet, déplaçable, avec bouton ✕ pour arrêter le flux ; le mini-lecteur ne s'active que si le flux joue réellement (API Twitch Embed, pause/arrêt pris en compte) et le lecteur reprend sa place au retour. Démarrage : calendrier affiché immédiatement, cache local des événements et chargements en parallèle. Détail complet : `.github/docs/session-2026-11-08.md`.
