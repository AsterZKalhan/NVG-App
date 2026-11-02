# Sauvegarde locale de Supabase

Ce document décrit la sauvegarde manuelle du projet Supabase `fxewefwwpowhnacrxfdp`
sur le PC de Normandy Viking Gaming. Elle sert de filet de sécurité si Supabase devient
indisponible ou si le projet doit être migré vers un autre hébergement.

**Rien n'est publié sur GitHub.** L'archive reste uniquement dans `C:\Sauvegarde APP NVG`.
Elle n'est **pas chiffrée** : elle contient des données personnelles (comptes, e-mails)
et des clés de configuration (clé JWT, clés API). Ne la copie pas sur un espace partagé.

## Utilisation

Double-clique sur `C:\Sauvegarde APP NVG\Lancer_sauvegarde.bat`.

- Au **premier lancement**, le script demande le mot de passe de la base, puis crée
  `C:\Sauvegarde APP NVG\db-password.txt`. Ce fichier est chiffré avec ton compte Windows :
  il n'est lisible que sur ce PC, sous ton compte.
- Les lancements suivants n'ont rien à demander.
- Si le mot de passe est refusé, le fichier est supprimé et le script le redemande
  (trois essais maximum).
- À la fin, la fenêtre reste ouverte jusqu'à ce que tu appuies sur une touche.

L'archive créée est `C:\Sauvegarde APP NVG\nvg-supabase-<date>_<heure>.zip`.

Si tu changes le mot de passe de la base dans le tableau de bord, supprime
`db-password.txt` : le script le redemandera.

## Contenu de l'archive

| Chemin dans le ZIP | Contenu | Usage |
|---|---|---|
| `db/full.dump` | Base complète, tous schémas (format `pg_dump` personnalisé) | Restauration complète avec `pg_restore` |
| `db/public-schema.sql` | Tables, index, politiques RLS, triggers, fonctions du schéma `public` | Recréer la structure |
| `db/public-data.sql` | Données du schéma `public` (8 tables) | Recréer les données |
| `db/auth-data.sql` | Comptes Auth (`auth.users`, identités) | Recréer les comptes |
| `db/storage-data.sql` | Métadonnées Storage | Recréer les références aux fichiers |
| `db/cron-jobs.sql` | Définition des tâches `pg_cron` (nettoyage des lives) | Recréer les tâches planifiées |
| `functions/<nom>/index.ts` | Source des fonctions Edge déployées | Redéployer les fonctions |
| `storage/<bucket>/...` | Fichiers Storage (bucket `notifs`) | Remettre les fichiers |
| `config/*.json` | Configuration du projet : Auth, Storage, Realtime, PostgREST, pooler, clés API, noms et empreintes des secrets Edge | Référence pour reconfigurer |
| `MANIFEST.txt` | Date, projet et liste des fichiers avec leur taille | Vérification |

**Non inclus :**
- les **valeurs** des secrets Edge (`TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`,
  `TWITCH_EVENTSUB_SECRET`, `TWITCH_NOTIFY_TARGET`) : l'API ne les renvoie pas en clair ;
  il faut les garder dans un gestionnaire de mots de passe ;
