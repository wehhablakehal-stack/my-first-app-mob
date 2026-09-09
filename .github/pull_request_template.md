## Description

<!-- Ce que fait cette PR, en deux ou trois phrases. -->

## Type de changement

- [ ] Nouvelle fonctionnalité
- [ ] Correction de bug
- [ ] Changement cassant (comportement existant modifié)
- [ ] Documentation
- [ ] Refactoring / style (aucun changement de comportement)

## Changements

<!-- Le détail, par zone. Exemple :
**EduLearn** — nouveau widget X, calcul Y déplacé vers Z.
**Écran de veille** — délai d'inactivité passé à N secondes.
-->

## Comment tester

1. `npm run dev`
2. <!-- Les étapes exactes pour voir le changement : quel widget ouvrir, quel bouton cliquer, ce qui doit se passer. -->

## Captures d'écran

<!-- Avant / après pour tout changement visuel. Supprimer cette section sinon. -->

## Checklist

- [ ] `node --check src/main.js` passe
- [ ] Vérifié dans le navigateur (pas seulement en lecture de code)
- [ ] Les SVG ajoutés sont du XML valide
- [ ] Aucune donnée binaire dans `localStorage` (IndexedDB pour l'audio et les photos)
- [ ] La langue de l'interface suit la zone modifiée (coque iOS en anglais, EduLearn et écran de veille en français, musique en arabe)
- [ ] CLAUDE.md mis à jour si l'architecture change
