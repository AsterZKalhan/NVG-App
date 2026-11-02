# Sauvegarde complète de Supabase

Ce document décrit la sauvegarde automatique du projet Supabase
`fxewefwwpowhnacrxfdp` : base PostgreSQL, fonctions Edge, fichiers Storage et
configuration. Elle sert de filet de sécurité si Supabase devient indisponible
ou si le projet doit être migré vers un autre hébergement.

Le dépôt GitHub est **public**. Les archives contiennent des données
personnelles (comptes, messages de contact) et des secrets de configuration :
elles sont donc **toujours chiffrées avec GPG (AES256)** avant publication.

## Ce qui est sauvegardé

| Élément | Fichier dans l'archive |
|---|---|
| Base complète, tous schémas | `db/full.dump` (format personnalisé `pg_dump`) |
| Schéma du schéma `public` (tables, index, RLS, triggers, fonctions) | `db/public-schema.sql` |
| Données du schéma `public` | `db/public-data.sql` |
| Comptes Auth (`auth.users`, identités, sessions) | `db/auth-data.sql` |
| Métadonnées Storage | `db/storage-data.sql` |
| Tâches `pg_cron` (dont le nettoyage des lives) | `db/cron-schema.sql`, `db/cron-data.sql` |
| Fonctions Edge déployées | `functions/<nom>/index.ts` |
| Fichiers Storage | `storage/<bucket>/...` |
| Configuration Auth, Storage, Realtime, PostgREST, pooler | `config/*.json` |
| Liste des secrets Edge (noms et empreintes, pas les valeurs) | `config/edge-secrets.json` |
| Clés API du projet | `config/api-keys.json` |
| Manifeste (date, tailles) | `MANIFEST.txt` |

L'archive finale est `nvg-supabase-<date>.tar.gz.gpg`, accompagnée de son
empreinte SHA256.

## Ce qui n'est PAS sauvegardé automatiquement

- **Valeurs des secrets Edge** (`TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`,
  `TWITCH_EVENTSUB_SECRET`, `TWITCH_NOTIFY_TARGET`). L'API Supabase ne les
  renvoie pas en clair. Les conserver dans un gestionnaire de mots de passe.
- **Configuration de la plateforme Supabase** non exposée par l'API (plan,
  sauvegardes physiques, réglages du tableau de bord).
- **Nom de domaine et hébergement statique** : `app.nvg-tv.com` et le SFTP
  IONOS sont indépendants de Supabase.
- **Abonnement Twitch EventSub** : à recréer avec la nouvelle URL de fonction
  après une migration.
- **Sauvegardes continues / PITR** : cette sauvegarde est un instantané
  logique, pas un point de restauration à la seconde.

## Mise en place (une seule fois)

### 1. Récupérer l'URL de connexion PostgreSQL

Dans le tableau de bord Supabase : **Project Settings → Database → Connect**,
puis **Session pooler**. Copier l'URL et remplacer `[YOUR-PASSWORD]` par le mot
de passe de la base (s'il est perdu, le réinitialiser depuis
**Database → Settings → Reset database password**).

L'URL ressemble à :

```
postgresql://postgres.fxewefwwpowhnacrxfdp:MOT_DE_PASSE@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
```

Le port **5432** (session) est important : le port 6543 (transaction) ne
convient pas à `pg_dump`.

### 2. Choisir une phrase secrète

Générer une phrase longue et aléatoire, par exemple :

```bash
openssl rand -base64 32
```

La conserver dans le gestionnaire de mots de passe. **Sans elle, les archives
sont irrécupérables.** Elle ne doit jamais être écrite dans le dépôt.

### 3. Ajouter les secrets GitHub

Dans **GitHub → Settings → Secrets and variables → Actions** :

| Secret | Contenu |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Jeton personnel Supabase (`sbp_...`), créé dans **Account → Access Tokens** |
| `SUPABASE_DB_URL` | URL de connexion complète de l'étape 1 |
| `BACKUP_PASSPHRASE` | Phrase secrète de l'étape 2 |

En ligne de commande :

```bash
gh secret set SUPABASE_ACCESS_TOKEN --repo AsterZKalhan/NVG-App
gh secret set SUPABASE_DB_URL --repo AsterZKalhan/NVG-App
gh secret set BACKUP_PASSPHRASE --repo AsterZKalhan/NVG-App
```

