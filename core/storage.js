// ============================================================
// storage.js — Persistance localStorage + Export/Import JSON
// ============================================================

const Storage = (() => {

    const CLE_PRINCIPALE = 'revisionflow_data';
    const CLE_HISTORIQUE  = 'revisionflow_historique_v1';

    return {

        // Sauvegarde l'état complet
        sauvegarder(state) {
            try {
                localStorage.setItem(CLE_PRINCIPALE, JSON.stringify(state));
                return true;
            } catch (e) {
                console.error('Storage — erreur sauvegarde :', e);
                return false;
            }
        },

        // Charge l'état sauvegardé
        charger() {
            try {
                const raw = localStorage.getItem(CLE_PRINCIPALE);
                return raw ? JSON.parse(raw) : null;
            } catch {
                return null;
            }
        },

        // Supprime toutes les données
        effacer() {
            localStorage.removeItem(CLE_PRINCIPALE);
        },

        // Exporte le planning actif en fichier JSON
        exporterJSON() {
            const state = State.get();

            if (!state.plan.length) {
                UI.toast('Aucun planning à exporter.', 'error');
                return;
            }

            const payload = {
                version:     'revisionflow_v1',
                dateExport:  new Date().toISOString(),
                config:      state.config,
                modules:     state.modules,
                plan:        state.plan,
                stats:       state.stats,
                notes:       state.notes,
                historique:  state.historique
            };

            const blob = new Blob(
                [JSON.stringify(payload, null, 2)],
                { type: 'application/json' }
            );

            const nomFichier = `revisionflow-${Planning.toStr(new Date())}.json`;
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = nomFichier;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            UI.toast('Planning exporté avec succès.', 'success');
        },

        // Importe un fichier JSON
        importerJSON(file) {
            return new Promise((resolve, reject) => {
                if (!file || !file.name.endsWith('.json')) {
                    return reject(new Error('Fichier invalide. Utilise un fichier .json'));
                }

                const reader = new FileReader();

                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);

                        // Validation de structure minimale requise (9.3)
                        if (!data || typeof data !== 'object' || !Array.isArray(data.modules) || !Array.isArray(data.plan)) {
                            throw new Error('Format de fichier incompatible ou corrompu');
                        }
                        resolve(data);
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = () => reject(new Error('Erreur de lecture du fichier.'));
                reader.readAsText(file);
            });
        },

        // Vide les données du planning actif sans toucher l'historique
        reinitialiser() {
            const historique = State.getKey('historique');
            this.effacer();
            State.reset();
            State.update({ historique });
            window.location.href = '../wizard/wizard.html';
        },

        // Taille approximative des données en KB
        tailleKo() {
            try {
                const raw = localStorage.getItem(CLE_PRINCIPALE) || '';
                return (raw.length * 2 / 1024).toFixed(1);
            } catch {
                return '0';
            }
        }
    };
})();