// ============================================================
// router.js — Navigation entre pages sans rechargement
// ============================================================

const Router = (() => {

    // Pages enregistrées
    // { id, conteneur, entrer, sortir }
    const _pages = {};
    let _pageCourante = null;

    return {

        // Enregistre une page
        // id        — identifiant unique ex: 'wizard'
        // conteneur — sélecteur CSS ou élément DOM
        // hooks     — { entrer(), sortir() } fonctions appelées au changement
        enregistrer(id, conteneur, hooks = {}) {
            const el = typeof conteneur === 'string'
                ? document.querySelector(conteneur)
                : conteneur;

            if (!el) {
                console.warn(`Router — conteneur introuvable pour "${id}"`);
                return;
            }

            el.style.display = 'none';
            el.dataset.page  = id;

            _pages[id] = {
                id,
                el,
                entrer: hooks.entrer || null,
                sortir: hooks.sortir || null
            };
        },

        // Navigue vers une page
        aller(id, params = {}) {
            const cible = _pages[id];
            if (!cible) {
                console.warn(`Router — page "${id}" introuvable`);
                return;
            }

            // Sortir de la page courante
            if (_pageCourante && _pageCourante !== id) {
                const ancienne = _pages[_pageCourante];
                if (ancienne) {
                    // Animation de sortie
                    ancienne.el.style.opacity    = '0';
                    ancienne.el.style.transform  = 'translateY(-8px)';
                    ancienne.el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';

                    setTimeout(() => {
                        ancienne.el.style.display = 'none';
                        ancienne.el.style.opacity    = '';
                        ancienne.el.style.transform  = '';
                        ancienne.el.style.transition = '';
                        if (ancienne.sortir) ancienne.sortir();
                    }, 200);
                }
            }

            // Entrer dans la nouvelle page
            setTimeout(() => {
                cible.el.style.display   = 'block';
                cible.el.style.opacity   = '0';
                cible.el.style.transform = 'translateY(8px)';

                // Force le reflow pour que l'animation se déclenche
                void cible.el.offsetHeight;

                cible.el.style.transition = 'opacity 0.35s var(--ease), transform 0.35s var(--ease)';
                cible.el.style.opacity    = '1';
                cible.el.style.transform  = 'translateY(0)';

                setTimeout(() => {
                    cible.el.style.transition = '';
                }, 350);

                if (cible.entrer) cible.entrer(params);
                _pageCourante = id;

                // Mettre à jour l'URL sans rechargement
                history.pushState({ page: id, params }, '', `#${id}`);

                // Scroll en haut
                window.scrollTo({ top: 0, behavior: 'smooth' });

            }, _pageCourante && _pageCourante !== id ? 220 : 0);
        },

        // Page courante
        courant() {
            return _pageCourante;
        },

        // Initialise le router — détecte le hash URL au démarrage
        initialiser(pageParDefaut = 'landing') {
            // 7.2 Routage géré par window.hashchange
            window.addEventListener('hashchange', () => {
                const hash = window.location.hash.replace('#', '');
                this.aller(hash || pageParDefaut);
            });

            // Lire le hash au démarrage
            const hash = window.location.hash.replace('#', '');
            if (hash && _pages[hash]) {
                return hash;
            }

            return pageParDefaut;
        }
    };
})();