# Tournoi des 9 Mondes — `letournoides9mondes.nvg-tv.com`

Troisième espace web du dépôt, consacré aux tournois de Normandy Viking Gaming :
inscriptions solo ou en équipe, tournois en ligne, en LAN ou les deux, calendrier,
prix à gagner et back-office NVG.

## Adresse et code

| Élément | Valeur |
|---|---|
| URL | `https://letournoides9mondes.nvg-tv.com/` |
| Code source | `tournoi-site/` |
| Dossier distant | `/tournoides9mondes` (sans suppression) |
| Workflow | `.github/workflows/deploy-tournament.yml` (« Deploy tournoi SFTP ») |
| Script | `.github/scripts/deploy_tournament_sftp.py` |
| Logo | `tournoi-site/Logos/logo-9mondes.png` (1200×896, fond transparent) |
| Favicon | `tournoi-site/Logos/favicon.png` (192×192, propre au tournoi) |
| SQL de référence | `.github/sql/tournament-9-mondes.sql` |

Le workflow se déclenche sur `push` vers `main` quand `tournoi-site/**` change,
ou manuellement (`workflow_dispatch`). Il réutilise les secrets SFTP existants.

`Deploy SFTP` (application) ignore désormais `bot-site/` et `tournoi-site/` :
chaque espace part dans son propre dossier (`/APP`, `/BOT`, `/tournoides9mondes`).

## Comptes et connexion

- Le compte se crée directement sur le site du tournoi : **Mon espace** →
  onglet **Créer un compte** (pseudo, prénom, nom, date de naissance, e-mail,
  mot de passe + confirmation).
- Le site ne présente jamais ce compte comme celui de l'application NVG ou de
  l'espace bot Discord : l'interface parle uniquement de « Compte Tournoi des
  9 Mondes ». Techniquement il s'agit bien d'une session Supabase Auth classique
  et de la table `nvg_users`, ce qui permet de rejoindre une équipe et de
  s'inscrire sans second compte.
- À l'inscription, le pseudo, le prénom, le nom et la date de naissance sont
  envoyés dans `options.data` (`name`, `first_name`, `last_name`, `birth_date`) ;
  le trigger `nvg_create_profile` crée la ligne `nvg_users` (`name`, `email`,
  `first_name`, `last_name`, `birth_date`, rang `Petit Viking`, rôle `Membre`,
  `verified = false`). La date est convertie uniquement si elle respecte le
  format ISO `AAAA-MM-JJ`, sinon elle est ignorée.
- **Mon espace → Mes informations** permet de modifier à tout moment le pseudo,
  le prénom, le nom et la date de naissance (mise à jour de `nvg_users` et des
  métadonnées Auth). Un bloc **Mot de passe** permet de changer le mot de passe
  (`auth.updateUser`).
- Le nom, le prénom et la date de naissance sont **obligatoires pour s'inscrire à
  un tournoi** : le site renvoie vers « Mes informations » si le profil est
  incomplet.
- Confirmation e-mail obligatoire (`mailer_autoconfirm = false`). Le lien de
  confirmation renvoie vers
  `https://letournoides9mondes.nvg-tv.com/?tab=account&confirmed=1` ; le site
  affiche « Adresse e-mail confirmée » puis invite à se connecter.
- `uri_allow_list` doit contenir `https://letournoides9mondes.nvg-tv.com/**`
  en plus de `https://app.nvg-tv.com/**` et
  `https://bot-discord.nvg-tv.com/**`.
- Connexion e-mail + mot de passe sur le site du tournoi (même session Supabase).
  Les erreurs courantes sont traduites en français (identifiants invalides,
  e-mail non confirmé, compte déjà existant, mot de passe trop court).
- La déconnexion renvoie sur la page du tournoi.
- L'accès admin (jeux, tournois, inscriptions) est réservé à `nvg_is_admin()` :
  admin, Grand Jarl, Divinité.
