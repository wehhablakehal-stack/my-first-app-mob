# my first siteweb

Une simulation d'iPhone 17 Pro Max dans le navigateur : châssis en CSS, écran
d'accueil avec widgets réorganisables, écran de veille, et dix applications qui
fonctionnent vraiment.

Aucun framework, aucune dépendance à l'exécution — juste HTML, CSS et JavaScript
moderne, servis par Vite.

## Démarrer

```bash
npm install
npm run dev       # serveur de développement (l'URL s'affiche dans le terminal)
npm run build     # build de production dans dist/
npm run preview   # prévisualiser le build
```

## Les applications

| App | Ce qu'elle fait |
|---|---|
| **EduLearn** | Tableau de bord d'apprentissage : objectif quotidien, progression par matière, série (streak), lecteur de leçon |
| **صوت الحق** | Lecteur audio : lit tes MP3 locaux, lit les tags ID3 (titre, artiste, pochette), lecture via Web Audio |
| **Photos / Caméra** | Prend de vraies photos avec ta webcam, les stocke, corbeille incluse |
| **Fichiers** | Parcourt un vrai dossier de ton PC (File System Access API) |
| **Réglages** | Fond d'écran, thème clair/sombre, format 24 h, réinitialisations |
| **Compteur, Météo, Batterie, Activité** | Petites applications de démonstration |

Plus un **écran de veille** façon iOS qui apparaît après 60 s d'inactivité — on le
quitte en glissant vers le haut, par un clic ou une touche. Le bouton latéral
droit verrouille immédiatement.

## Fonctionnement

Tous les écrans existent déjà dans `index.html` ; la navigation ne fait que
basculer une classe `.open`, et la transition de zoom est en CSS pur. `src/main.js`
est une suite de fonctions `setup*()` indépendantes, chacune responsable d'une
application. L'état est conservé dans `localStorage` (une clé par sujet), sauf les
données binaires — audio et photos — qui vont dans IndexedDB.

Les détails d'architecture sont dans [CLAUDE.md](CLAUDE.md).

## Compatibilité

Navigateur de bureau à jour requis. Certaines applications s'appuient sur des API
récentes : File System Access (Fichiers), getUserMedia (Caméra), Web Audio
(صوت الحق). Sans elles, l'application se charge quand même — seules ces
fonctionnalités sont indisponibles.
