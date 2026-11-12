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
  onglet **Créer un compte** (pseudo, e-mail, mot de passe + confirmation).
- Le site ne présente jamais ce compte comme celui de l'application NVG ou de
  l'espace bot Discord : l'interface parle uniquement de « Compte Tournoi des
  9 Mondes ». Techniquement il s'agit bien d'une session Supabase Auth classique
  et de la table `nvg_users`, ce qui permet de rejoindre une équipe et de
  s'inscrire sans second compte.
- À l'inscription, le pseudo est envoyé dans `options.data.name` ; le trigger
  `nvg_create_profile` crée la ligne `nvg_users` (`name`, `email`,
  rang `Petit Viking`, rôle `Membre`, `verified = false`).
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

## Modèle de données

Tables (préfixe `nvg_tournament_`) :

| Table | Rôle |
|---|---|
| `nvg_tournament_games` | jeux proposés (nom, slug, logo) |
| `nvg_tournaments` | tournois : mode `solo`/`team`, format `online`/`lan`/`both`, places, prix, dates, statut, publication |
| `nvg_tournament_teams` | équipes : nom, tag, capitaine, code d'invitation unique |
| `nvg_tournament_team_members` | appartenance joueur ↔ équipe, rôle `captain`/`member` |
| `nvg_tournament_registrations` | inscriptions solo ou équipe, statut `pending`/`confirmed`/`waitlist`/`cancelled` |

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

## Parcours membre

1. Onglet **Tournois** : fiche du tournoi (jeu, mode, format, date, places, prix).
2. **S'inscrire** :
   - tournoi solo → confirmation directe, pseudo en jeu facultatif ;
   - tournoi en équipe → création de l'équipe (nom + tag).
3. Après création, un **lien d'invitation** est affiché :
   `https://letournoides9mondes.nvg-tv.com/?join=CODE`.
4. Les coéquipiers se connectent avec leur compte Tournoi des 9 Mondes : le code
   est prérempli (y compris après connexion si le lien est ouvert déconnecté).
5. Onglet **Mon espace** : équipes, membres, code, inscription de l'équipe,
   annulation, liste des inscriptions.
6. Le capitaine peut dissoudre l'équipe ; un membre peut la quitter.

## Back-office NVG

Onglet **Admin** (visible uniquement pour les admins) :

- créer un jeu (nom, logo facultatif) ;
- créer un tournoi : jeu, mode, format, statut, joueurs min/max, places, prix,
  date de début, clôture des inscriptions, description, publication ;
- modifier un tournoi existant (même champs) ou le supprimer ;
- changer le statut directement depuis la liste ;
- confirmer, mettre en attente ou annuler les 100 dernières inscriptions.

Créer un tournoi en `draft` non publié permet de préparer la fiche avant
ouverture. Pour rendre les inscriptions possibles : statut `open` **et**
`published` coché.

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
4. création de compte sur le site (pseudo, e-mail, mot de passe), réception du
   lien de confirmation, connexion, création d'équipe, lien d'invitation,
   inscription solo/équipe ;
5. côté admin : création d'un jeu et d'un tournoi, confirmation d'une inscription.

## Limites connues

- **Toornament** : pas d'accès API pour l'instant. Aucune synchronisation ;
  prévoir un export compatible (JSON/CSV) quand l'accès sera ouvert.
- **Identité visuelle** : le logo officiel et son favicon dédié sont versionnés
  dans `tournoi-site/Logos/`. Le logo web est une version optimisée (1200×896)
  de l'original 2400×1792 conservé hors dépôt (Dropbox `NVG-LT9M`) ; en cas
  d'absence, les pages retombent sur `logo-nvg.png` via `onerror`.
- Les annonces d'événements détaillées (articles) ne sont pas encore gérées :
  la description, le règlement et le prix de chaque tournoi servent de support.
- Pas de paiement ni de gestion de scores/brackets : Toornament ou un back-office
  ultérieur prendra le relais.
- Aucun secret dans `tournoi-site/` : seulement l'URL Supabase et la clé `anon`,
  qui sont publiques par conception.