- **Navigation avec historique** : chaque onglet (`?tab=…`) et chaque fiche
  (`?tournament=…`) crée une entrée d'historique ; les boutons Précédent/Suivant
  du navigateur fonctionnent comme dans l'application, et un lien direct vers un
  onglet ou une fiche est possible.

## Modèle de données

Tables (préfixe `nvg_tournament_`) :

| Table | Rôle |
|---|---|
| `nvg_tournament_games` | jeux proposés (nom, slug, logo, bannière) |
| `nvg_tournaments` | tournois : mode `solo`/`team`, format `online`/`lan`/`both`, taille d'équipe, places (`max_participants`), prix (1re/2e/3e place), dates, statut, publication, frais et consignes de paiement |
| `nvg_tournament_teams` | équipes : nom, tag, capitaine, code d'invitation unique |
| `nvg_tournament_team_members` | appartenance joueur ↔ équipe, rôle `captain`/`member` |
| `nvg_tournament_registrations` | inscriptions solo ou équipe, statut d'inscription `pending`/`confirmed`/`waitlist`/`cancelled`, statut de paiement séparé |

Format d'équipe : le back-office propose un seul menu **Format de jeu**
(1 à 6 joueurs). Pour `N ≥ 2`, le site enregistre `mode = 'team'` et
`team_min = team_max = N` ; pour `N = 1`, `mode = 'solo'` et
`team_min = team_max = 1`. La taille exacte est donc vérifiée à l'inscription.

Champs de paiement :

| Table | Colonne | Rôle |
|---|---|---|
| `nvg_tournaments` | `entry_fee_cents` | frais d'inscription en centimes (`0` = gratuit) |
| `nvg_tournaments` | `payment_url` | lien de règlement (Weezevent, HelloAsso, Stripe…) |
| `nvg_tournaments` | `payment_instructions` | consignes affichées au joueur (virement, référence…) |
| `nvg_tournament_registrations` | `payment_status` | `not_required`, `awaiting`, `paid`, `refunded` |
| `nvg_tournament_registrations` | `payment_reference` | référence externe du paiement (facultative) |
| `nvg_tournament_registrations` | `paid_at` | horodatage du règlement |

Vues publiques sans code d'invitation :

- `nvg_tournament_teams_public` (nom, tag, nombre de membres) ;
- `nvg_tournament_registrations_public` (nom affiché, statut, équipe ou solo).

Statuts d'un tournoi : `draft`, `open`, `closed`, `running`, `finished`, `cancelled`.

## Règles et sécurité

- Les écritures sensibles passent par des fonctions `SECURITY DEFINER` ; le
  navigateur ne décide jamais des droits :
  - `nvg_tournament_create_team(tournoi, nom, tag)` ;
  - `nvg_tournament_join_team(code)` ;
  - `nvg_tournament_leave_team(équipe)` ;
  - `nvg_tournament_register_solo(tournoi, pseudo)` ;
  - `nvg_tournament_register_team(équipe, pseudo)` ;
  - `nvg_tournament_set_platform_id(inscription, pseudo)` (le titulaire, ou un
    admin, corrige le pseudo en jeu tant que l'inscription n'est pas annulée) ;
  - `nvg_tournament_cancel(inscription)` ;
  - `nvg_tournament_is_team_member(équipe)` (utilisée par les policies RLS).
- Un joueur ne peut être que dans **une équipe par tournoi**.
- Le nom d'équipe est unique par tournoi (insensible à la casse) et limité à
  2–60 caractères ; le tag à 10 caractères.
- Le code d'invitation n'est pas exposé par les vues publiques ; il n'est lisible
  que par les membres de l'équipe et les admins.
- Une équipe ne peut être inscrite que par son capitaine, entre `team_min` et
  `team_max` joueurs, et seulement si les inscriptions sont ouvertes.
- Une inscription peut être annulée par le joueur, un membre de son équipe ou un
  admin ; l'annulation libère la place.
- Une équipe inscrite ne peut pas être dissoute avant l'annulation de son
  inscription.
