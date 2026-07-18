// ============================================================
// state.js — Source de vérité unique de l'application
// ============================================================

const State = (() => {

    const initial = {
        palette: ['#2D9E6B', '#E8730A', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B', '#6366F1'],
        profil: { type: null, configFait: false },
        config: {
            dateDebut: '',
            heuresSoir: 2,
            heuresWeekend: 6,
            dureeSession: 1,
            joursBlockes: [],
            joursLibres: []
        },
        pays: 'MA',
        joursFeries: [],
        modules: [],
        plan: [],
        backlog: [],
        stats: { totalSessions: 0, sessionsFaites: 0, joursRestants: 0, pourcentage: 0, velocite: 0, streak: 0 },
        notes: {},
        historique: [],
        prefs: { filtre: { statut: 'tous', module: 'tous', semaine: null }, theme: 'light' }
    };

    let _data = deepCopy(initial);
    let _subscribers = [];

    function deepCopy(obj) {
        if (!obj) return obj;
        return typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
    }

    function deepMerge(target, source) {
        const out = deepCopy(target);
        for (const key in source) {
            if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key]) && typeof target[key] === 'object' && !Array.isArray(target[key])) {
                out[key] = deepMerge(target[key], source[key]);
            } else {
                out[key] = source[key];
            }
        }
        return out;
    }

    function _recalculerStats() {
        const stats = Planning.calculerStats(_data.plan, _data.modules, _data.backlog);
        _data.stats = stats;
    }

    function _sauvegarder() {
        _recalculerStats();
        Storage.sauvegarder(_data);
        _subscribers.forEach(fn => fn(deepCopy(_data)));
    }

    function _appliquerTheme(theme) {
        const nextTheme = theme || 'light';
        _data.prefs.theme = nextTheme;
        document.documentElement.setAttribute('data-theme', nextTheme);
    }

    return {
        get() { return deepCopy(_data); },
        getKey(key) { return deepCopy(_data[key]); },
        update(changes) { _data = deepMerge(_data, changes); _sauvegarder(); },
        updateSilent(changes) { _data = deepMerge(_data, changes); _recalculerStats(); Storage.sauvegarder(_data); },
        replace(newData) { _data = deepCopy(newData); _subscribers.forEach(fn => fn(deepCopy(_data))); },
        reset() { _data = deepCopy(initial); _subscribers.forEach(fn => fn(deepCopy(_data))); },
        subscribe(fn) { _subscribers.push(fn); return () => { _subscribers = _subscribers.filter(s => s !== fn); }; },

        planifier() {
            const result = Planning.generer({
                dateDebut: _data.config.dateDebut || Planning.toStr(new Date()),
                modules: _data.modules,
                config: _data.config,
                joursFeeries: _data.joursFeries,
                planActuel: _data.plan
            });
            _data.plan = result.plan;
            _data.backlog = result.backlog;
            _sauvegarder();
        },

        async initialiser() {
            const saved = Storage.charger();
            if (saved) {
                _data = deepMerge(initial, saved);
                
                // Migration : Assure un ID unique pour chaque session existante
                _data.plan.forEach(j => {
                    j.sessions.forEach(s => {
                        if (!s.id) s.id = `mig_${Math.random().toString(36).slice(2, 9)}`;
                    });
                });

                const theme = _data.prefs?.theme || 'light';
                this.appliquerTheme(theme);
                await this.chargerJoursFeries();

                if ((_data.plan?.length || 0) === 0 && (_data.modules?.length || 0) > 0) {
                    this.planifier();
                } else {
                    _recalculerStats();
                    Storage.sauvegarder(_data);
                }
            } else {
                await this.chargerJoursFeries();
            }
        },

        async chargerJoursFeries() {
            try {
                const pays = _data.pays || 'MA';
                const anneeEnCours = new Date().getFullYear();
                const urls = [
                    `https://date.nager.at/api/v3/PublicHolidays/${anneeEnCours}/${pays}`,
                    `https://date.nager.at/api/v3/PublicHolidays/${anneeEnCours + 1}/${pays}`
                ];
                const resultats = await Promise.all(urls.map(url => fetch(url).then(res => res.ok ? res.json() : [])));
                const toutesLesDates = resultats.flat().map(h => h.date);
                _data.joursFeries = [...new Set(toutesLesDates)];
                _sauvegarder();
            } catch (e) { console.warn("Fetch jours fériés échoué", e); }
        },

        async changerPays(code) {
            _data.pays = code;
            _sauvegarder();
            await this.chargerJoursFeries();
            this.planifier();
        },

        ajouterModule(nom, date, diff, chap) {
            const nouveau = {
                id: `m_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
                nom: nom || '',
                etoiles: parseInt(diff) || 3,
                chapitres: parseInt(chap) || 5,
                dateExam: date || '',
                sessionsValidees: 0,
                couleur: _data.palette[_data.modules.length % _data.palette.length]
            };
            _data.modules.push(nouveau);
            this.planifier();
        },

        supprimerModule(id) {
            _data.modules = _data.modules.filter(m => m.id !== id);
            this.planifier();
        },

        modifierModule(id, nouvellesValeurs) {
            const idx = _data.modules.findIndex(m => m.id === id);
            if (idx === -1) return;
            _data.modules[idx] = { ..._data.modules[idx], ...nouvellesValeurs };
            this.planifier();
        },

        validerSession(idModule, date, sessionId) {
            const jour = _data.plan.find(j => j.date === date);
            if (!jour) return;

            // Recherche précise par ID unique
            const session = sessionId 
                ? jour.sessions.find(s => s.id === sessionId) 
                : jour.sessions.find(s => s.moduleId === idModule);

            if (!session) return;
            const mod = _data.modules.find(m => m.id === idModule);
            if (!mod) return;
            if (session.statut === 'termine') {
                session.statut = 'en_attente';
                session.faite = false;
                mod.sessionsValidees = Math.max(0, (mod.sessionsValidees || 0) - 1);
            } else {
                session.statut = 'termine';
                session.faite = true;
                mod.sessionsValidees = (mod.sessionsValidees || 0) + 1;
            }
            this.planifier();
            return true;
        },

        reporterSession(idModule, date) {
            const jour = _data.plan.find(j => j.date === date);
            if (!jour) return { success: false };
            const idx = jour.sessions.findIndex(s => s.moduleId === idModule && s.statut === 'en_attente');
            if (idx === -1) return { success: false };
            const backlogAvant = _data.backlog.find(b => b.moduleId === idModule)?.sessions || 0;
            jour.sessions.splice(idx, 1);
            this.planifier();
            const backlogApres = _data.backlog.find(b => b.moduleId === idModule)?.sessions || 0;
            const misEnBacklog = backlogApres > backlogAvant;
            return { success: true, misEnBacklog };
        },

        reporterSessionsDuJour(date) {
            const jour = _data.plan.find(j => j.date === date);
            if (!jour) return 0;
            const nonFaites = jour.sessions.filter(s => !s.faite && s.statut === 'en_attente');
            const nb = nonFaites.length;
            if (nb === 0) return 0;
            jour.sessions = jour.sessions.filter(s => s.faite || s.statut !== 'en_attente');
            this.planifier();
            return nb;
        },

        anticiperSession() {
            const today = Planning.toStr(new Date());
            const jourAuj = _data.plan.find(j => j.date === today);
            const config = _data.config;
            const estWE = Planning.estSamediDimanche(today);
            const estLibre = config.joursLibres.includes(today) || _data.joursFeries.includes(today);
            const limiteAuj = estLibre || estWE ? config.heuresWeekend : config.heuresSoir;
            if (!jourAuj || jourAuj.sessions.length >= limiteAuj) {
                return { success: false, message: "Capacité journalière atteinte." };
            }
            for (let i = 0; i < _data.plan.length; i++) {
                const jour = _data.plan[i];
                if (jour.date > today && jour.sessions.length > 0) {
                    const sess = jour.sessions.shift();
                    jourAuj.sessions.push(sess);
                    const mod = _data.modules.find(m => m.id === sess.moduleId);
                    this.planifier();
                    return { success: true, module: mod ? mod.nom : 'Inconnu' };
                }
            }
            return { success: false, message: "Aucune session future à anticiper." };
        },

        toggleJourLibre(dateStr) {
            const idx = _data.config.joursLibres.indexOf(dateStr);
            if (idx === -1) _data.config.joursLibres.push(dateStr);
            else _data.config.joursLibres.splice(idx, 1);
            this.planifier();
        },

        setCapacites(soir, weekend) {
            _data.config.heuresSoir = parseFloat(soir) || 2;
            _data.config.heuresWeekend = parseFloat(weekend) || 6;
            this.planifier();
        },

        appliquerTheme(theme = null) {
            const nextTheme = theme ?? _data.prefs?.theme ?? 'light';
            _data.prefs.theme = nextTheme;
            document.documentElement.setAttribute('data-theme', nextTheme);
        },

        toggleTheme() {
            _data.prefs.theme = _data.prefs.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', _data.prefs.theme);
            _sauvegarder();
        },

        exporter() { Storage.exporterJSON(); },

        archiverPlanning() {
            const state = this.get();
            const entree = {
                id: `hist_${Date.now()}`,
                dateArchive: new Date().toISOString(),
                modules: state.modules,
                plan: state.plan,
                stats: state.stats,
                tauxCompletion: state.stats.pourcentage
            };
            _data.historique.unshift(entree);
            if (_data.historique.length > 5) _data.historique = _data.historique.slice(0, 5);
            _sauvegarder();
        }
    };
})();