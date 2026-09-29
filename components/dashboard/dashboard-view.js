// ============================================================
// dashboard-view.js — Moteur de Rendu Minimaliste Focus Board
// ============================================================

const DashboardView = (() => {

    let _activeSessionId = null;
    let _ctxDate = null;
    let _ctxModuleId = null;
    let _ctxSessionId = null;
    let _lastFocusedElement = null;

    // V3.3 §10 : mémoire volatile de transition (pas de stockage).
    // F5 réinitialise → aucun toast au rechargement, uniquement sur
    // événement réel observé pendant la session (current ↑ nouveau record).
    let _prevStreak = null;

    // V3.4 : même principe pour l'objectif quotidien. Seule la transition
    // réelle false → true observée pendant la session déclenche le retour
    // visuel (+25 XP). Jamais au premier rendu / F5 (_prevGoalReached === null).
    let _prevGoalReached = null;

    const calState = {
        mois: new Date().getMonth(),
        annee: new Date().getFullYear()
    };

    function _initActiveSession(todaySessions) {
        if (!_activeSessionId && todaySessions && todaySessions.length > 0) {
            // Chercher une session non faite stockée ou prendre la première
            const savedId = localStorage.getItem('revisionflow_active_session');
            const matchSaved = todaySessions.find(s => s.id === savedId && !s.faite);
            if (matchSaved) {
                _activeSessionId = matchSaved.id;
            } else {
                const firstPending = todaySessions.find(s => !s.faite);
                if (firstPending) {
                    _activeSessionId = firstPending.id;
                    localStorage.setItem('revisionflow_active_session', _activeSessionId);
                }
            }
        }
    }

    return {
        calState,

        getActiveSessionId() {
            return _activeSessionId;
        },

        setActiveSessionId(id) {
            _activeSessionId = id;
            if (id) {
                localStorage.setItem('revisionflow_active_session', id);
            } else {
                localStorage.removeItem('revisionflow_active_session');
            }
        },

        rendreAujourdHui(state) {
            if (!state) state = State.get();

            const today = Planning.toStr(new Date());
            const jourPlan = state.plan.find(j => j.date === today);
            const sessions = jourPlan ? [...jourPlan.sessions] : [];

            // Trier les sessions selon le score de priorité glouton
            sessions.sort((a, b) => (b.scoreSnapshot || 0) - (a.scoreSnapshot || 0));

            // Initialiser la session active si besoin
            _initActiveSession(sessions);

            // Vérifier si la session active actuelle est terminée
            if (_activeSessionId) {
                const currentActive = sessions.find(s => s.id === _activeSessionId);
                if (!currentActive || currentActive.faite) {
                    // Sélectionner la prochaine session non faite
                    const nextPending = sessions.find(s => !s.faite);
                    _activeSessionId = nextPending ? nextPending.id : null;
                    if (_activeSessionId) {
                        localStorage.setItem('revisionflow_active_session', _activeSessionId);
                    } else {
                        localStorage.removeItem('revisionflow_active_session');
                    }
                }
            }

            // Map des modules pour accès rapide
            const modMap = {};
            state.modules.forEach(m => { modMap[m.id] = m; });

            // 1. Rendu du Hero Header
            this._rendreHeader(state, sessions, today);

            // 2. Rendu de l'alerte de surcharge
            this.mettreAJourAlerteSurcharge(state);

            // 3. Partitionner les 3 colonnes du Focus Board
            let focusSession = null;
            if (_activeSessionId) {
                focusSession = sessions.find(s => s.id === _activeSessionId && !s.faite) || null;
            }

            const todoSessions = sessions.filter(s => !s.faite && s.id !== _activeSessionId);
            const doneSessions = sessions.filter(s => s.faite);

            // 4. Rendu Colonne 1 : À faire
            this._rendreColonneTodo(todoSessions, modMap, today);

            // 5. Rendu Colonne 2 : Focus Actuel
            this._rendreColonneFocus(focusSession, modMap, today, state);

            // 5b. L'indicateur « En cours » ne s'affiche que si le chrono tourne
            this._majIndicateurFocus();

            // 6. Rendu Colonne 3 : Terminées
            this._rendreColonneDone(doneSessions, modMap, today);
        },

        // Affiche la pastille pulsée et le badge « En cours » uniquement quand le
        // Pomodoro est réellement démarré. Sans session active, le badge serait
        // mensonger : le panneau affiche déjà l'état vide ou le programme terminé.
        _majIndicateurFocus() {
            const dot = document.getElementById('focus-live-dot');
            const tag = document.getElementById('focus-live-tag');
            if (!dot || !tag) return;
            const enCours = (typeof Pomodoro !== 'undefined' && Pomodoro.etat)
                ? !!Pomodoro.etat.enCours
                : false;
            dot.classList.toggle('hidden', !enCours);
            tag.classList.toggle('hidden', !enCours);
        },

        _rendreHeader(state, sessions, today) {
            const total = sessions.length;
            const faites = sessions.filter(s => s.faite).length;
            const pct = total > 0 ? Math.round((faites / total) * 100) : 0;

            const summaryEl = document.getElementById('today-hero-summary');
            if (summaryEl) {
                if (state.modules.length === 0) {
                    summaryEl.textContent = 'Aucun module configuré';
                } else if (total === 0) {
                    summaryEl.textContent = 'Aucune session prévue aujourd\'hui';
                } else if (faites === total) {
                    summaryEl.textContent = 'Toutes les sessions du jour sont terminées 🎉';
                } else {
                    const restantes = total - faites;
                    summaryEl.textContent = `${restantes} session${restantes > 1 ? 's' : ''} à faire aujourd'hui`;
                }
            }

            const statProg = document.getElementById('stat-progress-text');
            if (statProg) {
                statProg.textContent = `${faites} / ${total} sessions · ${pct}% complété`;
            }

            const statStreak = document.getElementById('stat-streak-pill');
            if (statStreak) {
                // V3.3 : métrique pure dérivée du plan (aucun stockage).
                const detail = Planning.calculerStreakDetail(state.plan, today);
                statStreak.textContent = `🔥 ${detail.current}j de série`;
                statStreak.title = detail.record > 0 ? `Record personnel : ${detail.record}j` : 'Aucune série pour le moment';
                statStreak.classList.toggle('is-gold', detail.current > 7);
                statStreak.classList.toggle('is-long', detail.current > 30);
                // Pulsation unique si streak active et journée non commencée (§9).
                const sessionCommencee = sessions.some(s => s.faite);
                statStreak.classList.toggle(
                    'streak-pulse-once',
                    detail.current > 0 && !sessionCommencee && total > 0
                );
                // Nouveau record réel : transition observée pendant la session
                // (jamais au premier rendu / F5 : _prevStreak === null).
                if (_prevStreak !== null
                    && detail.current > _prevStreak.current
                    && detail.current > _prevStreak.record
                    && detail.current === detail.record
                    && detail.current > 1
                    && typeof UI !== 'undefined' && UI.toast) {
                    UI.toast(`🏆 Nouveau record personnel — ${detail.current} jours !`, 'success');
                }
                _prevStreak = { current: detail.current, record: detail.record };
            }

            const weekEl = document.getElementById('streak-week');
            if (weekEl) {
                const week = Planning.calculerProgressionSemaine(state.plan, today);
                const labels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
                weekEl.innerHTML = week.map((d, i) => {
                    const cls = d.status === 'completed' ? 'done'
                        : d.status === 'today' ? 'today'
                        : d.status === 'failed' ? 'missed' : 'idle';
                    const title = `${d.date} — ${d.status}`;
                    return `<span class="streak-day" title="${title}"><span class="streak-dot ${cls}"></span><span class="streak-lab">${labels[i]}</span></span>`;
                }).join('');
            }

            const statGoal = document.getElementById('stat-goal-pill');
            if (statGoal) {
                // V3.4 : objectif quotidien — métrique pure dérivée du plan
                // (≥1 session prévue ET toutes terminées), zéro stockage.
                const goalReached = Planning.estObjectifQuotidienAtteint(state.plan, today);
                const bonus = Planning.XP_OBJECTIF_QUOTIDIEN;

                if (total === 0) {
                    statGoal.textContent = '🎯 Aucun objectif aujourd\'hui';
                    statGoal.title = 'Aucune session prévue aujourd\'hui';
                } else if (goalReached) {
                    statGoal.textContent = `✓ Objectif atteint · +${bonus} XP`;
                    statGoal.title = 'Toutes les sessions du jour sont terminées : bonus obtenu.';
                } else {
                    statGoal.textContent = `🎯 Objectif : ${faites} / ${total}`;
                    statGoal.title = `Terminez toutes les sessions du jour pour +${bonus} XP`;
                }
                statGoal.classList.toggle('is-done', goalReached);

                // Transition réelle false → true uniquement (jamais au F5).
                if (_prevGoalReached === false && goalReached) {
                    if (typeof UI !== 'undefined' && UI.toast) {
                        UI.toast(`✓ Objectif quotidien atteint · +${bonus} XP`, 'success');
                    }
                    // Micro-animation discrète : on réutilise la pastille XP
                    // (feedback V3.2), c'est elle qui vient de gagner +25 XP.
                    const statXpPill = document.getElementById('stat-xp-pill');
                    const cible = statXpPill || statGoal;
                    const classe = statXpPill ? 'xp-bump' : 'goal-pop-once';
                    cible.classList.remove('xp-bump', 'goal-pop-once');
                    void cible.offsetWidth; // trigger reflow
                    cible.classList.add(classe);
                    setTimeout(() => cible.classList.remove('xp-bump', 'goal-pop-once'), 600);
                }
                _prevGoalReached = goalReached;
            }

            const statXp = document.getElementById('stat-xp-pill');
            if (statXp) {
                const xpStats = state.stats?.xpAujourdhui !== undefined
                    ? state.stats
                    : Planning.calculerXP(state.plan, today);
                const xpAuj = xpStats.xpAujourdhui || 0;
                const xpTot = xpStats.xpTotal || 0;
                const xpObj = xpStats.xpObjectifsQuotidiens || 0;
                statXp.textContent = `⚡ ${xpAuj} XP aujourd'hui`;
                statXp.title = xpObj > 0
                    ? `Total cumulé : ${xpTot} XP · dont ${xpObj} XP d'objectifs quotidiens`
                    : `Total cumulé : ${xpTot} XP`;
            }

            const prochain = Planning.prochainExamen(state.modules);
            const statExam = document.getElementById('stat-exam-pill');
            if (statExam) {
                if (prochain) {
                    const jours = Math.max(0, Math.ceil((new Date(prochain.dateExam) - new Date()) / 86400000));
                    statExam.textContent = `🎯 Prochain examen : ${prochain.nom} (J-${jours})`;
                } else {
                    statExam.textContent = '🎯 Aucun examen imminent';
                }
            }
        },

        _rendreColonneTodo(todoSessions, modMap, today) {
            const listEl = document.getElementById('col-todo-list');
            const countEl = document.getElementById('count-todo');
            if (countEl) countEl.textContent = todoSessions.length;
            if (!listEl) return;

            if (todoSessions.length === 0) {
                listEl.innerHTML = `
                    <div class="col-empty-msg">
                        Aucune autre session en attente.
                    </div>`;
                return;
            }

            listEl.innerHTML = todoSessions.map(session => {
                const mod = modMap[session.moduleId];
                if (!mod) return '';

                const score = session.scoreSnapshot || 0;
                const pKey = Planning.labelPriorite(score);
                const pLabel = {
                    high: 'Priorité haute',
                    medium: 'Priorité moyenne',
                    low: 'Priorité standard'
                }[pKey] || 'Priorité standard';

                const joursAvantExam = mod.dateExam
                    ? Math.max(0, Math.ceil((new Date(mod.dateExam + 'T00:00:00') - new Date()) / 86400000))
                    : null;

                const examText = joursAvantExam !== null
                    ? (joursAvantExam === 0 ? 'Examen aujourd\'hui' : `Examen dans ${joursAvantExam}j`)
                    : 'Sans date d\'examen';

                return `
                <div class="session-card-todo" role="article">
                    <div class="todo-card-top">
                        <div class="todo-mod-name">
                            <span class="mod-color-indicator" style="background:${mod.couleur || 'var(--color-success)'}"></span>
                            <span>${UI.echapperHTML(mod.nom)}</span>
                        </div>
                        <button class="btn-card-menu" onclick="DashboardView.ouvrirCtxMenu(event,'${today}','${mod.id}','${session.id}')" title="Options" aria-label="Options">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                        </button>
                    </div>
                    <div class="todo-meta-line">
                        ${pLabel} · ${UI.formaterDuree(session.dureeH || 1)} · ${examText}
                    </div>
                    <div class="todo-card-actions">
                        <button class="btn-start-focus" onclick="Dashboard.lancerFocus('${session.id}')" type="button">
                            <span>Commencer</span>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </button>
                    </div>
                </div>`;
            }).join('');
        },

        _rendreColonneFocus(focusSession, modMap, today, state) {
            const container = document.getElementById('col-focus-container');
            if (!container) return;

            const jourPlan = state.plan.find(j => j.date === today);
            const sessions = jourPlan ? jourPlan.sessions : [];
            const total = sessions.length;
            const faites = sessions.filter(s => s.faite).length;

            if (!focusSession) {
                // État 1 : Aucun module configuré
                if (state.modules.length === 0) {
                    container.innerHTML = `
                        <div class="focus-empty-state">
                            <div class="focus-empty-icon">📚</div>
                            <div class="focus-empty-title">Aucun module configuré</div>
                            <div class="focus-empty-desc">Ajoutez vos matières et dates d'examen pour générer automatiquement votre programme de révision personnalisé.</div>
                            <button class="btn-launch-priority" onclick="Dashboard.afficherTab('modules')" type="button">
                                <span>Ajouter un premier module</span>
                                <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            </button>
                        </div>`;
                    return;
                }

                // État 2 : Toutes les sessions du jour terminées
                if (total > 0 && faites === total) {
                    container.innerHTML = `
                        <div class="focus-empty-state">
                            <div class="focus-empty-icon">🎉</div>
                            <div class="focus-empty-title">Programme du jour complété !</div>
                            <div class="focus-empty-desc">Toutes vos sessions prévues pour aujourd'hui sont terminées. Excellent travail !</div>
                            <button class="btn-launch-priority" onclick="Dashboard.anticiper()" type="button">
                                <span>Prendre de l'avance sur demain</span>
                                <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            </button>
                        </div>`;
                    return;
                }

                // État 3 : Aucune session prévue aujourd'hui (journée libre ou repos)
                if (total === 0) {
                    container.innerHTML = `
                        <div class="focus-empty-state">
                            <div class="focus-empty-icon">☕</div>
                            <div class="focus-empty-title">Journée libre ou sans session</div>
                            <div class="focus-empty-desc">Aucune session n'est planifiée pour aujourd'hui. Profitez de votre journée ou prenez de l'avance.</div>
                            <button class="btn-launch-priority" onclick="Dashboard.anticiper()" type="button">
                                <span>Planifier une session de demain</span>
                                <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            </button>
                        </div>`;
                    return;
                }

                // État 4 : Sessions existantes mais aucune active
                container.innerHTML = `
                    <div class="focus-empty-state">
                        <div class="focus-empty-icon">🎯</div>
                        <div class="focus-empty-title">Aucune session en cours</div>
                        <div class="focus-empty-desc">Sélectionnez une session dans la colonne "À faire" ou démarrez directement la matière la plus urgente.</div>
                        <button class="btn-launch-priority" onclick="Dashboard.lancerPremiereSession()" type="button">
                            <span>Lancer la session prioritaire</span>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </button>
                    </div>`;
                return;
            }

            const mod = modMap[focusSession.moduleId];
            if (!mod) return;

            const score = focusSession.scoreSnapshot || 0;
            const pKey = Planning.labelPriorite(score);
            const pClass = pKey === 'high' ? 'high' : pKey === 'medium' ? 'medium' : 'low';
            const pLabel = {
                high: 'Priorité Haute',
                medium: 'Priorité Moyenne',
                low: 'Priorité Standard'
            }[pKey];

            const joursAvantExam = mod.dateExam
                ? Math.max(0, Math.ceil((new Date(mod.dateExam + 'T00:00:00') - new Date()) / 86400000))
                : null;

            const noteExistante = (state.notes && state.notes[mod.id]) || '';

            // Synchroniser le temps Pomodoro
            const { restant, enCours } = Pomodoro.etat;
            const m = Math.floor(restant / 60);
            const s = restant % 60;
            const tempsTxt = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            const pomoIntervalleMin = Math.round((Pomodoro.etat.restant || 25 * 60) / 60);

            container.innerHTML = `
            <div class="active-focus-card">
                <div class="active-focus-header">
                    <div class="focus-subject-title">
                        <span class="focus-subject-bar" style="background:${mod.couleur || 'var(--color-success)'}"></span>
                        <span>${UI.echapperHTML(mod.nom)}</span>
                    </div>
                    <div class="focus-meta-tags">
                        <span class="prio-chip ${pClass}">${pLabel}</span>
                        <span>Session : ${UI.formaterDuree(focusSession.dureeH || 1)} · Intervalle Pomodoro : ${pomoIntervalleMin} min</span>
                        ${joursAvantExam !== null ? `<span>· Examen dans ${joursAvantExam}j</span>` : ''}
                    </div>
                </div>

                <!-- Timer Box -->
                <div class="focus-timer-box">
                    <div class="timer-digits-wrap">
                        <div class="timer-digital" id="focus-timer-digits">${tempsTxt}</div>
                        <div class="timer-label-sub">Compte à rebours Pomodoro</div>
                    </div>

                    <div class="timer-controls-row">
                        <button class="btn-timer-toggle" id="btn-focus-timer-toggle" onclick="Pomodoro.toggle(); DashboardView.syncTimerDisplay();" type="button">
                            <span>${enCours ? 'Pause' : 'Démarrer'}</span>
                        </button>
                        <button class="btn-timer-reset" onclick="Pomodoro.reset(); DashboardView.syncTimerDisplay();" title="Réinitialiser le timer" type="button">
                            Réinitialiser
                        </button>
                    </div>

                    <div class="timer-presets">
                        <button class="btn-preset ${restant === 25*60 ? 'active' : ''}" onclick="Pomodoro.setDuree(25); DashboardView.syncTimerDisplay();" type="button">25 min</button>
                        <button class="btn-preset ${restant === 50*60 ? 'active' : ''}" onclick="Pomodoro.setDuree(50); DashboardView.syncTimerDisplay();" type="button">50 min</button>
                    </div>
                </div>

                <!-- Notes rapides -->
                <div class="focus-notes-section">
                    <label class="focus-notes-title" for="focus-quick-notes">Notes rapides (${UI.echapperHTML(mod.nom)})</label>
                    <textarea id="focus-quick-notes" class="focus-notes-textarea"
                              placeholder="ex: Revoir le théorème de Taylor, formules clés..."
                              oninput="Dashboard.sauvegarderNoteRapide('${mod.id}', this.value)">${UI.echapperHTML(noteExistante)}</textarea>
                </div>

                <!-- Validation Action Button -->
                <button class="btn-complete-session" onclick="Dashboard.terminerFocusSession('${today}', '${mod.id}', '${focusSession.id}')" type="button">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>Terminer la session</span>
                </button>
            </div>`;
        },

        _rendreColonneDone(doneSessions, modMap, today) {
            const listEl = document.getElementById('col-done-list');
            const countEl = document.getElementById('count-done');
            if (countEl) countEl.textContent = doneSessions.length;
            if (!listEl) return;

            if (doneSessions.length === 0) {
                listEl.innerHTML = `
                    <div class="col-empty-msg">
                        Aucune session terminée pour le moment.
                    </div>`;
                return;
            }

            listEl.innerHTML = doneSessions.map(session => {
                const mod = modMap[session.moduleId];
                if (!mod) return '';

                const timeStr = session.termineA ? `Terminé à ${session.termineA}` : 'Terminé aujourd\'hui';

                // Bilan badge
                let bilanHtml = '';
                if (session.bilan?.maitrise) {
                    const labels = { facile: '🟢 Facile', moyen: '🟡 Moyen', 'a-revoir': '🔴 À revoir' };
                    const label = labels[session.bilan.maitrise] || session.bilan.maitrise;
                    bilanHtml = `
                        <div class="done-card-bilan-row">
                            <span class="done-maitrise-badge ${session.bilan.maitrise}">${label}</span>
                            <button class="btn-view-bilan"
                                data-date="${today}"
                                data-module-id="${mod.id}"
                                data-session-id="${session.id}"
                                type="button">Voir le bilan</button>
                        </div>`;
                }

                return `
                <div class="session-card-done" role="article">
                    <div class="done-card-left">
                        <div class="done-check-icon">✓</div>
                        <div>
                            <div class="done-mod-name">${UI.echapperHTML(mod.nom)}</div>
                            <div class="done-time-stamp">${timeStr}</div>
                            ${bilanHtml}
                        </div>
                    </div>
                    <button class="btn-undo-done" onclick="Dashboard.toggleSession('${today}', '${mod.id}', '${session.id}')" title="Annuler et remettre à faire" type="button">
                        Annuler
                    </button>
                </div>`;
            }).join('');
        },

        syncTimerDisplay() {
            // L'indicateur « En cours » est piloté par l'état du chrono, pas par
            // la présence des chiffres : appelé en premier, il reste correct même
            // quand le panneau Focus est vide (guard `!digits` ci-dessous).
            this._majIndicateurFocus();

            const digits = document.getElementById('focus-timer-digits');
            const toggleBtn = document.getElementById('btn-focus-timer-toggle');
            if (!digits) return;

            const { restant, enCours } = Pomodoro.etat;
            const m = Math.floor(restant / 60);
            const s = restant % 60;
            digits.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

            if (toggleBtn) {
                const span = toggleBtn.querySelector('span');
                if (span) span.textContent = enCours ? 'Pause' : 'Démarrer';
            }
        },

        ouvrirCtxMenu(event, date, moduleId, sessionId) {
            event.stopPropagation();
            _ctxDate = date;
            _ctxModuleId = moduleId;
            _ctxSessionId = sessionId;

            const menu = document.getElementById('session-ctx-menu');
            if (!menu) return;

            _lastFocusedElement = document.activeElement;

            const menuWidth = 190;
            let left = event.clientX - 160;
            if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;
            if (left < 10) left = 10;

            menu.style.top = (event.clientY + 6) + 'px';
            menu.style.left = left + 'px';
            menu.classList.remove('hidden');

            document.getElementById('ctx-reporter').onclick = () => {
                Dashboard.reporterSession(_ctxDate, _ctxModuleId, _ctxSessionId);
                menu.classList.add('hidden');
            };

            document.getElementById('ctx-note').onclick = () => {
                const mod = State.get().modules.find(m => m.id === _ctxModuleId);
                if (mod) Dashboard.ouvrirModalNote(_ctxModuleId, mod.nom);
                menu.classList.add('hidden');
            };
        },

        rendreCalendrier(state) {
            const today = Planning.toStr(new Date());
            const planMap = {};
            state.plan.forEach(j => { planMap[j.date] = j; });
            const datesExam = {};
            state.modules.forEach(m => { datesExam[m.dateExam] = m; });

            const premier = new Date(this.calState.annee, this.calState.mois, 1);
            let offset = premier.getDay() - 1;
            if (offset < 0) offset = 6;
            const nbJours = new Date(this.calState.annee, this.calState.mois + 1, 0).getDate();

            const labelEl = document.getElementById('cal-mois-label');
            if (labelEl) labelEl.textContent = `${UI.NOMS_MOIS[this.calState.mois]} ${this.calState.annee}`;

            const entetes = UI.JOURS_SEM.map(j => `<div class="cal-head">${j}</div>`).join('');
            let cellules = '';
            for (let i = 0; i < offset; i++) cellules += `<div></div>`;

            for (let d = 1; d <= nbJours; d++) {
                const str = `${this.calState.annee}-${String(this.calState.mois + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const jour = planMap[str];
                const exam = datesExam[str];
                let cls = 'cal-day';
                if (str === today) cls += ' today';
                if (exam) cls += ' exam';
                else if (!jour || !jour.sessions.length) cls += ' off';
                else if (jour.sessions.every(s => s.faite)) cls += ' done';
                else if (str < today && jour.sessions.some(s => !s.faite)) cls += ' missed';
                else cls += ' todo';

                let dots = '';
                if (jour?.sessions.length) {
                    const modMap = {};
                    state.modules.forEach(m => { modMap[m.id] = m; });
                    const couleurs = [...new Set(jour.sessions.map(s => modMap[s.moduleId]?.couleur).filter(Boolean))];
                    dots = `<div class="cal-day-dots">${couleurs.slice(0, 3).map(c => `<div class="cal-day-dot" style="background:${c}"></div>`).join('')}</div>`;
                }

                cellules += `<div class="${cls}"
                    role="button"
                    tabindex="0"
                    onclick="DashboardView.ouvrirDetailJour('${str}')"
                    ${exam ? `title="Examen : ${UI.echapperHTML(exam.nom)}"` : ''}>
                    <div>${d}</div>${dots}
                </div>`;
            }

            const grille = document.getElementById('cal-grille');
            if (grille) grille.innerHTML = entetes + cellules;

            this.rendreProchainsExamens(state);
        },

        ouvrirDetailJour(dateStr) {
            const state = State.get();
            const jour = state.plan.find(j => j.date === dateStr);
            const detail = document.getElementById('cal-day-detail');
            const dateEl = document.getElementById('cal-detail-date');
            const sessEl = document.getElementById('cal-detail-sessions');
            if (!detail || !dateEl || !sessEl) return;

            dateEl.textContent = UI.formaterDate(dateStr, {
                weekday: 'long', day: 'numeric', month: 'long'
            });

            if (!jour || !jour.sessions.length) {
                sessEl.innerHTML = `<div class="col-empty-msg">Aucune session ce jour.</div>`;
            } else {
                const modMap = {};
                state.modules.forEach(m => { modMap[m.id] = m; });
                sessEl.innerHTML = jour.sessions.map(s => {
                    const mod = modMap[s.moduleId];
                    if (!mod) return '';
                    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle)">
                        <span style="font-weight:600">${UI.echapperHTML(mod.nom)}</span>
                        <span style="font-size:var(--text-2xs);color:var(--text-secondary)">${s.faite ? '✓ Complété' : 'À faire'}</span>
                    </div>`;
                }).join('');
            }

            detail.classList.remove('hidden');
        },

        rendreProchainsExamens(state) {
            const container = document.getElementById('prochains-examens');
            if (!container) return;
            const today = Planning.toStr(new Date());
            const modules = state.modules
                .filter(m => m.dateExam >= today)
                .sort((a, b) => a.dateExam.localeCompare(b.dateExam));

            if (!modules.length) {
                container.innerHTML = `<div class="col-empty-msg">Aucun examen à venir.</div>`;
                return;
            }

            container.innerHTML = modules.map(m => {
                const jours = Math.max(0, Math.ceil((new Date(m.dateExam) - new Date()) / 86400000));
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle)">
                    <div style="font-weight:600">${UI.echapperHTML(m.nom)}</div>
                    <div style="font-size:var(--text-2xs);color:var(--text-secondary)">${UI.formaterDate(m.dateExam, { day: 'numeric', month: 'short' })} · <strong>J-${jours}</strong></div>
                </div>`;
            }).join('');
        },

        calNav(delta) {
            this.calState.mois += delta;
            if (this.calState.mois < 0) { this.calState.mois = 11; this.calState.annee--; }
            if (this.calState.mois > 11) { this.calState.mois = 0; this.calState.annee++; }
            this.rendreCalendrier(State.get());
        },

        rendreModules(state) {
            const container = document.getElementById('modules-liste');
            if (!container) return;

            if (!state.modules.length) {
                container.innerHTML = `<div class="col-empty-msg">Aucun module configuré.</div>`;
                return;
            }

            container.innerHTML = state.modules.map(mod => {
                const progress = Planning.getModuleProgress(mod, state.plan);
                const score = Planning.calculerScore(mod, null);
                const pKey = Planning.labelPriorite(score);
                const pLabel = {
                    high: 'Priorité Haute',
                    medium: 'Priorité Moyenne',
                    low: 'Priorité Standard'
                }[pKey];

                const joursAvantExam = mod.dateExam
                    ? Math.max(0, Math.ceil((new Date(mod.dateExam) - new Date()) / 86400000))
                    : null;

                const nomPourOnclick = UI.echapperHTML(mod.nom.replace(/\\/g, '\\\\').replace(/'/g, "\\'"));

                return `
                <div class="module-clean-card">
                    <div class="mod-card-top">
                        <div class="mod-card-title" style="color:${mod.couleur || 'inherit'}">${UI.echapperHTML(mod.nom)}</div>
                        <span class="prio-chip ${pKey}">${pLabel}</span>
                    </div>
                    <div class="mod-card-meta">
                        ${progress.faites} / ${progress.total} sessions faites (${progress.pct}%)
                        ${joursAvantExam !== null ? `· Examen dans ${joursAvantExam}j` : ''}
                    </div>
                    <div class="mod-prog-track">
                        <div class="mod-prog-fill" style="width:${progress.pct}%;background:${mod.couleur || 'var(--color-success)'}"></div>
                    </div>
                    <div class="mod-card-btns">
                        <button class="btn-mod-sub" onclick="Dashboard.ouvrirEditDate('${mod.id}')" type="button">Modifier date</button>
                        <button class="btn-mod-sub" onclick="Dashboard.supprimerModule('${mod.id}','${nomPourOnclick}')" type="button">Supprimer</button>
                    </div>
                </div>`;
            }).join('');
        },

        rendreSettings(state) {
            const config = state.config;
            const soir = document.getElementById('set-h-soir');
            const weekend = document.getElementById('set-h-weekend');
            const session = document.getElementById('set-h-session');
            const lblSoir = document.getElementById('lbl-soir');
            const lblWeekend = document.getElementById('lbl-weekend');
            const lblSession = document.getElementById('lbl-session');

            if (soir) { soir.value = config.heuresSoir; if (lblSoir) lblSoir.textContent = config.heuresSoir + 'h'; }
            if (weekend) { weekend.value = config.heuresWeekend; if (lblWeekend) lblWeekend.textContent = config.heuresWeekend + 'h'; }
            if (session) { session.value = config.dureeSession || 1; if (lblSession) lblSession.textContent = (config.dureeSession || 1) + 'h'; }

            UI.remplirSelectPays('sb-pays-select', state.pays || 'MA');
        },

        mettreAJourAlerteSurcharge(state) {
            const alert = document.getElementById('backlog-alert');
            if (!alert) return;
            const total = (state.backlog || []).reduce((acc, b) => acc + b.sessions, 0);
            if (total > 0) {
                alert.classList.remove('hidden');
                alert.textContent = `⚠️ Surcharge : ${total} session${total > 1 ? 's' : ''} ne tiennent plus dans le planning disponible avant les dates d'examens.`;
            } else {
                alert.classList.add('hidden');
            }
        }
    };
})();