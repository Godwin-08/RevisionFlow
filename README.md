# RevisionFlow 📚

> Planificateur de révisions intelligent — 100 % navigateur, zéro inscription.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=flat&logo=javascript&logoColor=black)


---

## Table des matières

- [Présentation](#présentation)
- [Fonctionnalités](#fonctionnalités)
- [Algorithme](#algorithme)
- [Architecture](#architecture)
- [Installation](#installation)
- [Utilisation](#utilisation)
- [Structure du projet](#structure-du-projet)
- [APIs externes](#apis-externes)
- [Auteur](#auteur)

---

## Présentation

RevisionFlow est une application web qui génère automatiquement un planning
de révisions personnalisé, le met à jour en temps réel après chaque action,
et détecte clairement les situations de surcharge.

**Trois principes fondateurs :**

| Principe | Description |
|----------|-------------|
| 🚀 Zéro friction | Aucun compte à créer, aucune installation. Ouvrir et utiliser. |
| 🔍 Transparence | Si le planning est irréaliste, l'application le dit explicitement. |
| ⚡ Réactivité | Toute modification déclenche un recalcul immédiat du planning futur. |

---

## Fonctionnalités

### Assistant de création (Wizard)

- **Étape 1 — Profil** : type Fixe ou Flexible, pays (jours fériés automatiques), date de début
- **Étape 2 — Modules** : nom, date d'examen, difficulté (1–5 étoiles), nombre de chapitres
- **Étape 3 — Disponibilités** : sessions en semaine / week-end, blocage de jours de repos

### Tableau de bord quotidien

- Vue **Aujourd'hui** : sessions du jour, anneau de progression, aperçu des 5 prochains jours
- Vue **Calendrier** : code couleur par jour (fait / en cours / manqué / repos / examen)
- Vue **Modules** : progression par matière, score de priorité en temps réel
- Vue **Réglages** : export/import JSON, mode sombre, reset

### Actions sur une session

| Action | Effet |
|--------|-------|
| ✅ Valider | Session marquée faite, recalcul immédiat du futur |
| 🔄 Reporter | Session replacée automatiquement selon la priorité |
| ⚡ Anticiper | Avance une session du lendemain si la capacité le permet |
| ➕ Jour libre | Transforme la journée en haute capacité |

### Autres fonctionnalités

- **Minuteur Pomodoro** intégré (25 min / 5 min) avec son via Web Audio API
- **Filtres combinables** : statut × module × semaine
- **Jours fériés** automatiques via l'API Nager.Date selon le pays sélectionné
- **Mode sombre** complet activable en un clic
- **Historique** des 5 derniers plannings archivés (taux de complétion, streak, vélocité)
- **Export / Import JSON** pour sauvegarder et transférer son planning

---

## Algorithme

### 1. Score de priorité dynamique

Chaque module reçoit un score calculé à chaque planification :

```
P_i = (difficulté × chapitres) × (1 + 1 / ln(Δt + 2))
```

- **Charge brute** `difficulté × chapitres` : effort total requis pour ce module
- **Multiplicateur d'urgence** : augmente quand l'examen approche,
  amorti par le logarithme pour éviter une explosion du score en cas d'urgence extrême

**Exemple numérique :**

| Module | Difficulté | Chapitres | Δt (jours) | Score P |
|--------|-----------|-----------|------------|---------|
| Analyse | 4 | 6 | 5 | **36.3** |
| Algorithmes | 3 | 5 | 12 | **20.6** |
| Physique | 2 | 3 | 20 | **7.9** |

### 2. Entrelacement des sessions

Pour éviter de faire la même matière en continu, chaque session
supplémentaire du même module dans la même journée est pénalisée :

```
P_i_jour = P_i / 2^k    (k = sessions déjà attribuées ce jour)
```

**Simulation sur une journée à capacité 2 :**

| Slot | Score A | Score Al | Score P | Élu | k |
|------|---------|----------|---------|-----|---|
| 1 | 36.3 | 20.6 | 7.9 | **Analyse** | 0→1 |
| 2 | 18.2 | 20.6 | 7.9 | **Algorithmes** | 0→1 |

Résultat : alternance naturelle même si Analyse est nettement plus prioritaire.

### 3. Algorithme glouton de distribution

Pour chaque jour (ordre chronologique), tant que la capacité n'est pas atteinte :

1. Recalculer les scores avec pénalité d'entrelacement
2. Trier par score décroissant → chapitres décroissants → ordre alphabétique *(déterminisme garanti)*
3. Placer la session la plus prioritaire

Les sessions impossibles à placer sont ajoutées au **backlog**
et signalées immédiatement à l'étudiant.

**Capacité selon le type de jour :**

| Type de jour | Capacité |
|-------------|----------|
| Soir en semaine | `heuresSoir` (configurable) |
| Week-end | `heuresWeekend` (configurable) |
| Jour férié | = Week-end (via Nager.Date) |
| Jour libre | = Week-end (déclaré manuellement) |
| Jour bloqué | 0 |

### 4. Préservation du passé

À chaque recalcul, seuls les jours futurs sont régénérés.
Les jours passés restent intacts pour garantir la cohérence des statistiques
(streak, taux de complétion, vélocité).

```
[Jours passés — intacts] → [Aujourd'hui — sessions non validées soustraites] - - → [Jours futurs — régénérés]
```

### 5. Gestion du backlog

Si des sessions ne peuvent pas être placées avant la date d'examen,
elles sont ajoutées au backlog et un toast d'alerte est affiché :

> *« N sessions ne pourront pas être planifiées »*

L'étudiant peut alors augmenter sa capacité, réduire le volume,
ou déclarer un jour libre.

---

## Architecture

### Structure du projet

```
RevisionFlow/
├── landing/
│   ├── index.html        # Page d'accueil
│   ├── landing.css
│   └── landing.js        # Parallaxe, animations, compteurs
│
├── core/
│   ├── variables.css     # Design system complet (tokens CSS)
│   ├── state.js          # Source de vérité unique (pattern Store)
│   ├── planning.js       # Algorithme de priorité et distribution
│   ├── storage.js        # Persistance localStorage + import/export
│   ├── ui.js             # Toasts, animations, modales
│   └── router.js         # Navigation sans rechargement
│
└── components/
    ├── wizard/           # Assistant de création (3 étapes)
    ├── dashboard/        # Tableau de bord principal
    ├── filter/           # Filtres combinables
    ├── pomodoro/         # Minuteur Pomodoro
    └── history/          # Historique des plannings
```

### Pattern Store

L'état de l'application est géré par un seul objet `State`,
source de vérité unique inspirée de Redux, en JavaScript pur.

```javascript
State.get()           // lecture seule (deep copy)
State.update(obj)     // mise à jour + sauvegarde automatique
State.subscribe(fn)   // réactivité des composants
State.planifier()     // déclenche l'algorithme glouton
```

Chaque appel à `State.update()` :
1. Fusionne les changements dans l'état global
2. Recalcule les statistiques
3. Sérialise en JSON et sauvegarde dans le `localStorage`
4. Notifie tous les composants abonnés

### Persistance des données

| Mécanisme | Description |
|-----------|-------------|
| Sauvegarde automatique | À chaque action, l'état est sérialisé en JSON dans le `localStorage` |
| Restauration au démarrage | La sauvegarde est chargée et le planning recalculé pour intégrer les jours écoulés |
| Export JSON | Téléchargement du planning complet nommé automatiquement avec la date |
| Import JSON | Restauration depuis un fichier `.json` avec validation de structure |
| Migration | `deepMerge(sauvegardé, initial)` — les nouvelles propriétés reçoivent leur valeur par défaut |

---

## Installation

Aucune installation requise. L'application fonctionne entièrement dans le navigateur.

```bash
git clone https://github.com/<votre-pseudo>/RevisionFlow.git
cd RevisionFlow
```

Puis ouvrir `landing/index.html` dans un navigateur.

> **Remarque** : pour éviter les restrictions CORS sur les modules ES6,
> utiliser un serveur local :
>
> ```bash
> # Node.js
> npx serve .
>
> # Python
> python -m http.server 8080
> ```
>
> Puis ouvrir `http://localhost:8080/landing/index.html`

---

## Utilisation

1. Cliquer sur **« Créer mon planning »** depuis la page d'accueil
2. Suivre le wizard en 3 étapes :
   - Choisir son profil (Fixe ou Flexible) et son pays
   - Ajouter ses modules avec date, difficulté et nombre de chapitres
   - Configurer ses disponibilités et bloquer les jours de repos
3. Consulter le dashboard chaque jour et valider les sessions effectuées
4. En cas d'imprévu, modifier une date d'examen ou déclarer un jour libre —
   le planning se recalcule immédiatement

---

## APIs externes

| API | Usage | Endpoint |
|-----|-------|----------|
| [Nager.Date](https://date.nager.at) | Jours fériés par pays | `GET /api/v3/PublicHolidays/{year}/{countryCode}` |

Toutes les autres fonctionnalités utilisent des APIs natives au navigateur :
`localStorage`, `Web Audio API`, `CSS Custom Properties`.

---

## Auteur

**NOUGBOLO Godwin Elie**  
Filière IID1 — ENSA Khouribga  
Encadrante : Pr. RABHI Loubna  
Année universitaire 2025–2026

---

## Licence

Ce projet est sous licence [MIT](LICENSE).