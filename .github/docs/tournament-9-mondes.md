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
| Logo | `tournoi-site/Logos/logo-9mondes.webp` (600 px de large, fond transparent ; source PNG 1200×896 d'origine) |
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
- **Session partagée** avec l'application et l'espace bot : le jeton est conservé
  dans des cookies du domaine `.nvg-tv.com` (`auth-shared.js`), donc se connecter
  sur l'un des trois espaces connecte les autres. La déconnexion les déconnecte
  tous. Voir `NOTES.md`, section « Session partagée ».
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
| `nvg_tournament_games` | jeux proposés (nom, slug, **joueurs par équipe** `team_size`, **mode de score** `scoring_mode` `versus`/`cumulative`/`wins`/`none`/`bo3`, logo, bannière) |
| `nvg_tournaments` | tournois : mode `solo`/`team`, format `online`/`lan`/`both`, taille d'équipe, places (`max_participants`), prix (1re/2e/3e place), dates, statut, publication, frais et consignes de paiement |
| `nvg_tournament_teams` | équipes : nom, tag, capitaine, code d'invitation unique |
| `nvg_tournament_team_members` | appartenance joueur ↔ équipe, rôle `captain`/`member` |
| `nvg_tournament_registrations` | inscriptions solo ou équipe, statut d'inscription `pending`/`confirmed`/`waitlist`/`cancelled`, statut de paiement séparé |
| `nvg_tournament_matches` | matchs du format BO9 : phase (`pool`/`bracket`/`third`), tour, position, poule, équipes, scores par jeu, ordre pick & ban, cartes capitaines, points, vainqueur, mercy et lien vers le match suivant |

Format d'équipe : le back-office propose un seul menu **Format de jeu**
(1 à 6 joueurs). Pour `N ≥ 2`, le site enregistre `mode = 'team'` et
`team_min = team_max = N` ; pour `N = 1`, `mode = 'solo'` et
`team_min = team_max = 1`. La taille exacte est donc vérifiée à l'inscription.

Chaque jeu peut décrire son **nombre de joueurs par équipe** (`team_size`,
1 à 6, facultatif) dans le menu **🎮 Jeux**. Ce format est affiché dans la liste
des jeux (`5v5`) et repris automatiquement dans le formulaire **➕ Nouveau
tournoi** dès que le jeu est sélectionné ; l'organisateur peut toujours le
modifier pour un événement particulier. Le libellé du jeu dans les menus
indique aussi le format (`League of Legends — 5 joueurs`).

## Trois formats : standard, Décathlon (BO9), Tournoi des 9 Mondes

Le formulaire **➕ Nouveau tournoi** commence par un menu **Format du tournoi** :

- **Un jeu — format standard** : fonctionnement historique (un jeu, 1 à 6 joueurs,
  élimination directe, double élimination, poules, poules + élimination simple,
  poules + double élimination (`format: 'groups_playoffs'`, `tree: 'double'`, qualifiés = 4, 8, 16 ou 32),
  championnat ou suisse, géré par l'organisateur ou Toornament) ;
- **Décathlon — 9 jeux avec points (BO9)** : tournoi multi-jeux, équipes de
  **5 joueurs**, phase de poules puis bracket, barème de points, mercy rule,
  carte capitaine et pick & ban (voir ci-dessous) ;
- **Tournoi des 9 Mondes — un jeu par tour** : même moteur que le tournoi ZZ admin.
  `format_config = { type: 'standard', format: <type de compétition>, nine_worlds:
  true, round_games: { … } }`, `game_id = null`, équipes de 5 par défaut. Tous
  les types de compétition sont disponibles : élimination directe, double
  élimination, poules, poules + élimination, championnat (round robin global) et
  suisse. Les jeux de chaque tour (`P1…`, `B1…`, `W1…`/`L1…`, `T`, `GF`,
  `F1…F3` selon le format) se choisissent à la création puis dans
  **⚙️ Gestion tournoi** ; un jeu peut être laissé vide et complété plus tard.
  Un tournoi standard sans `game_id` mais avec des `round_games` (le ZZ admin)
  est reconnu comme Tournoi des 9 Mondes.

  La fiche publique affiche les dates de l'événement sous la forme
  « Début : … · Fin : … » ; les deux dates se renseignent à la création comme
  dans **✏️ Modifier le tournoi** (la fin doit être postérieure au début).
  La vue Tournoi des 9 Mondes de l'application affiche la même plage de dates.

  Ce choix n'est plus figé à la création : **✏️ Modifier le tournoi** propose
  le même sélecteur de format. Changer de format demande confirmation et efface
  tous les matchs existants du tournoi (poules, tableau et scores) avant de
  reconstruire la configuration. Le format standard réutilise le jeu choisi
  dans le sélecteur « Jeu du tournoi » ; le passage au Décathlon propose les
  9 jeux à renseigner, et le Tournoi des 9 Mondes reprend le type de compétition
  choisi, ses réglages de poules et ses jeux par tour. Sans changement de format,
  la configuration est conservée telle quelle.

### Les 9 jeux et le barème

Les 9 jeux sont choisis à la création, répartis en trois catégories de trois
jeux. Chaque catégorie vaut 9 points en mode **Classique** (27 au total) ou
15 points en mode **All-In** (45 au total) :

| Catégorie | Format | Unités par jeu | Classique | All-In |
|---|---|---|---|---|
| 🛡️ Collectif | 5v5 | 1 unité | 3 pts / unité | 5 pts / unité |
| 🎯 Escarmouche | 2v2 / 3v3 | 2 unités | 1,5 pt / unité | 2,5 pts / unité |
| ⚔️ Duel | 1v1 | 5 unités | 0,6 pt / unité | 1 pt / unité |

La **majorité des points** gagne la rencontre : 14 points sur 27 en Classique,
23 sur 45 en All-In. Les 9 jeux doivent être **distincts** ; le formulaire
refuse un doublon ou un jeu manquant.

### Jeux en cumul (Trackmania, time attack…)

Chaque jeu décrit aussi son **mode de score** dans **Admin → 🎮 Jeux** :

- **Confrontation** (par défaut) : les deux équipes s'affrontent sur le jeu et
  l'admin saisit les unités gagnées (barème habituel) ;
- **Cumul** : tous les joueurs des deux équipes jouent ensemble, par exemple
  Trackmania en time attack à 5 contre 5 (1v1v1v1v1v1v1v1v1v1). L'admin saisit
  le **total de points de chaque équipe** ; le plus haut total remporte les
  points du jeu (3 en Classique, 5 en All-In pour un jeu collectif). En cas
  d'égalité, les points du jeu sont partagés ;
- **Victoires individuelles** : chaque joueur affronte son homologue en 1v1
  (A1–B1, A2–B2, A3–B3…), par exemple Hearthstone sur 5 joueurs. L'admin saisit
  le **nombre de duels gagnés par équipe** ; l'équipe qui en gagne le plus
  remporte le jeu. En cas d'égalité, les points du jeu sont partagés ;
- **Aucun** : le mode n'a pas été précisé. Le jeu se comporte comme une
  confrontation classique (badge **Aucun** dans la liste des jeux) ;
- **BO3 2v2** : jeu à 2 joueurs par équipe. Deux BO1 de binômes
  (A1/A2 – B1/B2, A3/A4 – B3/B4) puis, si 1–1, un départage 2v2 en **BO3**
  (premier à 2 manches). L'admin saisit le score du départage (`2–0`, `2–1`,
  `1–2` ou `0–2`) ; le vainqueur empoche tout le slot. Le 5e joueur peut
  remplacer un des deux joueurs.

En **cumul**, le site ne saisit pas les classements individuels joueur par
joueur : c'est le total d'équipe qui compte. Le reste du barème, le seuil de
mercy et le bracket ne changent pas. Le détail public affiche les totaux bruts
du jeu (ex. `320 — 280`, marqué **cumul**). Un jeu 1v1 réglé sur **1 joueur par
équipe** additionne les joueurs des deux équipes du slot (5 contre 5, soit
10 joueurs au total pour un slot Duel).

### Jeux à 2 joueurs (2v2)

Pour un jeu réglé sur **2 joueurs par équipe** (escarmouche), la rencontre se
joue avec les 5 joueurs de l'équipe :

1. **Binôme 1** : A1/A2 contre B1/B2 en BO1 ;
2. **Binôme 2** : A3/A4 contre B3/B4 en BO1 ;
3. si une équipe gagne les deux BO1, elle remporte le jeu (**2–0**) ;
4. si chaque équipe gagne un BO1 (**1–1**), les deux binômes vainqueurs jouent
   une **finale 2v2**. Chaque équipe peut remplacer un de ses deux joueurs par
   le **5e joueur** (remplaçant).

L'admin saisit le vainqueur de chaque BO1 ; la finale n'apparaît que si les BO1
sont partagés. Le vainqueur du jeu empoche la totalité des points du slot
(3 points en Classique, 5 en All-In), sans partage. Le détail public affiche le
score des binômes (`2 — 0` ou `1 — 2`, marqué **2v2 · finale** si nécessaire).
Le mode est figé dans `format_config.games[].pair_mode` à la création du BO9.

Le jeu peut être réglé sur **deux modes** :

- **Confrontation** (défaut) : les deux BO1 de binômes, puis un départage 2v2 en
  BO1 si 1–1 ;
- **BO3 2v2** (`scoring_mode = 'bo3'`) : les deux BO1 de binômes, puis le
  départage 2v2 en **BO3** (premier à 2 manches). L'admin choisit le score du
  départage (`2–0`, `2–1`, `1–2` ou `0–2`) ; le vainqueur empoche le slot. Le
  détail public affiche le score des binômes et le score du départage (marqué
  **2v2 · BO3**).

Le mode est figé dans `format_config.games[].scoring` (`versus` ou `bo3`) et
`format_config.games[].pair_format` (`bo3` pour un départage en BO3).

### Victoires individuelles (Hearthstone…)

Pour un jeu réglé sur ce mode, le nombre de duels est le **nombre d'unités du
slot** : 5 duels pour un slot Duel, 2 pour une Escarmouche, 1 pour un Collectif.
Un jeu 1v1 (ex. Hearthstone) reste donc réglé sur **1 joueur par équipe** : le
slot Duel se joue sur **5 duels** (A1–B1, A2–B2… A5–B5). L'admin saisit
simplement le nombre de duels gagnés par chaque équipe (0 à 5, la somme ne
pouvant pas dépasser 5) ; l'équipe qui en gagne le plus remporte le jeu et la
totalité des points du slot. En cas d'égalité, les points sont partagés. Le
détail public affiche le score des duels (`3 — 2`, marqué **victoires**).

### Options de compétition

- **Poules** : 2 ou 4 poules, 3 à 5 équipes par poule, 1 ou 2 qualifiés par
  poule. Par défaut : 4 poules de 4 (16 équipes, 80 joueurs), 2 qualifiés.
  Les places (`max_participants`) sont dérivées automatiquement
  (`poules × équipes par poule`).
- **Pick & ban de l'ordre des jeux** : l'ordre des 9 jeux est propre à chaque
  rencontre, tirable au hasard et réordonnable dans le panneau admin.
- **Mercy rule** : la rencontre s'arrête dès qu'une équipe atteint le seuil de
  majorité (14 ou 23 points), sans jouer les jeux restants.
- **Carte capitaine** : chaque équipe désigne secrètement un de ses duels 1v1 ;
  les points de ce duel sont doublés, une fois par rencontre.
- **Petite finale** : match pour la 3e place entre les perdants des
  demi-finales (désactivable).

### Déroulement

1. Les équipes s'inscrivent comme pour un tournoi en équipe (5 joueurs,
   capitaine, code d'invitation).
2. **🏗️ Générer les poules** : répartit les équipes confirmées en poules et
   crée tous les matchs en round-robin (chaque équipe rencontre les autres).
3. Chaque match de poule se joue en **BO1 par jeu** (sprint) ; l'admin saisit
   les unités gagnées par équipe et par jeu — ou, pour un jeu en **cumul**, le
   total de points de chaque équipe. Les points sont calculés automatiquement
   (barème et carte capitaine inclus).
4. Classement de poule : **3 points** par victoire, **1** par égalité, **0** par
   défaite ; départage au **goal average** (points marqués − points encaissés),
   puis aux points marqués, puis à l'ordre alphabétique.
5. Une fois tous les matchs de poule terminés, **🏁 Générer le bracket**
   qualifie les mieux classés et construit un tableau à 2, 4, 8 ou 16 équipes,
   avec têtes de série croisées entre poules, avancement automatique des
   vainqueurs et petite finale.
6. La fiche publique affiche le format, les classements, les rencontres de
   poule (repliées) et le bracket avec le détail des jeux.

Le tournoi BO9 reste compatible avec les tournois « jeu unique » existants :
`format_config` est nul pour ces derniers.

### Structure `format_config`

```json
{
  "type": "bo9",
  "points_mode": "classic",
  "games": [
    { "slot": 1, "category": "collectif", "game_id": "…", "units": 1, "points_per_unit": 3, "scoring": "versus", "pair_mode": false }
  ],
  "pool_count": 4,
  "pool_size": 4,
  "qualifiers_per_pool": 2,
  "pick_ban": true,
  "mercy": true,
  "captain_card": true,
  "third_place": true
}
```

Migration : `.github/sql/tournament-bo9.sql` (`format_config`,
`nvg_tournament_matches`, index, RLS et grants).

### Panneau admin « ⚔️ Gérer »

Dans **📋 Gestion des tournois**, chaque tournoi BO9 affiche un bouton
**⚔️ Gérer** qui ouvre le panneau de compétition :

- générer les poules (16 équipes confirmées requises pour 4 × 4) ;
- générer le bracket quand toutes les poules sont terminées ;
- effacer tous les matchs pour repartir de zéro ;
- suivre les classements et l'avancement de chaque poule ;
- ouvrir chaque match pour saisir les unités par jeu (ou les **totaux cumulés**
  pour un jeu en cumul ; les **vainqueurs des deux BO1 2v2** et la finale si
  1–1 ; ou le **nombre de victoires individuelles**), choisir l'ordre pick &
  ban (🔀 tirage, ▲/▼) et désigner la carte capitaine de chaque équipe ;
- enregistrer un résultat : le vainqueur est propagé au match suivant, les
  perdants des demi-finales alimentent la petite finale.

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
   (jeu, mode, format, dates, places, podium des récompenses, règlement). Une
   fois inscrit, la carte et la fiche proposent **📋 Gérer mon inscription**, qui
   ouvre **Mon espace → Mes inscriptions**.
2. **S'inscrire** :
   - tournoi solo → confirmation directe, pseudo en jeu facultatif ;
   - tournoi en équipe → création de l'équipe (nom + tag).
3. Après création, un **lien d'invitation** est affiché :
   `https://letournoides9mondes.nvg-tv.com/?join=CODE`.
4. Les coéquipiers se connectent avec leur compte Tournoi des 9 Mondes : le code
   est prérempli (y compris après connexion si le lien est ouvert déconnecté).
5. Onglet **Mon espace**, organisé en trois menus :
   - **👤 Mes informations** : pseudo, prénom, nom, date de naissance et mot de
     passe ;
   - **🛡️ Mes équipes** : rejoindre une équipe par code, équipes, membres, code
     d'invitation, inscription et dissolution. Chaque carte indique le **tournoi**
     concerné et son statut, et affiche en face de chaque joueur le même voyant
     de paiement que le back-office (vert « Billet pris », rouge « Billet à
     prendre », bleu « Remboursé », gris « Gratuit »), avec un récapitulatif
     `x/y billet(s) pris`. La lecture des billets des coéquipiers passe par la
     fonction `nvg_tournament_team_payments` (`.github/sql/`
     `tournament-team-payments.sql`) : la RLS reste inchangée, la fonction
     `SECURITY DEFINER` ne renvoie que l'état de paiement aux membres de
     l'équipe ou aux admins ;
   - **📋 Mes inscriptions** : inscriptions actives avec statut et état du
     paiement. Une inscription annulée (par le joueur ou par la NVG)
     **disparaît de Mon espace** ; elle reste consultable dans le back-office.
     Chaque inscription active affiche **Pseudo en jeu : … ✏️ Modifier** : le
     joueur corrige son identifiant en jeu (40 caractères max, champ facultatif)
     sans annuler puis recréer son inscription.
6. Le capitaine peut dissoudre l'équipe ; un membre peut la quitter.

## Paiement des inscriptions

Le site ne manipule aucune donnée bancaire : il affiche l'état du paiement et
renvoie vers la plateforme de règlement choisie par la NVG (Weezevent,
HelloAsso, Stripe Checkout, virement…).

- Pour un tournoi payant, la carte, la fiche et le formulaire d'inscription
  affichent les frais (`10,00 €`) et `payment_instructions` précise le mode de
  règlement (référence à indiquer, délai, etc.).
- Deux liens de billetterie, configurés par l'admin à la création et en édition
  (`ticket_url_player` et `ticket_url_team`, migration
  `.github/sql/tournament-ticket-links.sql`) :
  - **Je prends mon billet** : lien du « 1 pass joueur », affiché tant que ton
    billet est à régler ;
  - **Je prends un pass équipe (je paie pour les N joueurs de mon équipe)** :
    lien du « 1 pass équipe », affiché au capitaine tant qu'un joueur de son
    équipe n'a pas réglé. Les deux boutons apparaissent dans la fiche, dans
    **⚙️ Gérer mon inscription** et dans **Mon espace** (Mes équipes et Mes
    inscriptions). Ils ouvrent le lien dans un nouvel onglet ; la validation du
    paiement reste faite par la NVG depuis le back-office.
- Au clic sur **S'inscrire**, un écran de choix s'affiche :
  - **🎮 Je suis joueur** : ouvre le formulaire d'inscription habituel (solo, ou
    équipe à créer ou rejoindre) ;
  - **🎟️ Je suis accompagnant** : ouvre directement le lien `ticket_url_companion`
    (« pass accompagnant »), sans créer d'inscription (migration
    `.github/sql/tournament-companion-ticket.sql`).