- Les inscriptions sont créées en `pending` : la NVG confirme (`confirmed`),
  met en liste d'attente (`waitlist`) ou annule depuis le back-office.
- Visuels des jeux : bucket public `games-img`, téléversement réservé à
  `nvg_is_admin()` (`<slug>-logo.png`, `<slug>-banniere.png`, 4 Mo max,
  PNG/JPG/WebP), lecture publique.

## Parcours membre

1. Onglet **Tournois** : cartes des tournois, bouton **Fiche** pour le détail
   (jeu, mode, format, dates, places, podium des récompenses, règlement).
2. **S'inscrire** :
   - tournoi solo → confirmation directe, pseudo en jeu facultatif ;
   - tournoi en équipe → création de l'équipe (nom + tag).
3. Après création, un **lien d'invitation** est affiché :
   `https://letournoides9mondes.nvg-tv.com/?join=CODE`.
4. Les coéquipiers se connectent avec leur compte Tournoi des 9 Mondes : le code
   est prérempli (y compris après connexion si le lien est ouvert déconnecté).
5. Onglet **Mon espace** : équipes, membres, code, inscription de l'équipe,
   annulation, liste des inscriptions avec statut et état du paiement. Chaque
   inscription non annulée affiche **Pseudo en jeu : … ✏️ Modifier** : le joueur
   corrige son identifiant en jeu (40 caractères max, champ facultatif) sans
   annuler puis recréer son inscription.
6. Le capitaine peut dissoudre l'équipe ; un membre peut la quitter.

## Paiement des inscriptions

Le site ne manipule aucune donnée bancaire : il affiche l'état du paiement et
renvoie vers la plateforme de règlement choisie par la NVG (Weezevent,
HelloAsso, Stripe Checkout, virement…).

- Pour un tournoi payant, la carte, la fiche et le formulaire d'inscription
  affichent les frais (`10,00 €`) et un bouton **Régler mon inscription** quand
  `payment_url` est renseignée ; `payment_instructions` précise le mode de
  règlement (référence à indiquer, délai, etc.).
- À l'inscription, `payment_status` passe automatiquement à `awaiting` si des
  frais sont dus, sinon à `not_required`.
- Dans **Mon espace**, chaque inscription affiche un badge de paiement et, si
  nécessaire, le bouton **Régler mon inscription**.
- Libellés affichés : « Gratuit » / « 10,00 € », « En attente de paiement »,
  « Participation validée », « Remboursé », « Aucun paiement requis ».
- Le statut d'inscription (`pending`, `confirmed`…) reste indépendant du statut
  de paiement : un joueur peut être confirmé et encore en attente de règlement,
  ou payé et en liste d'attente.
- Côté admin, le panneau des inscriptions permet de faire évoluer le paiement :
  - **✅ Marquer payé** : `payment_status = 'paid'`, `paid_at` renseigné et
    inscription confirmée ;
  - **💸 Rembourser** (après confirmation) : `payment_status = 'refunded'`,
    `paid_at` effacé et **inscription annulée** — la place est immédiatement
    libérée (compteurs et barre de remplissage repassent à 0 pour ce joueur) ;
  - **↩️ Remettre en attente** : `payment_status = 'awaiting'`, `paid_at` effacé ;
    si l'inscription avait été annulée par un remboursement, elle est
    re-confirmée et la place reprise.
- Réinscrire un joueur remboursé (bouton **Confirmer**) remet automatiquement
  son paiement en attente si le tournoi est payant, ou à « aucun paiement
  requis » s'il est gratuit.

## Back-office NVG

Onglet **Admin** (visible uniquement pour les admins) :

- créer un jeu (nom, logo et bannière facultatifs) ;
- créer un tournoi : jeu, **format de jeu** (menu 1 à 6 joueurs : solo, duo,
  trio, 4, 5 ou 6), format en ligne/LAN, statut, **slots** (places), frais
  d'inscription, podium (1re/2e/3e), date de début, clôture des inscriptions,
  description, lien Toornament, lien et consignes de paiement, publication ;
