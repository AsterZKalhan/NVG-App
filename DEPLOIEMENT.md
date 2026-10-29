# Déploiement — NVG Companion

## 1. Fichiers à envoyer

Destination : **racine du site** `app.nvg-tv.com` (le dossier qui contient déjà `index.html`).

| Fichier local | Destination | Action |
|---|---|---|
| `manifest.json` | `/manifest.json` | **Remplace** l'existant |
| `privacy.html` | `/privacy.html` | Nouveau |
| `Logos/icon-192.png` | `/Logos/icon-192.png` | Nouveau |
| `Logos/icon-512.png` | `/Logos/icon-512.png` | Nouveau |
| `Logos/icon-maskable-512.png` | `/Logos/icon-maskable-512.png` | Nouveau |

Total : 5 fichiers, environ 130 Ko.

### À ne PAS envoyer maintenant

- `.well-known/assetlinks.json` — contient des empreintes factices. À déployer
  seulement après le premier upload Play Console (étape 5).
- `.well-known/.htaccess` — même chose, une fois le fichier réel prêt.
- `README.md` et `.gitignore` — uniquement pour GitHub, inutiles sur le serveur.

### Avant de remplacer le manifest

Télécharge l'actuel depuis le serveur et garde-le sous `manifest.json.backup`.
C'est le seul fichier existant que l'on écrase.

## 2. Vérifications après upload

### a) Les URLs répondent

| URL | Attendu |
|---|---|
| `https://app.nvg-tv.com/manifest.json` | HTTP 200, `Content-Type: application/json` |
| `https://app.nvg-tv.com/privacy.html` | HTTP 200, `text/html` |
| `https://app.nvg-tv.com/Logos/icon-192.png` | HTTP 200, `image/png` |
| `https://app.nvg-tv.com/Logos/icon-512.png` | HTTP 200, `image/png` |
| `https://app.nvg-tv.com/Logos/icon-maskable-512.png` | HTTP 200, `image/png` |

### b) Le manifest est valide côté navigateur

Chrome sur PC → ouvrir `https://app.nvg-tv.com` → `F12` → onglet **Application**
→ **Manifest**.

Attendu :
- Nom : `Normandy Viking Gaming - Companion`
- 3 icônes affichées (192, 512, maskable)
- Statut : **Installable** / « Installability: installable »

### c) L'app fonctionne toujours

Se connecter, vérifier que le calendrier s'affiche, ouvrir l'onglet Live.
Le nouveau manifest ne touche pas au code métier — si quelque chose casse ici,
le problème vient du déploiement, pas du manifest.

### d) Sur téléphone Android

Chrome → `app.nvg-tv.com` → menu → **Installer l'application**.
L'icône doit apparaître correctement (logo entier, pas rogné).

## 3. En cas de problème

| Symptôme | Cause probable | Correction |
|---|---|---|
| 404 sur les icônes | mauvais dossier FTP | vérifier `/Logos/` et la casse des noms |
| Manifest non détecté | `manifest.json` à la mauvaise racine | il doit être au même niveau que `index.html` |
| Chrome signale une icône invalide | cache navigateur | vider le cache / tester en navigation privée |
| L'app ne s'installe plus | manifest écrasé par erreur | restaurer `manifest.json.backup` |

Retour arrière complet : remplacer `manifest.json` par `manifest.json.backup`.
`privacy.html` et les icônes sont de simples ajouts, ils ne cassent rien.

## 4. Ensuite

Une fois les 5 fichiers en ligne et les vérifications passées :

1. Upload des mêmes fichiers sur GitHub (source).
2. Création du compte Google Play **personnel** + lancement du test fermé
   (12 testeurs, 14 jours consécutifs — à démarrer au plus tôt).
3. PWABuilder : `https://www.pwabuilder.com/` → génération du `.aab` signé
   + `assetlinks.json` avec les vraies empreintes.
4. Upload Play Console → récupération de l'empreinte **Play App Signing** →
   mise à jour de `.well-known/assetlinks.json` → déploiement FTP.