- À l'inscription, `payment_status` passe automatiquement à `awaiting` si des
  frais sont dus, sinon à `not_required`.
- Dans **Mon espace**, chaque inscription affiche un badge de paiement et, si
  nécessaire, les boutons de billetterie.
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
- **🗑️ Supprimer** efface la ligne d'inscription après confirmation : elle
  disparaît de la liste et libère la place. Pour une équipe, seule l'inscription
  est supprimée — l'équipe et ses membres restent en place et peuvent la
  réinscrire.

## Back-office NVG

Onglet **Admin** (visible uniquement pour les admins), organisé en quatre
menus :

| Menu | Contenu |
|---|---|
| **👥 Joueurs** | recherche par pseudo, nom ou e-mail ; modification du pseudo, du prénom, du nom et de la date de naissance ; nombre d'inscriptions par joueur. Les rangs et rôles restent gérés dans l'application NVG. |
| **🎮 Jeux** | création et modification d'un jeu (nom, **joueurs par équipe 1–6**, **mode de score confrontation/cumul/victoires/aucun/BO3 2v2**, logo et bannière téléversés ou URL externe). |
| **➕ Nouveau tournoi** | formulaire complet de création (format du tournoi : standard, Décathlon BO9 ou Tournoi des 9 Mondes, jeu(x), format de jeu 1–6, type, statut, slots, frais, podium, dates, visuels, Toornament, paiement, description, publication). En Décathlon : 9 jeux par catégorie, mode de points, poules et options de compétition ; en Tournoi des 9 Mondes : jeux de chaque tour. |
| **📋 Gestion des tournois** | liste filtrable (tous / en cours et ouverts / brouillons / terminés et annulés) avec barre de remplissage, changement de statut, modification, suppression, accès aux inscriptions et bouton **⚔️ Gérer** pour les tournois BO9. |