- tous les champs du formulaire sont étiquetés au-dessus de la saisie ;
- modifier un tournoi existant (même champs, menu de taille d'équipe inclus) ou
  le supprimer ;
- changer le statut directement depuis la liste ;
- suivre le remplissage : chaque tournoi de la liste affiche une **barre de
  remplissage** (`inscrits / slots`, pourcentage), les places restantes et le
  nombre de participations payées / en attente ;
- ouvrir **📋 Voir les inscriptions** : un panneau dédié affiche, pour le tournoi
  choisi, la même barre de remplissage puis chaque inscription avec pseudo du
  site, pseudo en jeu, prénom, nom, date de naissance, identité complète, date
  d'inscription, statut d'inscription et statut de paiement ;
- depuis ce panneau : confirmer, mettre en liste d'attente, annuler, marquer
  payé, **rembourser** (libère la place) ou **remettre en attente de paiement**.

Créer un tournoi en `draft` non publié permet de préparer la fiche avant
ouverture. Pour rendre les inscriptions possibles : statut `open` **et**
`published` coché.

## Visuels des jeux (bucket `games-img`)

Le logo et la bannière appartiennent au **jeu**, pas au tournoi : toutes les
cartes d'un même jeu partagent donc le même visuel.

- Dans le back-office, bloc **🎮 Jeu** : les boutons **📤 Téléverser** envoient
  l'image dans le bucket public Supabase Storage `games-img`.
- Noms de fichiers : `<slug-du-jeu>-logo.png` et `<slug-du-jeu>-banniere.png`
  (ex. `league-of-legends-logo.png`). Un nouvel envoi remplace l'ancien
  (`upsert`) ; l'URL stockée reçoit `?v=<horodatage>` pour contourner le cache.
- Contraintes : PNG/JPG/WebP, 4 Mo maximum ; écriture réservée à `nvg_is_admin()`,
  lecture publique.
- Une URL externe reste acceptée (champ texte sous le bouton) : pratique pour un
  visuel hébergé ailleurs.
- **Remplacement sans orphelin** : à l'enregistrement, l'ancien logo/bannière
  est supprimé du bucket si le fichier a changé (renommage du jeu, nouvelle
  image, passage à une URL externe ou champ vidé). Un fichier envoyé puis
  abandonné (annulation de la modification ou second envoi dans la même
  session) est également effacé. Un fichier encore référencé par un autre jeu
  n'est jamais supprimé.
- Le bloc **🎮 Jeu** sert aussi à modifier un jeu existant (bouton ✏️ dans la
  liste) : nom, logo, bannière.
- Sur la carte, `banner_url` du tournoi reste prioritaire si elle est renseignée ;
  sinon la bannière du jeu est utilisée.

> L'hébergement IONOS ne reçoit pas d'upload depuis le navigateur (site
> statique, pas de code serveur). Le bucket `games-img` joue le rôle du dossier
> `games-img` : les fichiers sont publics et servis par Supabase Storage.

## Récompenses (podium)

- Trois champs distincts : `prize_first`, `prize_second`, `prize_third`
  (l'ancien champ unique `prize` sert de repli pour la 1re place).
- La carte affiche le lot de la 1re place avec un petit trophée.
- La fiche détaillée (**bouton Fiche**) affiche le podium complet avec trois
  trophées : or, argent, bronze ; une place sans montant indique
  « À confirmer ».

## Fiches tournoi (style Toornament)

Chaque tournoi s'affiche sous forme de carte inspirée des fiches Toornament :

- bannière du jeu (ou du tournoi) en haut de la carte, avec repli sur le motif
  viking et le nom du jeu quand aucune image n'est fournie ;
- logo du jeu dans un carré clair, nom du jeu, titre, dates de début et de fin ;
- statut (« Inscriptions ouvertes », « En cours »…), mode
  (« Équipe (5 joueurs) », « Équipe (6 joueurs) » ou « Joueur (solo) »), format
  (« En ligne », « LAN », « En ligne et LAN ») et frais d'inscription
  (« Gratuit » ou « 10,00 € ») ;
- prix (1re place + trophée), description courte, compteur d'inscrits, clôture ;
- bouton **S'inscrire**, **Gérer mon équipe** ou badge **Inscrit**, plus
  **Fiche** (modale détaillée) et **Toornament** si un lien est renseigné.

La fiche détaillée reprend la bannière, le logo, les dates, le format, la
description, le règlement, le podium des récompenses et les actions
d'inscription. Elle se ferme par la croix, un clic sur le fond ou `Échap`.

Liaison Toornament (préparation de la synchronisation API) :

| Colonne | Rôle |
|---|---|
| `banner_url` | bannière large propre au tournoi (sinon celle du jeu) |
| `toornament_url` | page publique du tournoi sur Toornament : badge **Toornament** sur la bannière et bouton dans la fiche |
| `toornament_id` | identifiant numérique extrait automatiquement du lien, clé de la future synchronisation API |

Ces champs se renseignent dans le back-office, à la création comme à la
modification du tournoi. Quand l'accès API Toornament sera disponible, la
synchronisation pourra s'appuyer sur `toornament_id` sans modifier l'affichage.
Les URL sont validées (`https://…` uniquement) avant enregistrement.

## Calendrier et affichage public

- Le calendrier liste les tournois datés (début, clôture des inscriptions).
- L'accueil met en avant les trois prochains tournois ouverts ou en cours.
- Liens directs : `?tab=tournaments` et `?tab=account` (l'onglet admin reste
  protégé par `nvg_is_admin`).
- Les compteurs d'inscrits utilisent la vue publique (inscriptions en attente et
  confirmées) ; en mode équipe, l'unité affichée est l'équipe.

## Déploiement et vérifications

```bash
git push origin main
# GitHub Actions → Deploy tournoi SFTP → tournoi-site/** → /tournoides9mondes
```

À contrôler après déploiement :

1. `https://letournoides9mondes.nvg-tv.com/` répond **HTTP 200** ;
2. `tournament.js`, `Logos/favicon.png` et `Logos/logo-nvg.png` répondent 200 ;
3. le site se charge sans erreur console (CDN Tailwind + supabase-js) ;
4. création de compte sur le site (pseudo, prénom, nom, date de naissance,
   e-mail, mot de passe), réception du lien de confirmation, connexion,
   création d'équipe, lien d'invitation, inscription solo/équipe ;
5. côté admin : création d'un jeu avec logo et bannière téléversés, création d'un
   tournoi (format de jeu + slots + frais), barre de remplissage,
   **📋 Voir les inscriptions**, confirmation d'une inscription et marquage du
   paiement ;
6. navigation : boutons Précédent/Suivant du navigateur entre les onglets et les
   fiches, lien direct `?tab=…` / `?tournament=…`.

## Limites connues

- **Toornament** : pas d'accès API pour l'instant. Aucune synchronisation ;
  prévoir un export compatible (JSON/CSV) quand l'accès sera ouvert.
- **Identité visuelle** : le logo officiel et son favicon dédié sont versionnés
  dans `tournoi-site/Logos/`. Le logo web est une version optimisée (1200×896)
  de l'original 2400×1792 conservé hors dépôt (Dropbox `NVG-LT9M`) ; en cas
  d'absence, les pages retombent sur `logo-nvg.png` via `onerror`.
- Les annonces d'événements détaillées (articles) ne sont pas encore gérées :
  la description, le règlement et le prix de chaque tournoi servent de support.
- **Paiement** : le module maison se limite au suivi des états et à un lien
  externe (Weezevent, HelloAsso, Stripe…). Aucun encaissement, aucune
  vérification automatique du règlement : la NVG valide à la main depuis le
  back-office.
- Pas de gestion de scores ni de brackets : Toornament ou un back-office
  ultérieur prendra le relais.
- Aucun secret dans `tournoi-site/` : seulement l'URL Supabase et la clé `anon`,
  qui sont publiques par conception.