- la configuration du tableau de bord non exposée par l'API (plan, sauvegardes, domaines) ;
- le nom de domaine `app.nvg-tv.com` et l'hébergement statique IONOS, indépendants de Supabase ;
- l'abonnement Twitch EventSub, à recréer avec la nouvelle URL de fonction après migration ;
- un point de restauration à la seconde (c'est un instantané, pas un PITR).

## Prérequis sur le PC

- **Outils clients PostgreSQL 17** dans `C:\Program Files\PostgreSQL\17\bin`
  (`pg_dump`, `psql`, `pg_restore`). Les composants serveur ne sont pas nécessaires.
- **CLI Supabase** dans `%LOCALAPPDATA%\Programs\Supabase CLI\supabase.exe`.
- **Variable utilisateur Windows** `SUPABASE_ACCESS_TOKEN` (jeton personnel Supabase, `sbp_...`).
- **Variable utilisateur Windows** `SUPABASE_DB_URL`, modèle sans mot de passe :
  `postgresql://postgres.fxewefwwpowhnacrxfdp:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`
  (le port 5432 est celui du « Session pooler », à ne pas remplacer par 6543).

Le script lui-même est dans le dépôt : `.github/scripts/backup_local.ps1`.
Le `.bat` l'appelle depuis `C:\Users\aster\NVG-App\.github\scripts\` : si le dépôt
est déplacé, il faut modifier le chemin dans le `.bat`.

## Restaurer

Restaurer dans une **base vide** sur le nouvel hébergement. Les commandes utilisent
`$NEW_DB_URL`, à remplacer par l'URL de connexion de la nouvelle base (avec son mot de passe).

### Restauration complète

```powershell
pg_restore --no-owner --no-privileges --clean --if-exists --dbname "$NEW_DB_URL" db\full.dump
```

Sur une base PostgreSQL nue, les schémas internes de Supabase (`auth`, `storage`, `cron`,
extensions) peuvent poser problème. Dans ce cas, restaure seulement les parties utiles :

```powershell
psql "$NEW_DB_URL" -f db\public-schema.sql
psql "$NEW_DB_URL" -f db\public-data.sql
psql "$NEW_DB_URL" -f db\auth-data.sql
psql "$NEW_DB_URL" -f db\storage-data.sql
```

### Tâches planifiées

```powershell
psql "$NEW_DB_URL" -f db\cron-jobs.sql
```

Le fichier contient des `select cron.schedule(...)`. L'extension `pg_cron` doit être
activée sur la nouvelle base d'abord.

### Fonctions Edge

Sur le nouveau projet, redéployer chaque fonction depuis `functions\<nom>\` avec la CLI
(`supabase functions deploy <nom> --project-ref <nouvelle-ref>`). Vérifier le
`verify_jwt` : les fonctions `contact-message`, `twitch-eventsub`, `twitch-live` et
`youtube-videos` sont sans JWT, `send-push` et `steam-header` avec JWT.

Les six fonctions ont aussi leur `index.ts` et leur `metadata.json` dans
`.github/edge-functions/`, à jour avec le projet.

### Secrets Edge

Les valeurs viennent du gestionnaire de mots de passe :

```powershell
supabase secrets set --project-ref <nouvelle-ref> TWITCH_CLIENT_ID=... TWITCH_CLIENT_SECRET=... TWITCH_EVENTSUB_SECRET=... TWITCH_NOTIFY_TARGET=...
```

### Storage

Recréer le bucket `notifs` (public), puis envoyer les fichiers :

```powershell
supabase storage cp -r storage\notifs ss:///notifs --project-ref <nouvelle-ref> --experimental
```

### Auth et configuration

Reprendre dans `config\auth.json` : Site URL `https://app.nvg-tv.com`, URL de redirection,
fournisseurs et SMTP (les secrets SMTP ne sont pas recopiés automatiquement).

### Application

- Mettre à jour `supabase-config.js` avec la nouvelle URL et la nouvelle clé `anon`,
  puis pousser sur `main` pour le déploiement SFTP.
- Recréer l'abonnement Twitch EventSub avec la nouvelle URL de `twitch-eventsub`.
- Vérifier : connexion, calendrier, notifications push, formulaire de contact,
  vidéos, live Twitch.

## Bonnes pratiques

- Lancer une sauvegarde après chaque grosse modification de la base, et au moins une
  fois par mois.
- Garder les archives **hors de ce PC** aussi (disque externe), car un seul disque n'est
  pas une sauvegarde.
- Vérifier de temps en temps le contenu d'une archive (`MANIFEST.txt`).
- Tester une restauration sur une base jetable au moins une fois par an.
- Le fichier `db-password.txt` ne sert qu'à lancer la sauvegarde : il ne contient pas de
  secret utilisable hors de ton compte Windows.
