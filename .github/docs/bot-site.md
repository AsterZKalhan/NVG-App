# Espace de gestion du bot Discord — `bot-discord.nvg-tv.com`

Page publique permettant aux membres NVG qui administrent un serveur Discord d'y configurer le bot « NVG Vikingbot » eux-mêmes, sans passer par l'espace admin de l'application.

## Adresse et fichiers

- URL : `https://bot-discord.nvg-tv.com/`
- Code : `bot-site/`
- Déploiement : `.github/workflows/deploy-bot.yml` → `.github/scripts/deploy_bot_sftp.py` → dossier distant `/BOT` uniquement.
- Le site principal reste déployé dans `/APP` par `deploy.yml`.

Le sous-domaine pointe vers le dossier `/BOT` de l'hébergement IONOS. La redirection OAuth2 enregistrée dans le portail Discord doit être **exactement** `https://bot-discord.nvg-tv.com/`, slash final compris.

La page est accessible depuis l'application par le menu **🤖 Bot Discord (Staff & Admin)** (onglet `bot`), qui affiche le message d'invitation et deux liens vers le site. Ce menu est visible pour les rangs Viking, Grand Jarl, Divinité et les rôles staff/admin, et protégé dans `showTab`.

## Parcours utilisateur

1. Connexion avec le **compte NVG** (même e-mail et mot de passe que l'application, Supabase Auth).
2. Bouton **Se connecter avec Discord** (OAuth2, scopes `identify` et `guilds`).
3. Discord renvoie la liste des serveurs du membre. Seuls ceux où il est **propriétaire** ou possède **Gérer le serveur** sont retenus.
4. La page affiche :
   - les serveurs où le bot est présent : cases par type d'annonce et choix du salon, enregistrement, départ du bot ;
   - les serveurs administrés où le bot est absent : bouton **Ajouter le bot**, avec le serveur présélectionné.
5. Le jeton Discord est utilisé le temps de lire les serveurs, puis oublié. Il n'est jamais stocké.

## Base de données

Table `nvg_discord_managers` (SQL : `.github/sql/create-discord-managers.sql`) :

| Colonne | Rôle |
|---|---|
| `user_id` | Compte NVG (`auth.users.id`) |
| `guild_id` | Serveur Discord |
| `guild_name`, `guild_icon` | Nom et icône affichés dans l'espace |
| `updated_at` | Date de la dernière connexion Discord |

Clé primaire `(user_id, guild_id)`, index sur `guild_id`, RLS activée, aucun droit `anon` / `authenticated`. Seule la clé de service (fonctions Edge) y accède.

La table est **remplacée à chaque connexion Discord** de l'utilisateur : les serveurs qu'il ne gère plus disparaissent. Entre deux connexions, les droits enregistrés restent valables.

## Fonctions Edge

### `discord-oauth`

- Reçoit `{ code }` et le JWT Supabase de la page.
- Vérifie la session (`/auth/v1/user`) et l'existence du profil dans `nvg_users`.
- Échange le code auprès de Discord (`/oauth2/token`) avec le secret `DISCORD_OAUTH_SECRET`.
- Lit `/users/@me/guilds` avec le jeton du membre, filtre propriétaire ou permission `MANAGE_GUILD` (`0x20`).
- Remplace les lignes de `nvg_discord_managers` pour ce compte.
- Ne renvoie jamais le jeton ni le secret.

### `discord-bot` (actions de configuration)

Toutes les actions vérifient l'appelant côté serveur :

| Action | Admin NVG | Gestionnaire du serveur |
|---|---|---|
| `list_guilds` | Tous les serveurs où le bot est présent | Uniquement ceux de `nvg_discord_managers`, avec `bot_present` |
| `list_channels` | Oui | Oui, si le serveur est dans la table **et** le bot présent |
| `save_routes` | Oui | Oui, même condition |
| `leave_guild` | Oui | Oui, même condition |
| `publish` | Oui | Non |
| `register_commands` | Oui | Non |

Le navigateur ne décide jamais des droits : un identifiant de serveur envoyé à la main est refusé s'il n'est pas dans `nvg_discord_managers` (sauf admin). Les routes d'annonces restent dans `nvg_discord_routes`.

## Conditions d'utilisation

- Page : `https://bot-discord.nvg-tv.com/terms.html` (fichier `bot-site/terms.html`).
- Éditeur : Normandy Viking Gaming, association loi 1901 (RNA W612003127), 8 square des Capucines, 61220 Briouze.
- Contact : `contact@nvg-tv.com`.
- La page couvre le bot, les commandes, les annonces, les règles d'utilisation, les données traitées, la responsabilité et le retrait du bot.
- Elle est liée depuis le pied de page de l'espace de gestion et depuis l'onglet **🤖 Bot Discord** de l'application.
- Dans le portail Discord, champ **Terms of Service URL** : `https://bot-discord.nvg-tv.com/terms.html`. Pour la politique de confidentialité, utiliser la page de l'application (`https://app.nvg-tv.com/privacy.html`) ou l'ancre `https://bot-discord.nvg-tv.com/terms.html#donnees`.

## Configuration côté Discord

Dans le portail développeur, application `1569625316601757747` :

1. **OAuth2 → Redirects** : `https://bot-discord.nvg-tv.com/`
2. **OAuth2 → Client Secret** : recopier la valeur dans le secret Supabase `DISCORD_OAUTH_SECRET`. Ne jamais l'écrire dans le dépôt.
3. Le bot doit déjà être invité avec `scope=bot` et `permissions=8`.
4. Les commandes slash restent enregistrées depuis l'onglet admin de l'app.

## Sécurité

- Aucun secret dans `bot-site/` : seulement l'URL Supabase, la clé **anon** publique et l'identifiant d'application Discord, qui sont publics.
- Le client secret OAuth2 reste dans Supabase (`DISCORD_OAUTH_SECRET`).
- Le jeton Discord du membre n'est jamais persisté.
- Le state OAuth est vérifié côté navigateur (`sessionStorage`) avant l'échange du code.
- La redirection autorisée est fixée côté fonction : un `redirect_uri` fourni par le client est ignoré.
- Chaque requête est revérifiée côté fonction, pas seulement à l'affichage.

## Déploiement

```text
git push origin main
→ Deploy bot SFTP (si bot-site/ ou le script change)
→ upload de bot-site/** dans /BOT
```

Vérifier :

```powershell
gh run list --repo AsterZKalhan/NVG-App --limit 3
curl.exe -s -o NUL -w "%{http_code}" https://bot-discord.nvg-tv.com/
```

Une réponse `200` et le HTML de la page confirment le déploiement.

## Tests réalisés (10 novembre 2026)

- Page et ressources en HTTP 200 après déploiement dans `/BOT`.
- `discord-oauth` et `discord-bot` renvoient `401` sans session.
- Compte de test (supprimé après) lié à un seul serveur :
  - `list_guilds` → 1 serveur, `manager: true`, `bot_present: true` ;
  - `list_channels` → 20 salons ;
  - appel sur un autre serveur du bot → `403` ;
  - `save_routes` sur cet autre serveur → `403`.
- Chemin admin NVG non testé directement : le trigger `nvg_protect_roles` empêche de changer le grade d'un compte de test. Le code admin est l'ancien chemin, seulement précédé de `callerInfo`/`isAdmin`.

## Limites connues

- **Droits non temps réel** : ils sont rafraîchis à chaque connexion Discord. Un membre qui perd « Gérer le serveur » garde l'accès jusqu'à sa prochaine connexion Discord.
- **Bot absent** : impossible de lister les salons ; la page propose uniquement l'invitation.
- **Nom du bot** : le nom affiché dans Discord (« Companion NVG ») est un réglage du portail Discord, pas du code. Voir la section suivante.
- **Ni publication manuelle ni enregistrement des commandes** depuis l'espace public : ces actions restent réservées aux admins NVG dans l'application.

## Nom du bot dans Discord

Le nom de l'**application** (« NVG VikingBOT ») et le nom du **compte bot** sont deux réglages distincts :

1. Portail développeur → **General Information** → *Name* : nom de l'application.
2. Portail développeur → **Bot** → *Username* / *Display Name* : nom réel du bot dans les serveurs. C'est lui qui affiche « Companion NVG ».
3. Un **surnom par serveur** peut encore remplacer ce nom : Paramètres du serveur → Membres → clic droit sur le bot → *Changer le surnom*.

Après modification, recharger Discord (Ctrl+R) et attendre quelques minutes. Aucune réinvitation n'est nécessaire.
