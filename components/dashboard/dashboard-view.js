const DashboardView = (() => {
    return {
        state: { tab: 'aujourdhui' },
        calState: { mois: new Date().getMonth(), annee: new Date().getFullYear() },
        _ctxDate: null,
        _ctxModuleId: null,

        rendreSidebar() {
            const state = State.get();
            const prochain = Planning.prochainExamen(state.modules);
            const sbExam = document.getElementById('sb-exam-card');

            if (prochain && sbExam) {
                const { urgence } = Planning.formaterCountdown(prochain.dateExam);
                sbExam.classList.remove('urgence', 'critique');
                if (urgence === 'alerte') sbExam.classList.add('urgence');
                if (urgence === 'critique') sbExam.classList.add('critique');

                const nomEl = document.getElementById('sb-exam-nom');
                const modEl = document.getElementById('sb-exam-module');
                if (nomEl) nomEl.textContent = UI.formaterDate(prochain.dateExam, { day: 'numeric', month: 'short' });
                if (modEl) modEl.textContent = prochain.nom;
            }

            const streakEl = document.getElementById('sb-streak');
            if (streakEl) {
                const { streak, velocite } = state.stats;
                streakEl.textContent = streak > 0
                    ? `${streak} jour${streak > 1 ? 's' : ''} de suite · ${velocite} sess/j`
                    : `${velocite} sessions/jour en moyenne`;
            }
        },

        rendreStats(state) {
            const pct = state.stats.pourcentage || 0;
            const ring = document.getElementById('ring-fill');
            if (ring) {
                const c = 188.5;
                ring.style.strokeDashoffset = c - (pct / 100) * c;
            }
            const pctEl = document.getElementById('ring-pct');
            if (pctEl) pctEl.textContent = pct + '%';
        },

        rendreStatsBar(state, jourPlan) {
            const today = Planning.toStr(new Date());
            const faites = jourPlan ? jourPlan.sessions.filter(s => s.faite).length : 0;
            const total  = jourPlan ? jourPlan.sessions.length : 0;

            const elSessions = document.getElementById('stat-sessions');
            const elGlobal   = document.getElementById('stat-global');
            const elStreak   = document.getElementById('stat-streak');
            const elJours    = document.getElementById('stat-jours');

            if (elSessions) elSessions.textContent = `${faites}/${total}`;
            if (elGlobal)   elGlobal.textContent   = (state.stats.pourcentage || 0) + '%';
            if (elStreak)   elStreak.textContent    = (state.stats.streak || 0) + 'j';

            const prochain = Planning.prochainExamen(state.modules);
            if (elJours) {
                elJours.textContent = prochain
                    ? `J-${state.stats.joursRestants}`
                    : '—';
            }

            const progFill = document.getElementById('today-prog-fill');
            if (progFill) {
                const pct = total > 0 ? Math.round((faites / total) * 100) : 0;
                progFill.style.width = pct + '%';
            }
        },

        rendreAujourdHui(state) {
            if (!state) state = State.get();
            Filters.restaurer();

            // Monter le panneau de filtres si nécessaire
            const filtersContainer = document.getElementById('filters-container');
            if (filtersContainer) {
                if (!filtersContainer.hasChildNodes()) {
                    Filters.monter('filters-container');
                } else {
                    Filters.rafraichir('filters-container');
                }
            }

            const today = Planning.toStr(new Date());
            const planFiltre = Filters.filtrerPlan(state.plan);
            const jourPlan = planFiltre.find(j => j.date === today);

            // Titre plus élégant (Date du jour)
            const titreEl = document.getElementById('today-titre');
            const dateFormatted = UI.formaterDate(today, { weekday: 'long', day: 'numeric', month: 'long' });
            const dateTxt = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);
            if (titreEl) titreEl.textContent = dateTxt;

            const dateHeaderEl = document.getElementById('today-date-title');
            if (dateHeaderEl) dateHeaderEl.textContent = dateTxt;

            this.rendreStatsBar(state, jourPlan);
            this.mettreAJourAlerteSurcharge(state);

            const faites = jourPlan ? jourPlan.sessions.filter(s => s.faite).length : 0;
            const total  = jourPlan ? jourPlan.sessions.length : 0;

            const subEl = document.getElementById('today-subtitle');
            if (subEl) {
                if (!jourPlan || !total) {
                    subEl.textContent = 'Aucune session prévue — profite ou anticipe.';
                } else if (faites === total) {
                    subEl.textContent = 'Toutes les sessions du jour sont faites.';
                } else {
                    subEl.textContent = `${faites} faite${faites > 1 ? 's' : ''} · ${total - faites} restante${(total - faites) > 1 ? 's' : ''}`;
                }
            }

            const done  = document.getElementById('prog-done');
            const rest  = document.getElementById('prog-rest');
            if (done) done.textContent = faites;
            if (rest) rest.textContent = total - faites;

            const ring = document.getElementById('ring-fill');
            if (ring) {
                const c = 276.5;
                const pct = total > 0 ? faites / total : 0;
                ring.style.strokeDashoffset = c - pct * c;
                const pctEl = document.getElementById('ring-pct');
                if (pctEl) pctEl.textContent = Math.round(pct * 100) + '%';
            }

            const sessionsList = document.getElementById('sessions-list');
            if (!jourPlan || !total) {
                if (sessionsList) sessionsList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-title">Aucune session aujourd'hui</div>
                        <div class="empty-state-desc">Tu peux avancer une session future ci-dessous.</div>
                    </div>`;
            } else {
                const modMap = {};
                state.modules.forEach(m => { modMap[m.id] = m; });
                let sessions = Filters.filtrerSessions(jourPlan.sessions, state.plan);
                // Tri intelligent : d'abord le statut (à faire avant faits), puis la priorité
                sessions.sort((a, b) => {
                    if (a.faite !== b.faite) return a.faite ? 1 : -1;
                    return (b.scoreSnapshot || 0) - (a.scoreSnapshot || 0);
                });
                if (sessionsList) {
                    sessionsList.innerHTML = sessions.length
                        ? sessions.map((s, i) => this.sessionItemHTML(s, today, modMap, state, i)).join('')
                        : `<div class="empty-state"><div class="empty-state-title">Aucune session pour ce filtre</div></div>`;
                }
            }

            this._rendreFuturSessions(state, planFiltre, today);
        },

        sessionItemHTML(session, date, modMap, state, idx) {
            const mod = modMap[session.moduleId];
            if (!mod) return '';

            const score = session.scoreSnapshot || 0;
            const pKey  = Planning.labelPriorite(score);
            const pMeta = {
                high:   { bg: '#fef2f2', color: '#991b1b', label: 'Priorité Haute'  },
                medium: { bg: '#fff7ed', color: '#9a3412', label: 'Priorité Moyenne'  },
                low:    { bg: '#f0fdf4', color: '#166534', label: 'Basse'  }
            }[pKey];

            const joursAvantExam = mod.dateExam
                ? Math.max(0, Math.ceil((new Date(mod.dateExam + 'T00:00:00') - new Date()) / 86400000))
                : null;

            return `
            <div class="session-item-large ${session.faite ? 'is-done' : ''}"
                 style="animation-delay:${idx * 60}ms"
                 onclick="Dashboard.toggleSession('${date}','${mod.id}', '${session.id}')">
                <div class="session-accent-bar" style="background:${mod.couleur}"></div>
                <div class="session-card-main">
                    <div class="session-mod-name ${session.faite ? 'done' : ''}">${mod.nom}</div>
                    <div class="session-prio-row">
                        <span class="session-prio-badge"
                              style="background:${pMeta.bg};color:${pMeta.color}">
                            ${pMeta.label}
                        </span>
                        <span class="session-time-meta">${UI.formaterDuree(session.dureeH)}</span>
                        ${joursAvantExam !== null
                            ? `<span class="session-exam-date">Exam J-${joursAvantExam}</span>`
                            : ''}
                    </div>
                </div>
                <div class="session-card-side">
                    <button class="session-menu-btn"
                            onclick="DashboardView.ouvrirCtxMenu(event,'${date}','${mod.id}')"
                            title="Options">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                             stroke-linecap="round" width="14" height="14">
                            <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
                        </svg>
                    </button>
                    <div class="session-check-circle ${session.faite ? 'done' : ''}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="3" stroke-linecap="round" width="18" height="18">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </div>
                </div>
            </div>`;
        },

        ouvrirCtxMenu(event, date, moduleId) {
            event.stopPropagation();
            this._ctxDate     = date;
            this._ctxModuleId = moduleId;

            const menu = document.getElementById('session-ctx-menu');
            if (!menu) return;

            menu.classList.remove('hidden');
            menu.style.top  = (event.clientY + 4) + 'px';
            menu.style.left = (event.clientX - 160) + 'px';

            document.getElementById('ctx-reporter').onclick = () => {
                Dashboard.reporterSession(this._ctxDate, this._ctxModuleId);
                menu.classList.add('hidden');
            };
            document.getElementById('ctx-note').onclick = () => {
                const mod = State.get().modules.find(m => m.id === this._ctxModuleId);
                if (mod) Dashboard.ouvrirModalNote(this._ctxModuleId, mod.nom);
                menu.classList.add('hidden');
            };
        },

        _rendreFuturSessions(state, plan, today) {
            const futureList = document.getElementById('future-list');
            if (!futureList) return;
            const modMap = {};
            state.modules.forEach(m => { modMap[m.id] = m; });

            const prochains = plan
                .filter(j => j.date > today && j.sessions.some(s => !s.faite))
                .slice(0, 5);

            if (!prochains.length) {
                futureList.innerHTML = `<div style="font-size:13px;color:var(--text-3);padding:4px 0">Aucune session à venir.</div>`;
                return;
            }

            futureList.innerHTML = prochains.map(jour => {
                const sessions = jour.sessions.filter(s => !s.faite);
                const label = UI.formaterDate(jour.date, {
                    weekday: 'short', day: 'numeric', month: 'short'
                });
                const chips = sessions.map(s => {
                    const mod = modMap[s.moduleId];
                    if (!mod) return '';
                    return `<span class="future-session-chip" style="border-left-color:${mod.couleur}">${mod.nom}</span>`;
                }).join('');
                return `<div class="future-day-item">
                    <span class="future-day-label">${label}</span>
                    <div class="future-sessions">${chips}</div>
                </div>`;
            }).join('');
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
                    onclick="DashboardView.ouvrirDetailJour('${str}')"
                    ${exam ? `title="Examen : ${exam.nom}"` : ''}>
                    <div class="cal-day-num">${d}</div>${dots}
                </div>`;
            }

            const grille = document.getElementById('cal-grille');
            if (grille) grille.innerHTML = entetes + cellules;

            this.rendreProchainsExamens(state);
        },

        ouvrirDetailJour(dateStr) {
            const state = State.get();
            const jour  = state.plan.find(j => j.date === dateStr);
            const detail = document.getElementById('cal-day-detail');
            const dateEl = document.getElementById('cal-detail-date');
            const sessEl = document.getElementById('cal-detail-sessions');
            if (!detail || !dateEl || !sessEl) return;

            dateEl.textContent = UI.formaterDate(dateStr, {
                weekday: 'long', day: 'numeric', month: 'long'
            });

            if (!jour || !jour.sessions.length) {
                sessEl.innerHTML = `<div class="empty-state"><div class="empty-state-desc">Aucune session ce jour.</div></div>`;
            } else {
                const modMap = {};
                state.modules.forEach(m => { modMap[m.id] = m; });
                sessEl.innerHTML = jour.sessions.map(s => {
                    const mod = modMap[s.moduleId];
                    if (!mod) return '';
                    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
                        <div style="width:8px;height:8px;border-radius:50%;background:${mod.couleur};flex-shrink:0"></div>
                        <span style="flex:1;font-size:14px;font-weight:500;color:var(--text)">${mod.nom}</span>
                        <span style="font-size:12px;padding:2px 8px;border-radius:99px;background:${s.faite ? 'var(--green-light)' : 'var(--bg)'};color:${s.faite ? 'var(--green-dark)' : 'var(--text-3)'}">${s.faite ? 'Fait' : 'À faire'}</span>
                    </div>`;
                }).join('');
            }

            detail.classList.remove('hidden');
            detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        },

        rendreProchainsExamens(state) {
            const container = document.getElementById('prochains-examens');
            if (!container) return;
            const today = Planning.toStr(new Date());
            const modules = state.modules
                .filter(m => m.dateExam >= today)
                .sort((a, b) => a.dateExam.localeCompare(b.dateExam));

            if (!modules.length) {
                container.innerHTML = `<div class="empty-state"><div class="empty-state-desc">Aucun examen à venir.</div></div>`;
                return;
            }

            container.innerHTML = modules.map(m => {
                const jours = Math.max(0, Math.ceil((new Date(m.dateExam) - new Date()) / 86400000));
                const cls = jours < 5 ? 'proche' : jours < 14 ? 'normal' : 'loin';
                return `<div class="exam-list-item">
                    <div class="exam-dot" style="background:${m.couleur}"></div>
                    <div class="exam-nom">${m.nom}</div>
                    <div style="font-size:12px;color:var(--text-3)">${UI.formaterDate(m.dateExam, { day: 'numeric', month: 'short' })}</div>
                    <span class="exam-jours ${cls}">J-${jours}</span>
                </div>`;
            }).join('');
        },

        calNav(delta) {
            this.calState.mois += delta;
            if (this.calState.mois < 0)  { this.calState.mois = 11; this.calState.annee--; }
            if (this.calState.mois > 11) { this.calState.mois = 0;  this.calState.annee++; }
            this.rendreCalendrier(State.get());
        },

        rendreModules(state) {
            const container = document.getElementById('modules-liste');
            if (!container) return;

            if (!state.modules.length) {
                container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Aucun module</div></div>`;
                return;
            }

            const statsModule = {};
            state.modules.forEach(m => {
                let total = 0, faites = 0;
                state.plan.forEach(j => j.sessions.forEach(s => {
                    if (s.moduleId === m.id) { total++; if (s.faite) faites++; }
                }));
                const restantes = Math.max(0, (m.chapitres || 5) - (m.sessionsValidees || 0));
                statsModule[m.id] = {
                    total, faites, restantes,
                    pct: total > 0 ? Math.round((faites / total) * 100) : 0,
                    score: Planning.calculerScore(m, null)
                };
            });

            const tries = [...state.modules].sort((a, b) =>
                statsModule[b.id].score - statsModule[a.id].score
            );

            container.innerHTML = tries.map((mod, i) => {
                const s    = statsModule[mod.id];
                const pKey = Planning.labelPriorite(s.score);
                const pColors = {
                    high:   { bg: '#FEE2E2', color: '#991b1b' },
                    medium: { bg: '#FEF3C7', color: '#92400e' },
                    low:    { bg: '#D1FAE5', color: '#065f46' }
                }[pKey];
                const joursAvantExam = mod.dateExam
                    ? Math.max(0, Math.ceil((new Date(mod.dateExam) - new Date()) / 86400000))
                    : null;

                return `
                <div class="mod-item" style="animation-delay:${i * 50}ms;padding-left:12px;border-left:4px solid ${mod.couleur}">
                    <div class="mod-item-header">
                        <div class="mod-item-left">
                            <div class="mod-nom">${mod.nom}</div>
                        </div>
                        <div class="mod-right">
                            <span class="mod-score-badge"
                                  style="background:${pColors.bg};color:${pColors.color}">
                                ${pKey}
                            </span>
                            <span class="mod-date-exam">
                                ${UI.formaterDate(mod.dateExam, { day: 'numeric', month: 'short' })}
                            </span>
                            <button class="mod-edit-date" onclick="Dashboard.ouvrirEditDate('${mod.id}')"
                                    title="Modifier la date">
                                ${UI.icone('edit', 12)}
                            </button>
                            <button class="mod-edit-date" style="color:var(--text-3)"
                                    onclick="Dashboard.supprimerModule('${mod.id}','${mod.nom.replace(/'/g,"\\'")}')">
                                ${UI.icone('trash', 12)}
                            </button>
                        </div>
                    </div>
                    <div class="mod-sessions-restantes">
                        ${s.restantes} session${s.restantes > 1 ? 's' : ''} restante${s.restantes > 1 ? 's' : ''}
                        ${joursAvantExam !== null ? ` · examen dans ${joursAvantExam} jour${joursAvantExam > 1 ? 's' : ''}` : ''}
                    </div>
                    <div class="mod-mini-track" style="margin-top:8px">
                        <div class="mod-mini-fill" style="width:${s.pct}%"></div>
                    </div>
                    <div class="mod-stats-row">
                        <span>${s.faites} / ${s.total} sessions</span>
                        <span>${s.pct}% complété</span>
                    </div>
                </div>`;
            }).join('');
        },

        rendreSettings(state) {
            const config  = state.config;
            const soir    = document.getElementById('set-h-soir');
            const weekend = document.getElementById('set-h-weekend');
            const session = document.getElementById('set-h-session');
            const lblSoir    = document.getElementById('lbl-soir');
            const lblWeekend = document.getElementById('lbl-weekend');
            const lblSession = document.getElementById('lbl-session');

            if (soir)    { soir.value    = config.heuresSoir;       if (lblSoir)    lblSoir.textContent    = config.heuresSoir + 'h'; }
            if (weekend) { weekend.value = config.heuresWeekend;    if (lblWeekend) lblWeekend.textContent = config.heuresWeekend + 'h'; }
            if (session) { session.value = config.dureeSession || 1; if (lblSession) lblSession.textContent = (config.dureeSession || 1) + 'h'; }

            UI.remplirSelectPays('sb-pays-select', state.pays || 'MA');

            const dataInfo = document.getElementById('settings-data-info');
            if (dataInfo) dataInfo.textContent = `Données locales · ${Storage.tailleKo()} Ko`;
        },

        mettreAJourAlerteSurcharge(state) {
            const alert = document.getElementById('backlog-alert');
            if (!alert) return;
            const total = (state.backlog || []).reduce((acc, b) => acc + b.sessions, 0);
            if (total > 0) {
                alert.classList.remove('hidden');
                alert.textContent = `⚠ Surcharge : ${total} session${total > 1 ? 's' : ''} ne tiennent plus dans le planning.`;
            } else {
                alert.classList.add('hidden');
            }
        },

        syncPomo() {
            const timeEl = document.getElementById('sb-pomo-time');
            const modeEl = document.getElementById('sb-pomo-mode');
            const iconEl = document.getElementById('sb-pomo-icon');
            if (!timeEl) return;

            const { restant, enCours, mode } = Pomodoro.etat;
            const m = Math.floor(restant / 60);
            const s = restant % 60;
            timeEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            if (modeEl) modeEl.textContent = ({ travail: 'TRAVAIL', pause: 'PAUSE', longue: 'PAUSE LONGUE' }[mode] || 'TRAVAIL');
            if (iconEl) {
                iconEl.innerHTML = enCours
                    ? `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`
                    : `<polygon points="5 3 19 12 5 21 5 3"/>`;
            }
        }
    };
})();