Chaque menu est adressable par lien : `?tab=admin&admin=players`,
`?admin=games`, `?admin=create`, `?admin=manage` (l'historique du navigateur
suit les changements de menu).

Détail des menus **Nouveau tournoi** et **Gestion des tournois** :

- créer un tournoi : jeu, **format de jeu** (menu 1 à 6 joueurs : solo, duo,
  trio, 4, 5 ou 6), format en ligne/LAN, statut, **slots** (places), frais
  d'inscription, podium (1re/2e/3e), date de début, clôture des inscriptions,
  description, lien Toornament, lien et consignes de paiement, publication ;
- tous les champs du formulaire sont étiquetés au-dessus de la saisie ;
- modifier un tournoi existant (même champs, menu de taille d'équipe inclus) ou
  le supprimer ;
- changer le statut directement depuis la liste ;
- filtrer la liste par état pour ne garder que les tournois en cours ;
- suivre le remplissage : chaque tournoi de la liste affiche une **barre de
  remplissage** (`inscrits / slots`, pourcentage), les places restantes et le
  nombre de participations payées / en attente ;
- ouvrir **📋 Voir les inscriptions** : un panneau dédié affiche, pour le tournoi
  choisi, la même barre de remplissage puis chaque inscription avec pseudo du
  site, pseudo en jeu, prénom, nom, date de naissance, identité complète, date
  d'inscription, statut d'inscription et statut de paiement ;
- depuis ce panneau : confirmer, mettre en liste d'attente, annuler, marquer
  payé, **rembourser** (libère la place), **remettre en attente de paiement** ou
  **🗑️ supprimer définitivement l'inscription** (après confirmation ; l'équipe
  éventuelle n'est pas supprimée et peut être réinscrite).

Il n'y a plus de case « Publier » : un tournoi est publié dès que son statut
n'est pas `draft`. Le statut `draft` (Brouillon) le masque du site et de l'app ;
il sert à préparer la fiche avant ouverture. Pour rendre les inscriptions
possibles : statut `open`. Un tournoi BO9 dont les 9 jeux ne sont pas choisis
est enregistré en brouillon.

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
- bouton **S'inscrire**, **Gérer mon équipe** ou **📋 Gérer mon inscription**
  (quand le joueur est déjà inscrit), plus **Fiche** (modale détaillée) et
  **Toornament** si un lien est renseigné. **Gérer mon inscription** mène
  directement à **Mon espace → Mes inscriptions**
  (`?tab=account&account=registrations`), où le joueur suit son statut, règle
  son inscription et modifie son pseudo en jeu.

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

## Formulaire de contact

Le menu supérieur du site (versions desktop et mobile) propose **✉️ Contact**.
Le bouton ouvre une modale contenant exactement le formulaire de l'application :
identité, objet, champs de candidature streameur quand l'objet
« Recrutement streameur » est choisi, message, vérification anti-robot et
honeypot. Le script `tournoi-site/contact-form.js` est une copie de
`contact-form.js` : mêmes identifiants HTML, même Edge Function
`contact-message`, mêmes messages enregistrés dans la boîte de réception admin
de l'app. Aucun e-mail n'est envoyé automatiquement.

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
   fiches, lien direct `?tab=…` / `?tournament=…` ;
7. menu **✉️ Contact** : modale ouverte depuis le menu desktop et mobile,
   question anti-robot chargée, bascule candidature streameur, envoi reçu dans
   la boîte de réception admin de l'application.

## Poules, classements et départage (format standard)

- **Barème** : victoire 3, nul 1, défaite 0 (classement standard et Décathlon).
- **Classement** : points, puis différence de buts, puis buts marqués. Le point de départage
  s'ajoute aux points et compte partout (classement, couleurs, tableau, ronde suisse).
- **Couleurs** : points en vert pour les qualifiés (rang ≤ `qualifiers_per_pool`), en rouge
  sinon. Le nombre de rounds passe en bleu dès qu'une équipe a joué tous ses matchs de poule.
- **Colonnes** : `Round` (matchs joués), V, N, D, Pts, Diff. Largeurs fixes, identiques dans
  chaque poule (`table-layout: fixed` avec largeurs en style).
- **Départage** (admin, section « Départage (matchs de poule) ») : par poule, seules les
  équipes à égalité de points sont proposées, avec +1 / −1. Le point est stocké dans
  `format_config.tiebreaks` (`{ teamId: points }`) et affiché « +1⚖️ » à côté des points.
- **Logos** : le logo de chaque équipe est affiché avant son nom dans les cartes de match et
  dans l'arbre (site et app). Sans logo : `./Logos/no-logo.jpeg`.

## Seed, composition des poules et tableau

- **Seed approximatif** (onglet admin « 🎯 Seed approximatif », tournois par équipe) : une
  case par seed (1 = le plus fort), chacune avec une liste déroulante d'équipes. Choisir une
  équipe déjà placée ailleurs la déplace. « ✍️ Finir le remplissage » place les équipes
  restantes dans les cases vides, dans l'ordre de la liste admin. Stocké dans
  `format_config.seed_order` (tableau d'identifiants ou `null`).
- **Répartition des poules** : seed 1 en poule A, 2 en B, 3 en C, 4 en D, puis 5 en A, etc.
  « 🎲 Répartir aléatoirement » ignore le seed. « Générer les poules » utilise le seed s'il
  existe.
- **Composition manuelle** (onglet Poules, avant la génération) : la poule de chaque équipe
  se choisit (A, B…) ou reste en « Auto ». Stocké dans `format_config.pool_assignment`
  (`{ teamId: 'A' }`). Les équipes en « Auto » vont dans la poule la moins remplie.
- **Croisement des poules → tableau** (poules paires, nombre total de qualifiés puissance de 2) :
  les poules A-B, C-D… se croisent (1er de A contre le dernier qualifié de B, etc.). Les matchs
  les plus forts sont répartis entre les moitiés du tableau : les premiers de poule ne se
  rencontrent qu'en finale. Pour les autres cas (poules impaires, nombre non puissance de 2),
  le tableau garde le placement par seed.
- **Boutons par onglet** : Poules → « Générer les poules », « Effacer les matchs » ;
  Bracket → « Générer le bracket ». Les formats à élimination directe ont leur génération dans
  l'onglet Bracket.
- **Alerte d'écart** : si le classement a changé après la génération du tableau, un encart
  propose « Régénérer le bracket ». La régénération est refusée dès qu'un match de la phase finale
  a commencé.
- **Placement du tableau** (onglet Bracket) : chaque case du premier tour est une liste
  déroulante ; changer une équipe échange les deux équipes de place. Figé dès que le premier
  match de la phase est joué (contrôle côté interface et côté enregistrement).

## Scores

- **Enregistrer** : écrit le score (standard, BO3, Décathlon). Résultat seulement quand le
  tournoi est « En cours ».
- **↺ Réinitialiser** (à côté d'« Enregistrer », sur chaque match) : efface les scores tapés à
  l'écran. Si un résultat est enregistré, demande confirmation, remet le match à « non joué » et
  retire le vainqueur (et le perdant du repêchage) du tour suivant, à condition que ce tour n'ait
  pas commencé. Les colonnes `games`, `captain_card` et `mercy` reçoivent leurs valeurs par défaut
  (`[]`, `{}`, `false`) : elles ne sont pas nulles en base.

## Application (`tournoi9.js`)

Vue en lecture seule, même règles que le site : classements (Round en bleu, points verts ou
rouges, départage affiché), logos des équipes devant les noms, arbre et cartes de match. Les
données viennent des mêmes vues publiques (`nvg_tournament_teams_public` avec `logo_url`).

## PWA du site

- `tournoi-site/manifest.json` : nom « Tournoi des 9 Mondes », couleur de fond `#07090e`.
- Icônes à fond sombre dans `tournoi-site/Logos/` (`icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`), créées à partir du logo du tournoi (qui est transparent).
  Sans manifeste, le téléphone reprenait le favicon sur fond blanc.
- Le nom et l'icône sont figés à l'installation : après un changement, réinstaller le site.

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
- **Validation automatique Weezevent** : la nouvelle interface ne renvoie pas
  d'URL de retour ni de webhook visible. Le retour de paiement (`nvg_tournament_payment_return`)
  n'est donc alimenté que par un accès API partenaire ou un relais externe ; à défaut,
  la validation se fait à la main depuis l'admin.
- **Décathlon (BO9)** : le croisement des poules, le seed et la composition manuelle des
  poules ne concernent que le format standard. Le BO9 garde sa génération aléatoire.
- **Démarrage des phases** : le placement du tableau est figé dès le premier match joué ;
  un match joué se remet à zéro avec « ↺ Réinitialiser » (pas de correction de score en place).
- Aucun secret dans `tournoi-site/` : seulement l'URL Supabase et la clé `anon`,
  qui sont publiques par conception.
