// ============================================================
// pomodoro.js — Timer Pomodoro avec animation SVG
// Pas de HTML/CSS séparé — s'intègre dans le dashboard
// ============================================================

const Pomodoro = (() => {

    // ---- Constantes ----
    const CIRCONFERENCE = 326.7; // 2 * PI * 52
    // Couleurs des modes : tokens du Design System V3 (core/variables.css)
    const MODES = {
        travail: { duree: 25 * 60, label: 'TRAVAIL',      couleur: 'var(--color-primary)' },
        pause:   { duree:  5 * 60, label: 'PAUSE',        couleur: 'var(--color-success)' },
        longue:  { duree: 15 * 60, label: 'LONGUE PAUSE', couleur: 'var(--color-amber)' }
    };

    // ---- État interne ----
    let _modeCourant  = 'travail';
    let _dureeBase    = 25 * 60;    // secondes — modifiable par l'utilisateur
    let _tempsRestant = 25 * 60;
    let _enCours      = false;
    let _intervalle   = null;
    let _sessionsAuj  = 0;
    let _sessionsPomo = 0;  // compteur de sessions depuis le démarrage (pour les pauses longues)

    // ---- Persistance de l'état ----
    function _sauvegarderEtat() {
        try {
            const data = {
                mode: _modeCourant,
                dureeBase: _dureeBase,
                tempsRestant: _tempsRestant,
                enCours: _enCours,
                sessionsAuj: _sessionsAuj,
                sessionsPomo: _sessionsPomo,
                lastUpdated: Date.now(),
                lastDate: new Date().toDateString()
            };
            localStorage.setItem('revisionflow_pomodoro', JSON.stringify(data));
        } catch (e) {
            console.error('Pomodoro - erreur sauvegarde :', e);
        }
    }

    // ---- Sons via Web Audio API ----
    function _jouerSon(type = 'fin') {
        try {
            const ctx  = new (window.AudioContext || window.webkitAudioContext)();
            const gain = ctx.createGain();
            gain.connect(ctx.destination);

            if (type === 'fin') {
                // Trois bips descendants
                [880, 660, 440].forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    osc.connect(gain);
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.3);
                    gain.gain.exponentialRampToValueAtTime(
                        0.001, ctx.currentTime + i * 0.3 + 0.25
                    );
                    osc.start(ctx.currentTime + i * 0.3);
                    osc.stop(ctx.currentTime + i * 0.3 + 0.25);
                });
            }

            if (type === 'pause') {
                // Un bip court montant
                const osc = ctx.createOscillator();
                osc.connect(gain);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.3);
            }

            if (type === 'tick') {
                // Tick discret
                const osc = ctx.createOscillator();
                osc.connect(gain);
                osc.type = 'square';
                osc.frequency.value = 1200;
                gain.gain.setValueAtTime(0.05, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.03);
            }
        } catch {
            // Audio non disponible — fail silencieux
        }
    }

    // ---- Rendu du timer ----
    function _rendreChrono() {
        const m   = Math.floor(_tempsRestant / 60);
        const s   = _tempsRestant % 60;
        const txt = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

        // Nouveau Focus Card display
        const focusDigits = document.getElementById('focus-timer-digits');
        if (focusDigits) focusDigits.textContent = txt;

        // Legacy / Background elements
        const elTemps = document.getElementById('pomo-time');
        const elArc   = document.getElementById('pomo-arc');
        const elMode  = document.getElementById('pomo-mode');

        if (elTemps) elTemps.textContent = txt;
        if (elMode)  elMode.textContent  = MODES[_modeCourant]?.label || 'TRAVAIL';

        if (elArc) {
            const duree  = MODES[_modeCourant]?.duree || _dureeBase;
            const ratio  = _tempsRestant / duree;
            const offset = CIRCONFERENCE * (1 - ratio);
            elArc.style.strokeDashoffset = offset;

            // Changer la couleur du cercle selon le mode (token du Design System)
            const couleur = MODES[_modeCourant]?.couleur || 'var(--color-primary)';
            elArc.style.stroke = couleur;
        }

        // Changer le titre de l'onglet navigateur
        document.title = _enCours
            ? `(${txt}) RevisionFlow`
            : 'RevisionFlow — Dashboard';
    }

    // ---- Changement de mode ----
    function _changerMode(mode) {
        _enCours      = false;
        _modeCourant  = mode;
        _tempsRestant = MODES[mode]?.duree || _dureeBase;

        if (_intervalle) {
            clearInterval(_intervalle);
            _intervalle = null;
        }

        _mettreAJourBouton();
        _rendreChrono();
        _sauvegarderEtat();
    }

    // ---- Fin d'une session ----
    function _finSession() {
        clearInterval(_intervalle);
        _intervalle = null;
        _enCours    = false;

        if (_modeCourant === 'travail') {
            _sessionsAuj++;
            _sessionsPomo++;

            const el = document.getElementById('pomo-sess-count');
            if (el && typeof UI !== 'undefined') {
                UI.animerNombre(el, _sessionsAuj - 1, _sessionsAuj, 400);
                UI.pulse(el);
            }

            _jouerSon('fin');
            if (typeof UI !== 'undefined') {
                UI.toast('Session Pomodoro terminée ! Prends une pause bien méritée.', 'success');
            }

            // Toutes les 4 sessions → longue pause
            if (_sessionsPomo % 4 === 0) {
                _changerMode('longue');
            } else {
                _changerMode('pause');
            }

        } else {
            // Fin de pause → revenir en mode travail
            _jouerSon('pause');
            if (typeof UI !== 'undefined') {
                UI.toast('Pause terminée. C\'est reparti pour une session !', 'info');
            }
            _changerMode('travail');
        }

        _mettreAJourBouton();
    }

    // ---- Mise à jour du bouton play/pause ----
    function _mettreAJourBouton() {
        // Nouveau bouton Focus
        const focusToggleBtn = document.getElementById('btn-focus-timer-toggle');
        if (focusToggleBtn) {
            const span = focusToggleBtn.querySelector('span') || focusToggleBtn;
            span.textContent = _enCours ? 'Pause' : 'Démarrer';
        }

        // Legacy bouton
        const btn   = document.getElementById('btn-pomo-play');
        const icone = document.getElementById('pomo-play-icon');
        const wrap  = document.querySelector('.pomo-ring-wrap');
        if (btn && icone) {
            if (_enCours) {
                if (wrap) wrap.classList.add('running');
                icone.innerHTML = `<rect x="6" y="4" width="4" height="16"/>
                                   <rect x="14" y="4" width="4" height="16"/>`;
                if (btn.childNodes && typeof btn.childNodes.forEach === 'function') {
                    btn.childNodes.forEach(n => {
                        if (n.nodeType === 3) n.textContent = ' Pause';
                    });
                }
            } else {
                icone.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
                if (btn.childNodes && typeof btn.childNodes.forEach === 'function') {
                    btn.childNodes.forEach(n => {
                        if (n.nodeType === 3) n.textContent = ' Démarrer';
                    });
                }
            }
        }
    }

    // ---- Animation d'urgence quand il reste peu de temps ----
    function _verifierUrgence() {
        const elTemps = document.getElementById('pomo-time');
        if (!elTemps) return;

        if (_tempsRestant <= 10 && _modeCourant === 'travail') {
            elTemps.style.color     = 'var(--color-danger)';
            elTemps.style.animation = 'pulseCritique 0.8s ease infinite';
        } else {
            elTemps.style.color     = 'var(--text-primary)';
            elTemps.style.animation = '';
        }
    }

    // ---- API publique ----
    return {

        // Initialiser — appeler une fois au chargement du dashboard
        init() {
            try {
                const raw = localStorage.getItem('revisionflow_pomodoro');
                if (raw) {
                    const data = JSON.parse(raw);
                    _modeCourant = data.mode ?? 'travail';
                    _dureeBase = data.dureeBase ?? (25 * 60);
                    _tempsRestant = data.tempsRestant ?? (25 * 60);
                    _enCours = data.enCours ?? false;
                    _sessionsPomo = data.sessionsPomo ?? 0;

                    // Réinitialiser les sessions du jour si la date a changé
                    const todayStr = new Date().toDateString();
                    if (data.lastDate && data.lastDate !== todayStr) {
                        _sessionsAuj = 0;
                    } else {
                        _sessionsAuj = data.sessionsAuj ?? 0;
                    }

                    // Si c'était en cours, calculer le temps écoulé
                    if (_enCours && data.lastUpdated) {
                        const elapsed = Math.floor((Date.now() - data.lastUpdated) / 1000);
                        if (elapsed >= _tempsRestant) {
                            const depassement = elapsed - _tempsRestant;
                            _tempsRestant = 0;
                            _enCours = false;
                            
                            // Si fini il y a moins de 5 minutes, déclencher la fin de session
                            if (depassement < 300) {
                                _finSession();
                            } else {
                                // Sinon on réinitialise à travail
                                _modeCourant = 'travail';
                                _tempsRestant = _dureeBase;
                            }
                        } else {
                            _tempsRestant -= elapsed;
                        }
                    }
                }
            } catch (e) {
                console.error('Pomodoro - erreur chargement :', e);
            }

            // Reprendre l'intervalle si le timer doit tourner
            if (_enCours) {
                if (_intervalle) clearInterval(_intervalle);
                _intervalle = setInterval(() => {
                    _tempsRestant--;

                    if (_tempsRestant % 60 === 0 && _tempsRestant > 0) {
                        _jouerSon('tick');
                    }

                    _rendreChrono();
                    _verifierUrgence();

                    if (_tempsRestant <= 0) {
                        _finSession();
                    }
                }, 1000);
            }

            _rendreChrono();
            _mettreAJourBouton();

            // Mettre à jour l'affichage du compteur de sessions dans le DOM
            const el = document.getElementById('pomo-sess-count');
            if (el) {
                el.textContent = _sessionsAuj;
            }

            // Activer la bonne durée de base de travail dans l'UI
            const minutes = Math.round(_dureeBase / 60);
            document.querySelectorAll('.pomo-mode-btn').forEach(btn => {
                btn.classList.toggle('active',
                    btn.id === `pmode-${minutes}`
                );
            });

            // NB : les @keyframes (pulseCritique, pulse, fadeUp, …) sont définis
            // une seule fois dans core/variables.css — plus d'injection en JS.
        },

        // Démarrer ou mettre en pause
        toggle() {
            if (_enCours) {
                // Pause
                clearInterval(_intervalle);
                _intervalle = null;
                _enCours    = false;
                document.title = 'RevisionFlow — Dashboard';
            } else { // Démarrer
                // Démarrer
                _enCours = true;

                _intervalle = setInterval(() => {
                    _tempsRestant--;

                    // Tick discret toutes les 60 secondes
                    if (_tempsRestant % 60 === 0 && _tempsRestant > 0) {
                        _jouerSon('tick');
                    }

                    _rendreChrono();
                    _verifierUrgence();

                    if (_tempsRestant <= 0) {
                        _finSession();
                    }
                }, 1000);
            }

            _mettreAJourBouton();
            _rendreChrono();
            _sauvegarderEtat();
        },

        // Réinitialiser
        reset() {
            if (_intervalle) {
                clearInterval(_intervalle);
                _intervalle = null;
            }
            _enCours      = false;
            _modeCourant  = 'travail';
            _tempsRestant = _dureeBase;

            _mettreAJourBouton();
            _rendreChrono();

            const elTemps = document.getElementById('pomo-time');
            if (elTemps) {
                elTemps.style.color     = 'var(--text-primary)';
                elTemps.style.animation = '';
            }

            document.title = 'RevisionFlow — Dashboard';
            _sauvegarderEtat();
        },

        // Changer la durée de base (25 ou 50 minutes)
        setDuree(minutes) {
            if (_enCours) {
                UI.toast('Arrête le timer avant de changer la durée.', 'warning');
                return;
            }

            _dureeBase = minutes * 60;
            MODES.travail.duree = _dureeBase;

            // Mettre à jour les boutons de mode
            document.querySelectorAll('.pomo-mode-btn').forEach(btn => {
                btn.classList.toggle('active',
                    btn.id === `pmode-${minutes}`
                );
            });

            if (_modeCourant === 'travail') {
                _tempsRestant = _dureeBase;
                _rendreChrono();
            }

            UI.toast(
                `Durée réglée sur ${minutes} minutes.`,
                'info'
            );
            _sauvegarderEtat();
        },

        // Passer manuellement en mode pause
        passerPause() {
            if (_enCours) this.toggle(); // arrêter d'abord
            _changerMode('pause');
            UI.toast('Mode pause activé.', 'info');
        },

        // Passer manuellement en mode travail
        passerTravail() {
            if (_enCours) this.toggle();
            _changerMode('travail');
        },

        // Exposer l'état pour debug
        get etat() {
            return {
                mode:       _modeCourant,
                restant:    _tempsRestant,
                enCours:    _enCours,
                sessions:   _sessionsAuj
            };
        }
    };

})();