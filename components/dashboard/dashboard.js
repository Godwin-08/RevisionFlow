const Dashboard = (() => {

    let _tabCourant  = 'aujourdhui';
    let _countdownId = null;
    let _noteModuleId  = null;
    let _editModuleId  = null;

    // Référence stable à l'élément countdown — récupérée une seule fois
    let _countdownEl = null;

    function init() {
        const state = State.get();

        // Cache des éléments countdown (pas de getElementById à chaque tick)
        _countdownEl = document.getElementById('countdown-val');

        Filters.restaurer();
        Dashboard.afficherTab('aujourdhui');
        DashboardView.rendreStats(state);
        DashboardView.rendreSidebar();
        _demarrerCountdown();
        Pomodoro.init();
        _syncPomoInterval();

        State.subscribe((newState) => {
            Dashboard.afficherTab(_tabCourant);
            DashboardView.rendreStats(newState);
            DashboardView.rendreSidebar();
            DashboardView.mettreAJourAlerteSurcharge(newState);
        });

        _attacherEvenements();
    }

    function _attacherEvenements() {
        // Nav sidebar
        document.getElementById('nav-aujourdhui')?.addEventListener('click', () => Dashboard.afficherTab('aujourdhui'));
        document.getElementById('nav-modules')?.addEventListener('click',    () => Dashboard.afficherTab('modules'));
        document.getElementById('nav-calendrier')?.addEventListener('click', () => Dashboard.afficherTab('calendrier'));
        document.getElementById('nav-historique')?.addEventListener('click', () => { window.location.href = '../../history/index.html'; });
        document.getElementById('nav-settings')?.addEventListener('click',   () => Dashboard.afficherTab('settings'));

        // Pomodoro
        document.getElementById('btn-pomo-toggle')?.addEventListener('click', () => { Pomodoro.toggle(); DashboardView.syncPomo(); });
        document.getElementById('btn-pomo-reset')?.addEventListener('click',  () => { Pomodoro.reset();  DashboardView.syncPomo(); });

        // Mobile sidebar
        document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => Dashboard.toggleSidebar());

        // Calendrier nav
        document.getElementById('btn-cal-prev')?.addEventListener('click', () => Dashboard.calPrev());
        document.getElementById('btn-cal-next')?.addEventListener('click', () => Dashboard.calNext());

        // Fermer détail calendrier
        document.getElementById('btn-close-detail')?.addEventListener('click', () => {
            document.getElementById('cal-day-detail')?.classList.add('hidden');
        });

        // Anticiper
        document.getElementById('btn-anticiper')?.addEventListener('click', () => Dashboard.anticiper());

        // Jour libre FAB
        document.getElementById('btn-jour-libre')?.addEventListener('click', () => Dashboard.declarerJourLibre());

        // Ajout module
        document.getElementById('btn-add-mod-dash')?.addEventListener('click', () => {
            const nom  = document.getElementById('dash-mod-nom').value;
            const date = document.getElementById('dash-mod-date').value;
            const diff = document.getElementById('dash-mod-diff').value;
            const chap = document.getElementById('dash-mod-chap').value;
            if (!nom || !date) { UI.toast('Nom et date requis.', 'error'); return; }
            State.ajouterModule(nom, date, diff, chap);
            ['dash-mod-nom', 'dash-mod-date', 'dash-mod-chap'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            UI.toast('Module ajouté !', 'success');
        });

        // Settings
        document.getElementById('btn-save-settings')?.addEventListener('click', () => Dashboard.sauvegarderSettings());
        document.getElementById('btn-toggle-theme')?.addEventListener('click',  () => Dashboard.toggleTheme());
        document.getElementById('btn-export')?.addEventListener('click', () => Storage.exporterJSON());
        document.getElementById('btn-import-trigger')?.addEventListener('click', () => {
            document.getElementById('import-input')?.click();
        });
        document.getElementById('btn-reinit')?.addEventListener('click', () => Dashboard.reinitialiser());

        // Sliders settings (oninput live)
        document.getElementById('set-h-soir')?.addEventListener('input', e => {
            document.getElementById('lbl-soir').textContent = e.target.value + 'h';
        });
        document.getElementById('set-h-weekend')?.addEventListener('input', e => {
            document.getElementById('lbl-weekend').textContent = e.target.value + 'h';
        });
        document.getElementById('set-h-session')?.addEventListener('input', e => {
            document.getElementById('lbl-session').textContent = e.target.value + 'h';
        });

        // Select pays
        document.getElementById('sb-pays-select')?.addEventListener('change', e => Dashboard.changerPays(e.target.value));

        // Import JSON
        document.getElementById('import-input')?.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) {
                Storage.importerJSON(file)
                    .then(data => {
                        State.replace(data);
                        State.planifier();
                        UI.toast('Planning importé.', 'success');
                    })
                    .catch(err => UI.toast(err.message, 'error'));
            }
            e.target.value = '';
        });

        // Modals
        document.getElementById('btn-modal-note-annuler')?.addEventListener('click', () => Dashboard.fermerModalNote());
        document.getElementById('btn-modal-note-sauv')?.addEventListener('click',    () => Dashboard.sauvegarderModalNote());
        document.getElementById('btn-modal-edit-annuler')?.addEventListener('click', () => Dashboard.fermerModalEdit());
        document.getElementById('btn-modal-edit-sauv')?.addEventListener('click',    () => Dashboard.sauvegarderEditDate());

        // Fermer sidebar au clic dehors (mobile)
        document.addEventListener('click', e => {
            const menu = document.getElementById('session-ctx-menu');
            if (menu && !menu.contains(e.target)) menu.classList.add('hidden');

            const sidebar = document.getElementById('sidebar');
            const btn = document.getElementById('btn-toggle-sidebar');
            if (sidebar?.classList.contains('open') && !sidebar.contains(e.target) && !btn?.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        });
    }

    function _syncPomoInterval() {
        setInterval(() => DashboardView.syncPomo(), 1000);
    }

    function _demarrerCountdown() {
        if (_countdownId) clearInterval(_countdownId);
        const mobileEl = document.getElementById('mobile-countdown');

        const update = () => {
            const state    = State.get();
            const prochain = Planning.prochainExamen(state.modules);
            if (!prochain) return;

            const { texte, urgence } = Planning.formaterCountdown(prochain.dateExam);

            // Mise à jour desktop — référence cachée
            if (_countdownEl) _countdownEl.textContent = texte;

            // Mise à jour mobile
            if (mobileEl) mobileEl.textContent = texte;

            // Classes d'urgence — un seul getElementById
            if (_countdownEl) {
                _countdownEl.classList.remove('urgence', 'critique');
                // Planning.formaterCountdown() renvoie 'alerte', pas 'urgence' —
                // la comparaison précédente ne matchait jamais et l'état intermédiaire
                // (J-7 à J-3) ne s'affichait donc jamais.
                if (urgence === 'alerte') _countdownEl.classList.add('urgence');
                if (urgence === 'critique') _countdownEl.classList.add('critique');
            }
        };

        update();
        _countdownId = setInterval(update, 1000);
    }

    return {

        init,

        afficherTab(tab) {
            document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.sb-nav-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(`tab-${tab}`)?.classList.add('active');
            document.getElementById(`nav-${tab}`)?.classList.add('active');
            _tabCourant = DashboardView.state.tab = tab;

            const state = State.get();
            if (tab === 'aujourdhui') DashboardView.rendreAujourdHui(state);
            if (tab === 'calendrier') DashboardView.rendreCalendrier(state);
            if (tab === 'modules')    DashboardView.rendreModules(state);
            if (tab === 'settings')   DashboardView.rendreSettings(state);
        },

        toggleSession(date, moduleId, sessionId) {
            State.validerSession(moduleId, date, sessionId);
            const state = State.get();
            const jour  = state.plan.find(j => j.date === date);
            if (jour?.sessions.every(s => s.faite)) {
                UI.confettis();
                UI.toast('Journée complétée !', 'success');
            }
        },

        reporterSession(date, moduleId) {
            const state = State.get();
            const mod   = state.modules.find(m => m.id === moduleId);
            const res   = State.reporterSession(moduleId, date);
            if (res.success) {
                const nomSafe = UI.echapperHTML(mod?.nom);
                UI.toast(
                    res.misEnBacklog
                        ? `Session de "${nomSafe}" mise en backlog.`
                        : `Session de "${nomSafe}" reportée.`,
                    res.misEnBacklog ? 'warning' : 'info'
                );
            } else {
                UI.toast('Impossible de reporter.', 'error');
            }
        },

        anticiper() {
            const res = State.anticiperSession();
            if (res.success) {
                UI.toast(`Session de "${UI.echapperHTML(res.module)}" anticipée !`, 'success');
                UI.confettis();
            } else {
                UI.toast(res.message, 'warning');
            }
        },

        ouvrirModalNote(moduleId, nomModule) {
            const state = State.get();
            _noteModuleId = moduleId;
            const titre = document.getElementById('modal-note-titre');
            const area  = document.getElementById('modal-note-area');
            if (titre) titre.textContent = `Notes — ${nomModule}`;
            if (area)  area.value = state.notes[moduleId] || '';
            document.getElementById('modal-note')?.classList.remove('hidden');
        },

        fermerModalNote() {
            document.getElementById('modal-note')?.classList.add('hidden');
            _noteModuleId = null;
        },

        sauvegarderModalNote() {
            if (!_noteModuleId) return;
            const val   = document.getElementById('modal-note-area').value;
            const notes = { ...State.getKey('notes'), [_noteModuleId]: val };
            State.update({ notes });
            this.fermerModalNote();
            UI.toast('Note sauvegardée.', 'success');
        },

        ouvrirEditDate(moduleId) {
            const state = State.get();
            const mod   = state.modules.find(m => m.id === moduleId);
            if (!mod) return;
            _editModuleId = moduleId;
            const nomEl  = document.getElementById('modal-edit-nom');
            const dateEl = document.getElementById('modal-edit-date');
            if (nomEl)  nomEl.textContent = mod.nom;
            if (dateEl) dateEl.value = mod.dateExam;
            document.getElementById('modal-edit-exam')?.classList.remove('hidden');
        },

        fermerModalEdit() {
            document.getElementById('modal-edit-exam')?.classList.add('hidden');
            _editModuleId = null;
        },

        sauvegarderEditDate() {
            if (!_editModuleId) return;
            const nouvelleDate = document.getElementById('modal-edit-date').value;
            if (!nouvelleDate) { UI.toast('Date invalide.', 'error'); return; }
            State.modifierModule(_editModuleId, { dateExam: nouvelleDate });
            this.fermerModalEdit();
            UI.toast('Date mise à jour. Planning recalculé.', 'success');
        },

        declarerJourLibre() {
            const today = Planning.toStr(new Date());
            State.toggleJourLibre(today);
            UI.toast('Jour libre déclaré. Planning ajusté.', 'success');
        },

        sauvegarderSettings() {
            const soir    = document.getElementById('set-h-soir').value;
            const weekend = document.getElementById('set-h-weekend').value;
            const session = document.getElementById('set-h-session').value;
            State.update({
                config: {
                    heuresSoir:    parseFloat(soir)    || 2,
                    heuresWeekend: parseFloat(weekend) || 6,
                    dureeSession:  parseFloat(session) || 1
                }
            });
            State.planifier();
            UI.toast('Paramètres sauvegardés. Planning recalculé.', 'success');
        },

        changerPays(code) {
            UI.toast('Mise à jour des jours fériés…', 'info');
            State.changerPays(code).then(() => {
                UI.toast('Planning mis à jour.', 'success');
            });
        },

        toggleTheme() { State.toggleTheme(); },

        calPrev() { DashboardView.calNav(-1); },
        calNext() { DashboardView.calNav(1);  },

        toggleSidebar() {
            document.getElementById('sidebar')?.classList.toggle('open');
        },

        supprimerModule(id, nom) {
            const nomSafe = UI.echapperHTML(nom);
            UI.confirmer(
                `Supprimer le module "${nomSafe}" et toutes ses sessions ?`,
                () => {
                    State.supprimerModule(id);
                    UI.toast(`Module "${nomSafe}" supprimé.`, 'success');
                }
            );
        },

        reinitialiser() {
            UI.confirmer(
                'Veux-tu archiver ce planning avant de repartir ?',
                () => { State.archiverPlanning(); Storage.reinitialiser(); },
                () => { Storage.reinitialiser(); },
                { oui: 'Archiver et nouveau', non: 'Supprimer sans archiver' }
            );
        }
    };

})();

document.addEventListener('DOMContentLoaded', () => {
    State.initialiser().then(() => Dashboard.init());
});