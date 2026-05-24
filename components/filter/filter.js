// ============================================================
// filters.js — Système de filtres combinables
// Statut + Module + Semaine — persisté dans State
// ============================================================

const Filters = (() => {

    // ---- État interne ----
    let _filtreStat    = 'tous';
    let _filtreModule  = 'tous';
    let _filtreSemaine = null;   // date ISO du lundi de la semaine

    // ---- Helpers ----

    // Retourne le lundi de la semaine d'une date
    function _getLundi(dateStr) {
        const d   = new Date(dateStr + 'T12:00:00');
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return Planning.toStr(d);
    }

    // Retourne les 7 dates d'une semaine à partir du lundi
    function _getDatesemaine(lundiStr) {
        const dates = [];
        const d     = new Date(lundiStr + 'T12:00:00');
        for (let i = 0; i < 7; i++) {
            dates.push(Planning.toStr(d));
            d.setDate(d.getDate() + 1);
        }
        return dates;
    }

    // Nom de la semaine
    function _nomSemaine(lundiStr) {
        if (!lundiStr) return 'Toutes les semaines';
        const lundi    = new Date(lundiStr + 'T12:00:00');
        const dimanche = new Date(lundiStr + 'T12:00:00');
        dimanche.setDate(lundi.getDate() + 6);
        return `${lundi.getDate()} – ${dimanche.getDate()} ${
            dimanche.toLocaleDateString('fr-FR', { month: 'short' })
        }`;
    }

    // ---- Générer les semaines disponibles ----
    function _getSemaines(plan) {
        const semaines = new Map();

        plan.forEach(jour => {
            if (!jour.sessions.length) return;
            const lundi = _getLundi(jour.date);
            if (!semaines.has(lundi)) {
                semaines.set(lundi, { lundi, nb: 0, faites: 0 });
            }
            const sem = semaines.get(lundi);
            sem.nb    += jour.sessions.length;
            sem.faites += jour.sessions.filter(s => s.faite).length;
        });

        return [...semaines.values()].sort((a, b) =>
            a.lundi.localeCompare(b.lundi)
        );
    }

    // ---- Appliquer les filtres sur un tableau de sessions ----
    function _appliquer(sessions, plan, today) {
        let result = [...sessions];

        // Filtre statut
        if (_filtreStat === 'todo')   result = result.filter(s => !s.faite);
        if (_filtreStat === 'done')   result = result.filter(s => s.faite);
        if (_filtreStat === 'missed') {
            result = result.filter(s => {
                // Recherche robuste du jour par contenu si la référence est perdue (cloneState)
                const jour = plan.find(j => j.sessions.some(sess => 
                    sess.moduleId === s.moduleId && sess.scoreSnapshot === s.scoreSnapshot
                ));
                return !s.faite && (s.date || jour?.date) < today;
            });
        }

        // Filtre module
        if (_filtreModule !== 'tous') {
            result = result.filter(s => s.moduleId === _filtreModule);
        }

        return result;
    }

    // ---- Appliquer le filtre semaine sur le plan ----
    function _appliquerSemaine(plan) {
        if (!_filtreSemaine) return plan;
        const datesSem = _getDatesemaine(_filtreSemaine);
        return plan.filter(j => datesSem.includes(j.date));
    }

    // ---- Rendu du panneau de filtres ----
    function _rendrePanneau(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const state    = State.get();
        const semaines = _getSemaines(state.plan);

        container.innerHTML = `
            <div class="filters-panel" id="filters-panel">

                <!-- Filtre statut -->
                <div class="filter-group">
                    <div class="filter-group-label">Statut</div>
                    <div class="filter-chips">
                        ${[
                            { val: 'tous',   lbl: 'Tous' },
                            { val: 'todo',   lbl: 'À faire' },
                            { val: 'done',   lbl: 'Faits' },
                            { val: 'missed', lbl: 'Manqués' }
                        ].map(f => `
                            <button
                                class="filter-chip ${_filtreStat === f.val ? 'active' : ''}"
                                data-type="stat"
                                data-val="${f.val}"
                                onclick="Filters.setStatut('${f.val}')"
                            >${f.lbl}</button>
                        `).join('')}
                    </div>
                </div>

                <!-- Filtre module -->
                <div class="filter-group">
                    <div class="filter-group-label">Module</div>
                    <div class="filter-chips">
                        <button
                            class="filter-chip ${_filtreModule === 'tous' ? 'active' : ''}"
                            onclick="Filters.setModule('tous')"
                        >Tous</button>
                        ${state.modules.map(m => `
                            <button
                                class="filter-chip ${_filtreModule === m.id ? 'active' : ''}"
                                onclick="Filters.setModule('${m.id}')"
                                style="${_filtreModule === m.id
                                    ? `background:${m.couleur};border-color:${m.couleur};color:white`
                                    : `border-left:3px solid ${m.couleur}`
                                }"
                            >${m.nom}</button>
                        `).join('')}
                    </div>
                </div>

                <!-- Filtre semaine -->
                <div class="filter-group">
                    <div class="filter-group-label">Semaine</div>
                    <div class="filter-semaines">
                        <button
                            class="filter-sem-btn ${!_filtreSemaine ? 'active' : ''}"
                            onclick="Filters.setSemaine(null)"
                        >Toutes</button>
                        ${semaines.map(sem => {
                            const pct = sem.nb > 0
                                ? Math.round((sem.faites / sem.nb) * 100)
                                : 0;
                            return `
                            <button
                                class="filter-sem-btn ${_filtreSemaine === sem.lundi ? 'active' : ''}"
                                onclick="Filters.setSemaine('${sem.lundi}')"
                            >
                                <span class="filter-sem-nom">${_nomSemaine(sem.lundi)}</span>
                                <span class="filter-sem-pct">${pct}%</span>
                                <div class="filter-sem-track">
                                    <div class="filter-sem-fill"
                                         style="width:${pct}%"></div>
                                </div>
                            </button>`;
                        }).join('')}
                    </div>
                </div>

                <!-- Résumé filtres actifs -->
                <div class="filter-actifs" id="filter-actifs">
                    ${_rendreActifs()}
                </div>

            </div>
        `;
    }

    // ---- Résumé des filtres actifs ----
    function _rendreActifs() {
        const actifs = [];

        if (_filtreStat !== 'tous') {
            const lbl = {
                todo: 'À faire', done: 'Faits', missed: 'Manqués'
            }[_filtreStat];
            actifs.push({
                lbl,
                reset: `Filters.setStatut('tous')`
            });
        }

        if (_filtreModule !== 'tous') {
            const state = State.get();
            const mod   = state.modules.find(m => m.id === _filtreModule);
            if (mod) actifs.push({
                lbl:   mod.nom,
                reset: `Filters.setModule('tous')`
            });
        }

        if (_filtreSemaine) {
            actifs.push({
                lbl:   `Sem. ${_nomSemaine(_filtreSemaine)}`,
                reset: `Filters.setSemaine(null)`
            });
        }

        if (!actifs.length) return '';

        return `
            <div class="filter-actifs-label">Filtres actifs :</div>
            <div class="filter-actifs-chips">
                ${actifs.map(a => `
                    <span class="filter-actif-chip">
                        ${a.lbl}
                        <button onclick="${a.reset}" class="filter-actif-rm">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 stroke-width="3" stroke-linecap="round"
                                 width="10" height="10">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6"  y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </span>
                `).join('')}
                <button class="filter-reset-all"
                        onclick="Filters.resetTout()">
                    Tout effacer
                </button>
            </div>
        `;
    }

    // ---- API publique ----
    return {

        // Init — monter le panneau dans un conteneur
        monter(containerId) {
            _rendrePanneau(containerId);
        },

        // Recharger le panneau sans changer les filtres
        rafraichir(containerId) {
            _rendrePanneau(containerId);
        },

        // Setter statut
        setStatut(val) {
            _filtreStat = val;
            const el = document.getElementById('filter-actifs');
            if (el) el.innerHTML = _rendreActifs();

            // Mettre à jour les chips
            document.querySelectorAll('.filter-chip[data-type="stat"]').forEach(c => {
                c.classList.toggle('active', c.dataset.val === val);
            });

            // Persister dans les prefs
            State.update({ prefs: { filtre: { statut: val } } });

            // Notifier le dashboard
            this._notifier();
        },

        // Setter module
        setModule(moduleId) {
            _filtreModule = moduleId;
            const state   = State.get();
            const mod     = state.modules.find(m => m.id === moduleId);

            document.querySelectorAll('.filter-chip:not([data-type="stat"])').forEach(c => {
                const isActive = c.textContent.trim() === (mod?.nom || 'Tous');
                c.classList.toggle('active', isActive);
                if (isActive && mod) {
                    c.style.cssText = `background:${mod.couleur};border-color:${mod.couleur};color:white`;
                } else {
                    c.style.cssText = mod
                        ? `border-left:3px solid ${mod?.couleur || 'transparent'}`
                        : '';
                }
            });

            const el = document.getElementById('filter-actifs');
            if (el) el.innerHTML = _rendreActifs();

            State.update({ prefs: { filtre: { module: moduleId } } });
            this._notifier();
        },

        // Setter semaine
        setSemaine(lundiStr) {
            _filtreSemaine = lundiStr;

            document.querySelectorAll('.filter-sem-btn').forEach(b => {
                const isNull   = !lundiStr && b.textContent.trim() === 'Toutes';
                const isActive = lundiStr && b.querySelector('.filter-sem-nom')
                    ?.textContent === _nomSemaine(lundiStr);
                b.classList.toggle('active', isNull || !!isActive);
            });

            const el = document.getElementById('filter-actifs');
            if (el) el.innerHTML = _rendreActifs();

            State.update({ prefs: { filtre: { semaine: lundiStr } } });
            this._notifier();
        },

        // Réinitialiser tous les filtres
        resetTout() {
            _filtreStat    = 'tous';
            _filtreModule  = 'tous';
            _filtreSemaine = null;
            State.update({ prefs: { filtre: {
                statut: 'tous', module: 'tous', semaine: null
            }}});
            this._notifier();
        },

        // Appliquer les filtres sur un plan
        filtrerPlan(plan) {
            return _appliquerSemaine(plan);
        },

        // Appliquer les filtres sur des sessions
        filtrerSessions(sessions, plan) {
            const today = Planning.toStr(new Date());
            return _appliquer(sessions, plan, today);
        },

        // Getters
        get statut()   { return _filtreStat; },
        get module()   { return _filtreModule; },
        get semaine()  { return _filtreSemaine; },

        // Callback — le dashboard s'abonne ici
        _callback: null,

        onChangement(fn) { this._callback = fn; },

        _notifier() {
            if (this._callback) this._callback({
                statut:   _filtreStat,
                module:   _filtreModule,
                semaine:  _filtreSemaine
            });
        },

        // Restaurer depuis State
        restaurer() {
            const prefs = State.getKey('prefs');
            if (prefs?.filtre) {
                _filtreStat    = prefs.filtre.statut  || 'tous';
                _filtreModule  = prefs.filtre.module  || 'tous';
                _filtreSemaine = prefs.filtre.semaine || null;
            }
        }
    };
})();