// ============================================================
// wizard.js — Logique du wizard en 3 étapes (corrigé)
// ============================================================

const Wizard = (() => {

    // État interne du wizard
    let _etapeCourante = 1;
    let _typeProfil    = null;
    let _heures        = { soir: 2, weekend: 6, session: 1 };
    let _modules       = [];
    let _joursFeeries  = [];
    let _joursBlockes  = [];
    let _calMois       = WizardView.calState.mois;
    let _calAnnee      = WizardView.calState.annee;
    let _modCompteur   = 0;

    function genId() {
        return `m_${++_modCompteur}_${Math.random().toString(36).slice(2, 6)}`;
    }

    function validerEtape2() {
        if (!_modules.length) {
            UI.toast('Ajoute au moins un module.', 'error');
            UI.secouer(document.getElementById('wiz-card'));
            return false;
        }
        const debut = document.getElementById('f-debut').value;
        for (const mod of _modules) {
            if (!mod.nom.trim()) {
                UI.toast('Un module n\'a pas de nom.', 'error');
                document.getElementById(`mnom-${mod.id}`)?.focus();
                UI.secouer(document.getElementById('wiz-card'));
                return false;
            }
            if (!mod.dateExam) {
                UI.toast(`Indique la date d'examen pour "${UI.echapperHTML(mod.nom)}".`, 'error');
                UI.secouer(document.getElementById('wiz-card'));
                return false;
            }
            if (mod.dateExam <= debut) {
                UI.toast(`La date d'examen de "${UI.echapperHTML(mod.nom)}" doit être après le début des révisions.`, 'error');
                UI.secouer(document.getElementById('wiz-card'));
                return false;
            }
        }
        return true;
    }

    async function chargerJoursFeeries() {
        try {
            await State.chargerJoursFeries();
            _joursFeeries = State.getKey('joursFeries');
        } catch (e) {
            console.warn("Erreur chargement jours fériés", e);
            _joursFeeries = [];
        }
    }

    function generer() {
        const btn = document.getElementById('btn-generer');
        btn.disabled = true;
        btn.textContent = 'Génération en cours...';
        setTimeout(() => {
            const dateDebut = document.getElementById('f-debut').value;
            State.update({
                profil: { type: _typeProfil, configFait: true },
                config: {
                    dateDebut: dateDebut,
                    heuresSoir: _heures.soir,
                    heuresWeekend: _heures.weekend,
                    dureeSession: _heures.session,
                    joursBlockes: _joursBlockes,
                    joursLibres: []
                },
                modules: _modules,
                joursFeries: _joursFeeries
            });
            State.planifier();
            const state = State.get();
            if (!state.plan || !state.plan.length) {
                UI.toast('Impossible de générer un planning. Vérifie les dates.', 'error');
                btn.disabled = false;
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="15" height="15"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Générer le planning`;
                return;
            }
            const totalBacklog = state.backlog.reduce((acc, b) => acc + b.sessions, 0);
            if (totalBacklog > 0) {
                UI.toast(`Attention : ${totalBacklog} sessions sont en surcharge. Tu pourras ajuster tes heures au dashboard.`, 'warning');
            }
            UI.toast('Planning généré avec succès !', 'success');
            UI.confettis();
            setTimeout(() => {
                window.location.href = '../dashboard/dashboard.html';
            }, 800);
        }, 500);
    }

    function allerEtape(n, retour = false) {
        const ancien = document.getElementById(`panel-${_etapeCourante}`);
        const nouveau = document.getElementById(`panel-${n}`);
        if (!ancien || !nouveau) {
            console.error(`Panneau introuvable : panel-${_etapeCourante} ou panel-${n}`);
            return;
        }
        ancien.classList.remove('active');
        nouveau.classList.remove('back');
        if (retour) nouveau.classList.add('back');
        nouveau.classList.add('active');
        _etapeCourante = n;
        mettreAJourUI();

        if (n === 3) {
            // Chargement des jours fériés (non bloquant)
            chargerJoursFeeries().catch(e => console.warn(e));
            // Premier rendu immédiat
            renderCalendrier();
            // Second rendu après un délai pour intégrer les jours fériés
            setTimeout(() => renderCalendrier(), 500);
        }
    }

    function mettreAJourUI() {
        WizardView.mettreAJourUI(_etapeCourante);
    }

    function validerEtape1() {
        if (!_typeProfil) {
            UI.toast('Choisis ton type de profil.', 'error');
            UI.secouer(document.querySelector('.type-grid'));
            return false;
        }
        const debut = document.getElementById('f-debut').value;
        if (!debut) {
            UI.toast('Indique la date de début des révisions.', 'error');
            UI.secouer(document.getElementById('field-debut'));
            UI.secouer(document.getElementById('wiz-card'));
            return false;
        }
        return true;
    }

    function rendreListe() {
        WizardView.rendreListe(_modules);
    }

    function renderCalendrier() {
        WizardView.rendreCalendrier(_modules, _joursFeeries, _joursBlockes);
    }

    return {
        init() {
            const today = Planning.toStr(new Date());
            const debutInput = document.getElementById('f-debut');
            if (debutInput) debutInput.value = today;

            const pays = State.getKey('pays') || 'MA';
            if (typeof UI.remplirSelectPays === 'function') {
                UI.remplirSelectPays('f-pays', pays);
            } else {
                console.warn('⚠️ UI.remplirSelectPays non défini');
            }

            _calMois = new Date().getMonth();
            _calAnnee = new Date().getFullYear();

            // Premier module
            if (!_modules.length) {
                this.ajouterModule();
            }
            WizardView.rendreListe(_modules);

            mettreAJourUI();
        },

        choisirType(type) {
            _typeProfil = type;
            document.querySelectorAll('.type-card').forEach(c => c.classList.remove('selected'));
            document.getElementById(`type-${type}`)?.classList.add('selected');
        },

        async changerPays(code) {
            State.update({ pays: code });
            await chargerJoursFeeries();
            if (_etapeCourante === 3) renderCalendrier();
        },

        suivant(etape) {
            if (etape === 1 && !validerEtape1()) return;
            if (etape === 2 && !validerEtape2()) return;
            allerEtape(etape + 1);
        },

        precedent(etape) {
            allerEtape(etape - 1, true);
        },

        ajouterModule() {
            const palette = State.getKey('palette') || ['#2D9E6B', '#E8730A', '#3B82F6', '#8B5CF6'];
            const newId = genId();
            const mod = {
                id: newId,
                nom: '',
                chapitres: 5,
                etoiles: 3,
                sessionsValidees: 0,
                dateExam: '',
                couleur: palette[_modules.length % palette.length]
            };
            _modules.push(mod);
            rendreListe();
            setTimeout(() => {
                document.getElementById(`mnom-${newId}`)?.focus();
            }, 100);
        },

        _supprimerModule(id) {
            _modules = _modules.filter(m => m.id !== id);
            rendreListe();
        },

        _updateNom(id, val) {
            const mod = _modules.find(m => m.id === id);
            if (mod) mod.nom = val;
        },

        _updateDate(id, val) {
            const mod = _modules.find(m => m.id === id);
            if (mod) {
                mod.dateExam = val;
                rendreListe();
            }
        },

        _updateChapitres(id, val) {
            const mod = _modules.find(m => m.id === id);
            if (mod) {
                mod.chapitres = parseInt(val) || 5;
                rendreListe();
            }
        },

        _setEtoiles(id, val) {
            const mod = _modules.find(m => m.id === id);
            if (mod) {
                mod.etoiles = val;
                rendreListe();
            }
        },

        changerHeures(type, delta) {
            const min = type === 'session' ? 0.25 : 0.5;
            const max = type === 'session' ? 4 : (type === 'soir' ? 8 : 12);
            const el = document.getElementById(`hval-${type}`);
            if (!el) return;
            const cur = parseFloat(el.textContent);
            const nxt = Math.max(min, Math.min(max, +(cur + delta).toFixed(2)));
            if (nxt === cur) return;
            el.style.transform = delta > 0 ? 'translateY(-6px)' : 'translateY(6px)';
            el.style.opacity = '0';
            el.style.transition = 'all 0.12s ease';
            setTimeout(() => {
                el.textContent = nxt % 1 === 0 ? nxt : nxt.toFixed(2);
                el.style.transform = 'translateY(0)';
                el.style.opacity = '1';
            }, 120);
            _heures[type] = nxt;
        },

        _toggleJour(str) {
            const idx = _joursBlockes.indexOf(str);
            if (idx === -1) _joursBlockes.push(str);
            else _joursBlockes.splice(idx, 1);
            renderCalendrier();
        },

        _calPrev() {
            _calMois--;
            if (_calMois < 0) { _calMois = 11; _calAnnee--; }
            WizardView.calState.mois = _calMois;
            WizardView.calState.annee = _calAnnee;
            renderCalendrier();
        },

        _calNext() {
            _calMois++;
            if (_calMois > 11) { _calMois = 0; _calAnnee++; }
            WizardView.calState.mois = _calMois;
            WizardView.calState.annee = _calAnnee;
            renderCalendrier();
        },

        generer
    };
})();

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    const saved = Storage?.charger?.();
    const savedTheme = saved?.prefs?.theme;
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        if (typeof State?.appliquerTheme === 'function') {
            State.appliquerTheme(savedTheme);
        }
    }
    if (saved?.plan?.length) {
        UI.confirmer(
            'Un planning existe déjà. Veux-tu le continuer ou en créer un nouveau ?',
            () => Wizard.init(),
            () => { window.location.href = '../dashboard/dashboard.html'; },
            { oui: 'Nouveau planning', non: 'Continuer' }
        );
    } else {
        Wizard.init();
    }
});