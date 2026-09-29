// ============================================================
// dashboard.js — Contrôleur Principal RevisionFlow
// ============================================================

const Dashboard = (() => {

    let _tabCourant = 'aujourdhui';
    let _noteDebounceTimer = null;
    let _bilanEscListener = null;
    let _bilanCtx = null; // { date, moduleId, sessionId }

    function init() {
        // Restaurer et initialiser l'état
        Dashboard.afficherTab('aujourdhui');
        Pomodoro.init();

        // Synchroniser le timer chaque seconde
        setInterval(() => {
            DashboardView.syncTimerDisplay();
        }, 1000);

        // Souscription aux changements du store State
        State.subscribe((newState) => {
            Dashboard.afficherTab(_tabCourant);
        });

        _attacherEvenements();
    }

    function _attacherEvenements() {
        // Navigation Topbar
        document.getElementById('nav-aujourdhui')?.addEventListener('click', () => Dashboard.afficherTab('aujourdhui'));
        document.getElementById('nav-calendrier')?.addEventListener('click', () => Dashboard.afficherTab('calendrier'));
        document.getElementById('nav-modules')?.addEventListener('click',    () => Dashboard.afficherTab('modules'));
        document.getElementById('nav-historique')?.addEventListener('click', () => { window.location.href = '../../history/index.html'; });
        document.getElementById('nav-settings')?.addEventListener('click',   () => Dashboard.afficherTab('settings'));

        // Theme Toggle
        document.getElementById('btn-toggle-theme')?.addEventListener('click', () => Dashboard.toggleTheme());

        // Actions rapides (Desktop & Mobile)
        document.getElementById('btn-anticiper')?.addEventListener('click', () => Dashboard.anticiper());
        document.getElementById('btn-jour-libre')?.addEventListener('click', () => Dashboard.declarerJourLibre());

        const heroMenuBtn = document.getElementById('btn-hero-menu');
        const heroMenuDropdown = document.getElementById('hero-menu-dropdown');
        if (heroMenuBtn && heroMenuDropdown) {
            heroMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = !heroMenuDropdown.classList.contains('hidden');
                if (isOpen) {
                    heroMenuDropdown.classList.add('hidden');
                    heroMenuBtn.setAttribute('aria-expanded', 'false');
                } else {
                    heroMenuDropdown.classList.remove('hidden');
                    heroMenuBtn.setAttribute('aria-expanded', 'true');
                }
            });

            document.getElementById('btn-anticiper-m')?.addEventListener('click', () => {
                heroMenuDropdown.classList.add('hidden');
                heroMenuBtn.setAttribute('aria-expanded', 'false');
                Dashboard.anticiper();
            });

            document.getElementById('btn-jour-libre-m')?.addEventListener('click', () => {
                heroMenuDropdown.classList.add('hidden');
                heroMenuBtn.setAttribute('aria-expanded', 'false');
                Dashboard.declarerJourLibre();
            });

            document.addEventListener('click', (e) => {
                if (!heroMenuBtn.contains(e.target) && !heroMenuDropdown.contains(e.target)) {
                    heroMenuDropdown.classList.add('hidden');
                    heroMenuBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }

        // Calendrier Navigation
        document.getElementById('btn-cal-prev')?.addEventListener('click', () => DashboardView.calNav(-1));
        document.getElementById('btn-cal-next')?.addEventListener('click', () => DashboardView.calNav(1));
        document.getElementById('btn-close-detail')?.addEventListener('click', () => {
            document.getElementById('cal-day-detail')?.classList.add('hidden');
        });

        // Ajout Module
        document.getElementById('btn-add-mod-dash')?.addEventListener('click', () => {
            const nom  = document.getElementById('dash-mod-nom').value.trim();
            const date = document.getElementById('dash-mod-date').value;
            const diff = document.getElementById('dash-mod-diff').value;
            const chap = document.getElementById('dash-mod-chap').value;
            if (!nom || !date) {
                UI.toast('Veuillez renseigner le nom et la date d\'examen.', 'warning');
                return;
            }
            State.ajouterModule(nom, date, diff, chap);
            document.getElementById('dash-mod-nom').value = '';
            document.getElementById('dash-mod-date').value = '';
            UI.toast(`Module "${nom}" ajouté au planning.`, 'success');
        });

        // Settings
        document.getElementById('btn-save-settings')?.addEventListener('click', () => Dashboard.sauvegarderSettings());
        document.getElementById('btn-export')?.addEventListener('click', () => Storage.exporterJSON());
        document.getElementById('btn-import-trigger')?.addEventListener('click', () => {
            document.getElementById('import-input')?.click();
        });
        document.getElementById('btn-reinit')?.addEventListener('click', () => Dashboard.reinitialiser());

        // Sliders oninput live values
        document.getElementById('set-h-soir')?.addEventListener('input', e => {
            const lbl = document.getElementById('lbl-soir');
            if (lbl) lbl.textContent = e.target.value + 'h';
        });
        document.getElementById('set-h-weekend')?.addEventListener('input', e => {
            const lbl = document.getElementById('lbl-weekend');
            if (lbl) lbl.textContent = e.target.value + 'h';
        });
        document.getElementById('set-h-session')?.addEventListener('input', e => {
            const lbl = document.getElementById('lbl-session');
            if (lbl) lbl.textContent = e.target.value + 'h';
        });

        // Pays change
        document.getElementById('sb-pays-select')?.addEventListener('change', e => {
            State.changerPays(e.target.value);
            UI.toast('Calendrier des jours fériés mis à jour.', 'info');
        });

        // Import file change
        document.getElementById('import-input')?.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) {
                Storage.importerJSON(file)
                    .then(data => {
                        State.replace(data);
                        State.planifier();
                        UI.toast('Planning importé avec succès.', 'success');
                    })
                    .catch(err => UI.toast(err.message, 'error'));
            }
            e.target.value = '';
        });

        // Modales
        document.getElementById('btn-modal-note-annuler')?.addEventListener('click', () => {
            document.getElementById('modal-note')?.classList.add('hidden');
        });
        document.getElementById('btn-modal-note-sauv')?.addEventListener('click', () => Dashboard.sauvegarderModalNote());

        document.getElementById('btn-modal-edit-annuler')?.addEventListener('click', () => {
            document.getElementById('modal-edit-exam')?.classList.add('hidden');
        });
        document.getElementById('btn-modal-edit-sauv')?.addEventListener('click', () => Dashboard.sauvegarderEditDate());

        // V3.5b — Échap ferme la modale de notes / la modale d'édition d'examen.
        // Listener unique enregistré une seule fois à l'init (rien à nettoyer :
        // le cycle de vie de la page s'en charge). Il ne ferme que la modale
        // réellement visible et laisse passer l'événement si aucune de ces deux
        // modales n'est ouverte, afin que le listener dédié de la modale de
        // bilan (#modal-bilan) continue de fonctionner seul.
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            const note = document.getElementById('modal-note');
            const edit = document.getElementById('modal-edit-exam');
            const noteOuverte = note && !note.classList.contains('hidden');
            const editOuverte = edit && !edit.classList.contains('hidden');
            if (!noteOuverte && !editOuverte) return; // aucune modale auxiliaire ouverte
            if (noteOuverte) note.classList.add('hidden');
            else edit.classList.add('hidden');
            e.stopImmediatePropagation(); // n'affecte pas la modale de bilan
        });

        // Fermer le menu contextuel au clic extérieur
        document.addEventListener('click', e => {
            const menu = document.getElementById('session-ctx-menu');
            if (menu && !menu.contains(e.target)) {
                menu.classList.add('hidden');
            }
        });

        // ── Bilan modal ──────────────────────────────────────────
        document.getElementById('btn-bilan-passer')?.addEventListener('click', () => {
            Dashboard.fermerBilanModal(true);
        });

        document.getElementById('btn-bilan-sauv')?.addEventListener('click', () => {
            if (!_bilanCtx) return;
            const note = document.getElementById('modal-bilan-note')?.value || '';
            const activeBtn = document.querySelector('#bilan-maitrise-options .maitrise-btn.active');
            if (!activeBtn) return; // should not happen (button disabled)
            const maitrise = activeBtn.dataset.level;

            // Calcul du gain XP avant vs après
            const stateAvant = State.get();
            const jourAvant = stateAvant.plan.find(j => j.date === _bilanCtx.date);
            const sessAvant = jourAvant?.sessions.find(s => s.id === _bilanCtx.sessionId);
            const xpAvant = sessAvant ? Planning.calculerXPSession(sessAvant) : 0;

            const ok = State.enregistrerBilanSession(
                _bilanCtx.moduleId, _bilanCtx.date, _bilanCtx.sessionId,
                { note, maitrise }
            );
            if (ok) {
                const stateApres = State.get();
                const jourApres = stateApres.plan.find(j => j.date === _bilanCtx.date);
                const sessApres = jourApres?.sessions.find(s => s.id === _bilanCtx.sessionId);
                const xpApres = sessApres ? Planning.calculerXPSession(sessApres) : 0;
                const gain = Math.max(0, xpApres - xpAvant);

                Dashboard.fermerBilanModal(true);

                const msg = gain > 0 ? `✓ Bilan enregistré · +${gain} XP` : '✓ Bilan enregistré';
                UI.toast(msg, 'success');

                // Micro-animation discrète sur la pastille XP
                const xpPill = document.getElementById('stat-xp-pill');
                if (xpPill && gain > 0) {
                    xpPill.classList.remove('xp-bump');
                    void xpPill.offsetWidth; // trigger reflow
                    xpPill.classList.add('xp-bump');
                    setTimeout(() => xpPill.classList.remove('xp-bump'), 600);
                }
            } else {
                UI.toast('Impossible d\'enregistrer le bilan.', 'error');
            }
        });

        document.getElementById('bilan-maitrise-options')?.addEventListener('click', e => {
            const btn = e.target.closest('.maitrise-btn');
            if (!btn) return;
            document.querySelectorAll('#bilan-maitrise-options .maitrise-btn').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-checked', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-checked', 'true');
            // Enable save button now that a level is selected
            const saveBtn = document.getElementById('btn-bilan-sauv');
            if (saveBtn) saveBtn.disabled = false;
        });

        // Delegated — "Voir le bilan" in done column
        document.getElementById('col-done-list')?.addEventListener('click', e => {
            const viewBtn = e.target.closest('.btn-view-bilan');
            if (!viewBtn) return;
            const { date, moduleId, sessionId } = viewBtn.dataset;
            if (!date || !moduleId || !sessionId) return;
            const state = State.get();
            const mod = state.modules.find(m => m.id === moduleId);
            Dashboard.ouvrirBilanModal(date, moduleId, sessionId, mod?.nom || 'Module', true);
        });
    }

    return {
        init,

        afficherTab(tab) {
            document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

            const tabEl = document.getElementById(`tab-${tab}`);
            const navEl = document.getElementById(`nav-${tab}`);
            if (tabEl) tabEl.classList.add('active');
            if (navEl) navEl.classList.add('active');

            _tabCourant = tab;
            const state = State.get();

            if (tab === 'aujourdhui') DashboardView.rendreAujourdHui(state);
            if (tab === 'calendrier') DashboardView.rendreCalendrier(state);
            if (tab === 'modules')    DashboardView.rendreModules(state);
            if (tab === 'settings')   DashboardView.rendreSettings(state);
        },

        lancerFocus(sessionId) {
            DashboardView.setActiveSessionId(sessionId);
            DashboardView.rendreAujourdHui(State.get());
        },

        lancerPremiereSession() {
            const state = State.get();
            const today = Planning.toStr(new Date());
            const jourPlan = state.plan.find(j => j.date === today);
            if (!jourPlan || !jourPlan.sessions.length) {
                UI.toast('Aucune session à lancer aujourd\'hui.', 'info');
                return;
            }
            const pending = jourPlan.sessions.find(s => !s.faite);
            if (pending) {
                this.lancerFocus(pending.id);
            }
        },

        terminerFocusSession(date, moduleId, sessionId) {
            State.validerSession(moduleId, date, sessionId);
            const state = State.get();
            const mod = state.modules.find(m => m.id === moduleId);
            // Open bilan modal — defer dashboard refresh until modal is closed
            Dashboard.ouvrirBilanModal(date, moduleId, sessionId, mod?.nom || 'Module', false);
        },

        ouvrirBilanModal(date, moduleId, sessionId, nomModule, readOnly) {
            _bilanCtx = { date, moduleId, sessionId };

            // Populate subtitle
            const subtitle = document.getElementById('modal-bilan-subtitle');
            if (subtitle) subtitle.textContent = nomModule;

            // Reset controls
            const noteArea = document.getElementById('modal-bilan-note');
            if (noteArea) noteArea.value = '';

            document.querySelectorAll('#bilan-maitrise-options .maitrise-btn').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-checked', 'false');
            });

            const saveBtn = document.getElementById('btn-bilan-sauv');
            if (saveBtn) saveBtn.disabled = true;

            // Load existing bilan if present (edit / view mode)
            const state = State.get();
            const jour = state.plan.find(j => j.date === date);
            const session = jour?.sessions.find(s => s.id === sessionId);
            if (session?.bilan) {
                if (noteArea) noteArea.value = session.bilan.note || '';
                const lvlBtn = document.querySelector(`#bilan-maitrise-options .maitrise-btn[data-level="${session.bilan.maitrise}"]`);
                if (lvlBtn) {
                    lvlBtn.classList.add('active');
                    lvlBtn.setAttribute('aria-checked', 'true');
                    if (saveBtn) saveBtn.disabled = false;
                }
            }

            // Show modal
            const modal = document.getElementById('modal-bilan');
            if (modal) modal.classList.remove('hidden');

            // Focus textarea
            if (noteArea) setTimeout(() => noteArea.focus(), 50);

            // Escape key → Passer
            if (_bilanEscListener) document.removeEventListener('keydown', _bilanEscListener);
            _bilanEscListener = e => {
                if (e.key === 'Escape') Dashboard.fermerBilanModal(true);
            };
            document.addEventListener('keydown', _bilanEscListener);
        },

        fermerBilanModal(doRefresh) {
            const modal = document.getElementById('modal-bilan');
            if (modal) modal.classList.add('hidden');

            // Remove Escape listener
            if (_bilanEscListener) {
                document.removeEventListener('keydown', _bilanEscListener);
                _bilanEscListener = null;
            }

            _bilanCtx = null;

            if (doRefresh) {
                DashboardView.setActiveSessionId(null);
                DashboardView.rendreAujourdHui(State.get());
            }
        },

        toggleSession(date, moduleId, sessionId) {
            State.validerSession(moduleId, date, sessionId);
            DashboardView.rendreAujourdHui(State.get());
        },

        reporterSession(date, moduleId, sessionId) {
            const res = State.reporterSession(moduleId, date, sessionId);
            if (res.success) {
                UI.toast('Session reportée.', 'info');
                DashboardView.rendreAujourdHui(State.get());
            } else {
                UI.toast('Impossible de reporter.', 'warning');
            }
        },

        sauvegarderNoteRapide(moduleId, text) {
            clearTimeout(_noteDebounceTimer);
            _noteDebounceTimer = setTimeout(() => {
                const notes = { ...State.getKey('notes'), [moduleId]: text };
                State.updateSilent({ notes });
            }, 400);
        },

        anticiper() {
            const res = State.anticiperSession();
            if (res.success) {
                UI.toast(`Session de "${res.module}" avancée pour aujourd'hui !`, 'success');
                DashboardView.rendreAujourdHui(State.get());
            } else {
                UI.toast(res.message, 'info');
            }
        },

        declarerJourLibre() {
            const today = Planning.toStr(new Date());
            State.toggleJourLibre(today);
            const isLibre = State.getKey('config')?.joursLibres?.includes(today);
            UI.toast(
                isLibre ? 'Journée marquée comme libre (créneaux étendus).' : 'Journée remise en rythme standard.',
                'success'
            );
            DashboardView.rendreAujourdHui(State.get());
        },

        toggleTheme() {
            const current = State.getKey('prefs')?.theme || 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            State.update({ prefs: { theme: next } });
            document.documentElement.setAttribute('data-theme', next);
            UI.toast(`Mode ${next === 'dark' ? 'sombre' : 'clair'} activé.`, 'info');
        },

        sauvegarderSettings() {
            const soir = parseFloat(document.getElementById('set-h-soir').value);
            const weekend = parseFloat(document.getElementById('set-h-weekend').value);
            const session = parseFloat(document.getElementById('set-h-session').value);

            State.update({
                config: {
                    heuresSoir: soir,
                    heuresWeekend: weekend,
                    dureeSession: session
                }
            });
            State.planifier();
            UI.toast('Disponibilités enregistrées et planning recalculé.', 'success');
        },

        supprimerModule(moduleId, nom) {
            if (confirm(`Supprimer définitivement le module "${nom}" et ses sessions ?`)) {
                State.supprimerModule(moduleId);
                UI.toast(`Module "${nom}" supprimé.`, 'info');
            }
        },

        ouvrirEditDate(moduleId) {
            const state = State.get();
            const mod = state.modules.find(m => m.id === moduleId);
            if (!mod) return;
            window._editModId = moduleId;
            document.getElementById('modal-edit-nom').textContent = mod.nom;
            document.getElementById('modal-edit-date').value = mod.dateExam;
            document.getElementById('modal-edit-exam').classList.remove('hidden');
        },

        sauvegarderEditDate() {
            const newDate = document.getElementById('modal-edit-date').value;
            if (!newDate || !window._editModId) return;
            State.modifierDateExam(window._editModId, newDate);
            document.getElementById('modal-edit-exam').classList.add('hidden');
            UI.toast('Date d\'examen mise à jour.', 'success');
        },

        ouvrirModalNote(moduleId, nom) {
            const state = State.get();
            window._noteModId = moduleId;
            document.getElementById('modal-note-titre').textContent = `Notes — ${nom}`;
            document.getElementById('modal-note-area').value = state.notes?.[moduleId] || '';
            document.getElementById('modal-note').classList.remove('hidden');
        },

        sauvegarderModalNote() {
            if (!window._noteModId) return;
            const val = document.getElementById('modal-note-area').value;
            const notes = { ...State.getKey('notes'), [window._noteModId]: val };
            State.update({ notes });
            document.getElementById('modal-note').classList.add('hidden');
            UI.toast('Note enregistrée.', 'success');
        },

        reinitialiser() {
            if (confirm('Attention : cela supprimera tout votre planning et vos modules. Confirmer ?')) {
                State.reset();
                Storage.effacer();
                UI.toast('Planning réinitialisé.', 'info');
                window.location.href = '../wizard/wizard.html';
            }
        }
    };
})();

// Démarrage automatique au chargement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        State.initialiser()
            .catch(err => console.warn('Init State:', err))
            .finally(() => Dashboard.init());
    });
} else {
    State.initialiser()
        .catch(err => console.warn('Init State:', err))
        .finally(() => Dashboard.init());
}