## Lancer une sauvegarde

- **Automatique** : le 1er de chaque mois à 03:23 UTC.
- **Manuelle** : onglet **Actions → Sauvegarde Supabase → Run workflow**.

Le workflow :

1. vérifie la présence des trois secrets ;
2. télécharge la base avec `pg_dump` 17 (image Docker officielle) ;
3. télécharge le source des fonctions Edge avec la CLI Supabase (`--use-api`) ;
4. télécharge les buckets Storage ;
5. récupère la configuration du projet ;
6. crée l'archive, la chiffre avec GPG et calcule son SHA256 ;
7. publie l'archive chiffrée dans une **release** GitHub (`backup-<date>`) ;
8. conserve les **12 dernières** releases et un artefact de 90 jours.

## Vérifier et déchiffrer une archive

Télécharger les deux fichiers depuis la release, puis :

```bash
sha256sum -c nvg-supabase-2026-11-02_032300.tar.gz.gpg.sha256
gpg --output nvg-supabase-2026-11-02.tar.gz --decrypt nvg-supabase-2026-11-02_032300.tar.gz.gpg
tar -xzf nvg-supabase-2026-11-02.tar.gz
```

GPG demande la phrase secrète. Vérifier ensuite le contenu de `MANIFEST.txt`.

## Restaurer vers un autre hébergement

### Base PostgreSQL classique

Créer une base vide, puis restaurer uniquement le schéma `public` :

```bash
psql "$NEW_DATABASE_URL" -f db/public-schema.sql
psql "$NEW_DATABASE_URL" -f db/public-data.sql
```

Pour une restauration complète sur un PostgreSQL compatible Supabase :

```bash
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname "$NEW_DATABASE_URL" db/full.dump
```

`full.dump` contient les schémas internes Supabase (`auth`, `storage`,
`cron`, extensions). Sur un PostgreSQL nu, restaurer plutôt `public`, puis
recréer `auth`/`storage` avec les outils de la nouvelle plateforme.

### Nouveau projet Supabase

1. Créer le projet et récupérer son URL Session pooler.
2. Restaurer `public-schema.sql` puis `public-data.sql`.
3. Recréer les buckets Storage, puis envoyer les fichiers :

   ```bash
   supabase storage cp -r storage/notifs ss:///notifs --project-ref NEW_REF --experimental
   ```

4. Recréer les fonctions Edge :

   ```bash
   for slug in contact-message send-push steam-header twitch-eventsub twitch-live youtube-videos; do
     supabase functions deploy "$slug" --project-ref NEW_REF
   done
   ```

   Vérifier `verify_jwt` dans chaque `metadata.json` (les fonctions
   `contact-message`, `twitch-eventsub`, `twitch-live` et `youtube-videos` sont
   sans JWT).

5. Remettre les secrets Edge depuis le gestionnaire de mots de passe :

   ```bash
   supabase secrets set --project-ref NEW_REF \
     TWITCH_CLIENT_ID=... \
     TWITCH_CLIENT_SECRET=... \
     TWITCH_EVENTSUB_SECRET=... \
     TWITCH_NOTIFY_TARGET=...
   ```

6. Recréer le job `pg_cron` avec `.github/sql/cleanup-live-notifications.sql`.

7. Reconfigurer Auth : Site URL `https://app.nvg-tv.com`, URL de redirection,
   fournisseurs éventuels et SMTP.

8. Mettre à jour `supabase-config.js` avec la nouvelle URL et la nouvelle clé
   `anon`, puis pousser sur `main`.

9. Recréer l'abonnement Twitch EventSub avec l'URL de la nouvelle fonction
   `twitch-eventsub`.

10. Vérifier : connexion, calendrier, notifications push, formulaire de
    contact, vidéos, live Twitch.

## Bonnes pratiques

- Télécharger une archive de temps en temps et la conserver **hors GitHub**
  (disque chiffré, OneDrive, sauvegarde locale).
- Vérifier le SHA256 avant toute restauration.
- Tester une restauration sur une base jetable au moins une fois par an.
- Ne jamais committer une archive déchiffrée ni la phrase secrète.
- La sauvegarde mensuelle ne remplace pas les sauvegardes automatiques de
  Supabase (quotidiennes selon le plan) ni PITR.
