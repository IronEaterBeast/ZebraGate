<div align="center">

![ZebraGate](/web/default/public/logo.png)

# ZebraGate

🍥 **Passerelle de grands modèles de nouvelle génération et système de gestion d'actifs d'IA**

<sub>Ce projet est basé sur le projet open source [New API](https://github.com/QuantumNous/new-api), sous licence AGPL v3.0.</sub>

<p align="center">
  <a href="./README.zh_CN.md">简体中文</a> |
  <a href="./README.zh_TW.md">繁體中文</a> |
  <a href="./README.md">English</a> |
  Français |
  <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="#-démarrage-rapide">Démarrage rapide</a> •
  <a href="#-fonctionnalités">Fonctionnalités</a> •
  <a href="#-déploiement">Déploiement</a> •
  <a href="#-documentation">Documentation</a> •
  <a href="#-support">Support</a>
</p>

<p align="center">
  🌐 <a href="https://zebragate.com">ZebraGate.com</a>
</p>

</div>

## 📝 À propos

ZebraGate est une passerelle unifiée d'agrégation et de distribution de grands modèles. Elle convertit divers grands modèles de langage en API compatibles OpenAI, Claude et Gemini, et fournit la gestion des utilisateurs, la facturation, la limitation de débit et un tableau de bord visuel — une gestion centralisée des modèles et une passerelle API pour les particuliers et les entreprises.

> [!IMPORTANT]
> - Ce projet est destiné uniquement aux scénarios légalement autorisés : passerelle API d'IA, authentification interne d'organisation, gestion multi-modèles, statistiques d'utilisation, comptabilité des coûts et déploiement auto-hébergé.
> - Les utilisateurs doivent obtenir légalement les clés API, comptes, services de modèles ou permissions d'interface en amont, et respecter les conditions de service en amont ainsi que les lois et réglementations applicables.
> - Les utilisateurs sont responsables de s'assurer que leur utilisation est conforme aux conditions de service en amont et aux lois et réglementations applicables.
> - Lors de la fourniture de services d'IA générative au public, les utilisateurs doivent accomplir eux-mêmes les obligations de conformité requises dans leur juridiction : déclaration, licence, sécurité du contenu, vérification d'identité, conservation des journaux, fiscalité et autorisation en amont.

---

## 🚀 Démarrage rapide

> [!NOTE]
> Les images et le dépôt dédiés à ZebraGate arrivent bientôt. L'exemple de démarrage rapide ci-dessous utilise l'image de base de New API en amont — remplacez-la par votre propre artefact de déploiement.

### Avec Docker

```bash
# Avec SQLite (par défaut)
docker run --name zebragate -d --restart always \
  -p 3000:3000 \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  calciumion/new-api:latest

# Avec MySQL
docker run --name zebragate -d --restart always \
  -p 3000:3000 \
  -e SQL_DSN="root:123456@tcp(localhost:3306)/oneapi" \
  -e TZ=Asia/Shanghai \
  -v ./data:/data \
  calciumion/new-api:latest
```

> **💡 Astuce :** `-v ./data:/data` stocke les données dans le dossier `data` du répertoire courant. Vous pouvez aussi utiliser un chemin absolu comme `-v /your/custom/path:/data`.

🎉 Une fois déployé, accédez à `http://localhost:3000` pour commencer !

> [!WARNING]
> Lors de l'exploitation de ce projet comme service d'IA générative destiné au public ou comme service de revente d'API, les utilisateurs doivent d'abord accomplir les obligations de conformité : déclaration, sécurité du contenu, vérification d'identité, conservation des journaux, fiscalité, paiement et autorisation en amont.

---

## ✨ Fonctionnalités

### 🎨 Cœur

| Fonctionnalité | Description |
|----------------|-------------|
| 🎨 Interface moderne | Conception d'interface utilisateur entièrement nouvelle |
| 🌍 Multilingue | Chinois, anglais, français, japonais, et plus |
| 🔄 Compatibilité des données | Entièrement compatible avec la base de données One API d'origine |
| 📈 Tableau de bord | Console visuelle avec statistiques et analyses |
| 🔒 Contrôle d'accès | Groupement de jetons, restrictions de modèles, gestion des utilisateurs |

### 💰 Utilisation autorisée et gestion des coûts

- ✅ Recharges internes et allocation de quotas dans des scénarios autorisés (EPay, Stripe)
- ✅ Comptabilité des coûts par requête, par usage ou par cache au sein des organisations
- ✅ Statistiques de facturation du cache pour OpenAI, Azure, DeepSeek, Claude, Qwen, et plus
- ✅ Configuration flexible de la politique de facturation pour la gestion interne ou les clients entreprises

### 🔐 Authentification et sécurité

- 😈 Connexion OAuth Discord
- 🤖 Connexion OAuth LinuxDO
- 📱 Connexion OAuth Telegram
- 🔑 Authentification unifiée OIDC
- 🔍 Consultation du quota par clé

### 🚀 Avancé

**Prise en charge des formats d'API :**
- ⚡ OpenAI Responses
- ⚡ OpenAI Realtime API (Azure inclus)
- ⚡ Claude Messages
- ⚡ Google Gemini
- 🔄 Modèles Rerank (Cohere, Jina)

**Routage intelligent :**
- ⚖️ Sélection aléatoire pondérée des canaux
- 🔄 Nouvelle tentative automatique en cas d'échec
- 🚦 Limitation de débit des modèles par utilisateur

**Conversion de format :**
- 🔄 **OpenAI Compatible ⇄ Claude Messages**
- 🔄 **OpenAI Compatible → Google Gemini**
- 🔄 **Google Gemini → OpenAI Compatible** - texte uniquement, appels de fonctions non pris en charge
- 🚧 **OpenAI Compatible ⇄ OpenAI Responses** - en développement
- 🔄 **Conversion raisonnement vers contenu**

---

## 🤖 Modèles pris en charge

| Type | Description |
|------|-------------|
| 🤖 OpenAI-Compatible | Modèles compatibles OpenAI |
| 🤖 OpenAI Responses | Format OpenAI Responses |
| 🎨 Midjourney-Proxy | [Midjourney-Proxy(Plus)](https://github.com/novicezk/midjourney-proxy) |
| 🎵 Suno-API | [Suno API](https://github.com/Suno-API/Suno-API) |
| 🔄 Rerank | Cohere, Jina |
| 💬 Claude | Format Messages |
| 🌐 Gemini | Format Google Gemini |
| 🔧 Dify | Mode ChatFlow |
| 🎯 Upstream personnalisé | Configurer des points de terminaison en amont légalement autorisés |

---

## 🚢 Déploiement

### 📋 Prérequis

| Composant | Exigence |
|-----------|----------|
| **BD locale** | SQLite (monter `/data` pour Docker) |
| **BD distante** | MySQL ≥ 5.7.8 ou PostgreSQL ≥ 9.6 |
| **Conteneur** | Docker / Docker Compose |

### ⚙️ Variables d'environnement

<details>
<summary>Variables d'environnement courantes</summary>

| Variable | Description | Défaut |
|----------|-------------|--------|
| `SESSION_SECRET` | Clé de session (requise pour le multi-nœuds) | - |
| `CRYPTO_SECRET` | Clé de chiffrement (requise avec Redis) | - |
| `SQL_DSN` | Chaîne de connexion à la base de données | - |
| `REDIS_CONN_STRING` | Chaîne de connexion Redis | - |
| `STREAMING_TIMEOUT` | Délai d'expiration du streaming (secondes) | `300` |
| `STREAM_SCANNER_MAX_BUFFER_MB` | Tampon max par ligne pour le streaming (MB) | `64` |
| `MAX_REQUEST_BODY_MB` | Taille max du corps de requête (MB, **après décompression**) | `32` |
| `AZURE_DEFAULT_API_VERSION` | Version de l'API Azure | `2025-04-01-preview` |
| `ERROR_LOG_ENABLED` | Activation des journaux d'erreurs | `false` |

</details>

### ⚠️ Notes sur le déploiement multi-nœuds

> [!WARNING]
> - **Doit définir** `SESSION_SECRET` — sinon l'état de connexion sera incohérent.
> - **Doit définir** `CRYPTO_SECRET` lors du partage de Redis — sinon les données ne pourront pas être déchiffrées.

### 🔄 Nouvelle tentative de canal et cache

**Nouvelle tentative :** `Paramètres → Opérations → Général → Nombre de tentatives en cas d'échec`

**Cache :**
- `REDIS_CONN_STRING` : cache Redis (recommandé)
- `MEMORY_CACHE_ENABLED` : cache en mémoire

---

## 📚 Documentation

Pour plus de documentation et de guides, visitez le site officiel : [ZebraGate.com](https://zebragate.com)

---

## 🔗 Projets liés

| Projet | Description |
|--------|-------------|
| [New API](https://github.com/QuantumNous/new-api) | Base en amont de ce projet |
| [One API](https://github.com/songquanpeng/one-api) | Base du projet d'origine |
| [Midjourney-Proxy](https://github.com/novicezk/midjourney-proxy) | Prise en charge de l'interface Midjourney |

---

## 💬 Support

| Ressource | Lien |
|-----------|------|
| 🌐 Site web | [ZebraGate.com](https://zebragate.com) |
| 🐛 Retours | [ZebraGate.com](https://zebragate.com) |

### 🤝 Contribuer

Toutes les formes de contribution sont les bienvenues : signaler des bugs, proposer des fonctionnalités, améliorer la documentation, soumettre du code.

---

## 🙏 Remerciements

- Merci à [JetBrains](https://www.jetbrains.com/) de fournir des licences de développement open source gratuites.
- Ce projet est basé sur [New API](https://github.com/QuantumNous/new-api) et [One API](https://github.com/songquanpeng/one-api). Nos sincères remerciements aux deux.

---

## 📜 Licence

Ce projet est sous licence [GNU Affero General Public License v3.0 (AGPLv3)](./LICENSE).

C'est un projet open source développé sur la base de [New API](https://github.com/QuantumNous/new-api) (AGPLv3) et [One API](https://github.com/songquanpeng/one-api) (MIT).

---

<div align="center">

### 💖 Merci d'utiliser ZebraGate

Si ce projet vous aide, n'hésitez pas à nous donner une ⭐️ Star !

**[ZebraGate.com](https://zebragate.com)**

</div>
