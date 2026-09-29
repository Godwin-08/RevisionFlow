// ============================================================
// planning.js — Algorithme de planification
// Fonctions pures uniquement — zéro manipulation du DOM
// ============================================================

const Planning = (() => {

    // V3.4 — Barème du bonus d'objectif quotidien.
    // Versé une fois par jour dont TOUTES les sessions prévues sont
    // terminées. Métrique pure : recalculée depuis le plan, jamais stockée.
    const XP_OBJECTIF_QUOTIDIEN = 25;

    return {

        // Exposé pour l'UI et les tests (une seule source de vérité).
        XP_OBJECTIF_QUOTIDIEN,

        // Convertit une Date en string YYYY-MM-DD
        toStr(date) {
            const d = new Date(date);
            return [
                d.getFullYear(),
                String(d.getMonth() + 1).padStart(2, '0'),
                String(d.getDate()).padStart(2, '0')
            ].join('-');
        },

        // Vérifie si une date est un samedi ou dimanche
        estSamediDimanche(str) {
            const j = new Date(str + 'T12:00:00').getDay();
            return j === 0 || j === 6;
        },

        // Formule de priorité absolue (4.1)
        // Pi = (difficulté * chapitres) * (1 + 1/ln(Δt + 2))
        calculerScore(module, today) {
            const dateAuj    = today || this.toStr(new Date());
            const dateExam   = module.dateExam;
            if (!dateExam) return 0;

            const msRestants = new Date(dateExam) - new Date(dateAuj);
            const joursRest  = Math.max(0, Math.ceil(msRestants / 86400000));

            const baseImportance = (module.etoiles || 3) * (module.chapitres || 5);
            const urgence = 1 + (1 / Math.log(joursRest + 2));
            
            return baseImportance * urgence;
        },

        // Retourne le label de priorité selon le score
        labelPriorite(score) {
            if (score >= 15) return 'high';
            if (score >= 8) return 'medium';
            return 'low';
        },

        // Génère la liste des jours disponibles entre deux dates
        genererJours(dateDebut, modules, config, joursFeries = []) {
            const jours     = [];
            const today     = this.toStr(new Date());
            const dateMax   = [...modules].map(m => m.dateExam).sort().pop();
            if (!dateMax) return [];

            const current = new Date(dateDebut + 'T12:00:00');
            const last    = new Date(dateMax    + 'T12:00:00');

            while (current <= last) {
                const str     = this.toStr(current);
                const estWE   = this.estSamediDimanche(str);
                const estFerie = joursFeries.includes(str);
                const estBloque = config.joursBlockes.includes(str);
                const estLibre  = config.joursLibres.includes(str);

                let type = null;

                if (estBloque) {
                    type = 'off';
                } else if (estLibre || estFerie) { // 6.8: Jours fériés = haute capacité
                    type = 'libre';
                } else if (estWE) {
                    type = 'weekend';
                } else {
                    type = 'soir';
                }

                // Heures disponibles selon le type
                let heuresDispo = 0;
                if (type === 'soir')    heuresDispo = config.heuresSoir;
                if (type === 'weekend') heuresDispo = config.heuresWeekend;
                if (type === 'libre')   heuresDispo = config.heuresWeekend;
                if (type === 'off')     heuresDispo = 0;

                jours.push({
                    date:        str,
                    type,
                    heuresDispo,
                    sessions:    [],
                    statut:      type === 'off' ? 'off' : 'todo'
                });

                current.setDate(current.getDate() + 1);
            }

            return jours;
        },

        // Nouvel Algorithme Glouton avec Entrelacement
        generer({ dateDebut, modules, config, joursFeries = [], planActuel = [] }) {
            if (!modules.length || !dateDebut) return { plan: [], backlog: [] };
            const today = this.toStr(new Date());
            
            // 1. Préserver le passé et le jour courant (6.2)
            const base = planActuel.filter(j => j.date <= today);
            const hasToday = base.some(j => j.date === today);

            // 2. Préparer les modules à planifier (6.3)
            const travailRestant = modules.map(m => {
                // On soustrait les sessions validées ET celles déjà prévues aujourd'hui (car conservées)
                const enAttenteAuj = hasToday 
                    ? base.find(j => j.date === today).sessions.filter(s => s.moduleId === m.id && s.statut === 'en_attente').length 
                    : 0;

                return {
                    ...m,
                    sessionsRestantes: Math.max(0, (m.chapitres || 5) - (m.sessionsValidees || 0) - enAttenteAuj)
                };
            });

            // 3. Générer les jours futurs (à partir de demain si aujourd'hui est déjà dans le plan)
            let debutFutur;
            if (hasToday) {
                const next = new Date();
                next.setDate(next.getDate() + 1);
                debutFutur = this.toStr(next);
            } else {
                debutFutur = dateDebut > today ? dateDebut : today;
            }

            const joursFuturs = this.genererJours(debutFutur, modules, config, joursFeries);

            joursFuturs.forEach(jour => {
                if (jour.type === 'off') return;

                let capaciteUtilisee = 0;
                const modulesDuJour = new Map(); // Pour la pénalité de répétition

                // Tant que le jour a de la capacité et qu'il reste du travail
                while (capaciteUtilisee < jour.heuresDispo) {
                    // Calculer priorités dynamiques
                    const candidats = travailRestant
                        .filter(m => m.sessionsRestantes > 0 && m.dateExam > jour.date)
                        .map(m => {
                            let score = this.calculerScore(m, jour.date);
                            // Appliquer pénalité d'entrelacement (P / 2^k)
                            const k = modulesDuJour.get(m.id) || 0;
                            score = score / Math.pow(2, k);
                            return { ...m, scoreDynamique: score };
                        })
                        .sort((a, b) => 
                            b.scoreDynamique - a.scoreDynamique || // Priorité décroissante
                            (b.chapitres || 0) - (a.chapitres || 0) || // Tie-breaker 1 : Chapitres
                            a.nom.localeCompare(b.nom) // Tie-breaker 2 : Alphabétique
                        );

                    if (candidats.length === 0) break;

                    const cible = candidats[0];
                    jour.sessions.push({
                        id: `sess_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
                        moduleId: cible.id,
                        nom: cible.nom,
                        date: jour.date,
                        dureeH: 1,
                        faite: false,
                        statut: 'en_attente',
                        scoreSnapshot: cible.scoreDynamique
                    });

                    cible.sessionsRestantes--;
                    modulesDuJour.set(cible.id, (modulesDuJour.get(cible.id) || 0) + 1);
                    capaciteUtilisee++;
                }
            });

            // Calcul du backlog
            const backlog = travailRestant
                .filter(m => m.sessionsRestantes > 0)
                .map(m => ({ moduleId: m.id, sessions: m.sessionsRestantes }));

            return { plan: [...base, ...joursFuturs], backlog };
        },

        // Recalcule les scores avec décroissance temporelle
        recalculerScores(plan, modules, today = null) {
            const dateAuj  = today || this.toStr(new Date());
            const modMap   = {};
            modules.forEach(m => { modMap[m.id] = m; });

            // Mettre à jour les scores dans le plan
            return plan.map(jour => ({
                ...jour,
                sessions: jour.sessions.map((s, idx) => {
                    const mod = modMap[s.moduleId];
                    if (!mod) return s;
                    
                    // On recalcule le score avec la pénalité d'entrelacement pour le snapshot
                    const k = jour.sessions.slice(0, idx).filter(prev => prev.moduleId === s.moduleId).length;
                    const scoreAbsolu = this.calculerScore(mod, dateAuj);
                    const scorePenalise = scoreAbsolu / Math.pow(2, k);

                    return { ...s, scoreSnapshot: scorePenalise };
                })
            }));
        },

        // Obtenir le prochain examen
        prochainExamen(modules) {
            const today = this.toStr(new Date());
            return [...modules]
                .filter(m => m.dateExam >= today)
                .sort((a, b) => a.dateExam.localeCompare(b.dateExam))[0] || null;
        },

        // Formater le compte à rebours
        formaterCountdown(dateExam) {
            const now  = new Date();
            const exam = new Date(dateExam + 'T23:59:59');
            const diff = exam - now;

            if (diff <= 0) return { texte: 'Jour J', urgence: 'critique', jours: 0, heures: 0, minutes: 0, secondes: 0 };

            const jours    = Math.floor(diff / 86400000);
            const heures   = Math.floor((diff % 86400000) / 3600000);
            const minutes  = Math.floor((diff % 3600000)  / 60000);
            const secondes = Math.floor((diff % 60000)    / 1000);

            const texte = `J-${jours} · ${heures}h ${String(minutes).padStart(2,'0')}min ${String(secondes).padStart(2,'0')}s`;

            let urgence = 'normal';
            if (jours < 3) urgence = 'critique';
            else if (jours < 7) urgence = 'alerte';

            return { texte, urgence, jours, heures, minutes, secondes };
        },

        // Message de motivation selon le pourcentage
        messageMotivation(pct) {
            if (pct === 100) return 'Planning terminé. Bonne chance pour l\'examen.';
            if (pct >= 76)   return 'Dernière ligne droite. Ne ralentis pas.';
            if (pct >= 51)   return 'Plus de la moitié du chemin. Continue.';
            if (pct >= 26)   return 'Bon rythme. Maintiens la cadence.';
            return 'Chaque session compte. Lance-toi.';
        },

        getModuleProgress(module, plan = []) {
            const sessionsModule = [];
            (plan || []).forEach(jour => {
                (jour.sessions || []).forEach(session => {
                    if (session.moduleId === module.id) sessionsModule.push(session);
                });
            });

            if (sessionsModule.length) {
                const faites = sessionsModule.filter(s => s.faite).length;
                const total = sessionsModule.length;
                return {
                    total,
                    faites,
                    restantes: Math.max(0, total - faites),
                    pct: total > 0 ? Math.round((faites / total) * 100) : 0
                };
            }

            const fallbackTotal = Math.max(1, module.chapitres || 5);
            const faites = Math.min(module.sessionsValidees || 0, fallbackTotal);
            return {
                total: fallbackTotal,
                faites,
                restantes: Math.max(0, fallbackTotal - faites),
                pct: Math.round((faites / fallbackTotal) * 100)
            };
        },

        // ── 5bis. STREAK V3.3 — continuité pure & déterministe ──
        // Règle officielle (décision documentée) :
        //   dailyGoal = nb sessions prévues ce jour (aucun seuil
        //   configurable n'existe dans le modèle actuel).
        //   jour réussi = ≥1 session prévue ET toutes terminées.
        //   jour sans session = 'no-plan' : jamais réussi, neutre
        //   pour la continuité (ne casse pas, n'augmente pas).
        // Statuts: 'completed'|'incomplete'|'today'|'future'|'no-plan'|'failed'

        statutJour(plan, dateStr, today) {
            const ref = today || this.toStr(new Date());
            const jour = Array.isArray(plan) ? plan.find(j => j && j.date === dateStr) : null;
            const sessions = jour && Array.isArray(jour.sessions) ? jour.sessions : [];
            if (sessions.length === 0) return 'no-plan';
            const faites = sessions.filter(s => s && s.faite).length;
            const termine = (faites === sessions.length);
            if (dateStr === ref) return termine ? 'completed' : 'today';
            if (dateStr > ref) return 'future';
            return termine ? 'completed' : 'failed';
        },

        estJourObjectifAtteint(plan, dateStr, today) {
            const ref = today || this.toStr(new Date());
            return this.statutJour(plan, dateStr, ref) === 'completed';
        },

        // Vérifie si l'objectif quotidien d'une journée est atteint (V3.4 §1)
        // 1. Récupère les sessions prévues pour dateStr
        // 2. Vérifie qu'il existe au moins une session
        // 3. Vérifie que toutes les sessions sont terminées
        // 4. Retourne strictement un booléen
        estObjectifQuotidienAtteint(plan, dateStr) {
            if (!Array.isArray(plan) || !dateStr) return false;
            const jour = plan.find(j => j && j.date === dateStr);
            const sessions = jour && Array.isArray(jour.sessions) ? jour.sessions : [];
            if (sessions.length === 0) return false;
            return sessions.every(s => s && Boolean(s.faite));
        },

        // Détail d'un jour : todayProgress / todayGoal (V3.3 §3)
        detailJour(plan, dateStr) {
            const jour = Array.isArray(plan) ? plan.find(j => j && j.date === dateStr) : null;
            const sessions = jour && Array.isArray(jour.sessions) ? jour.sessions : [];
            const faites = sessions.filter(s => s && s.faite).length;
            return {
                date: dateStr,
                total: sessions.length,
                faites,
                termine: sessions.length > 0 && faites === sessions.length
            };
        },

        // Streak courante : consécutifs réussis en remontant depuis today.
        // today completed → compté (Cas B) ; today incomplet → stop (Cas A/C).
        // 'no-plan'/'future' neutres (sautés, Cas F) ; 'failed' → stop (Cas D).
        calculerStreak(plan, today) {
            const ref = today || this.toStr(new Date());
            if (!Array.isArray(plan) || plan.length === 0) return 0;
            let streak = 0;
            const cur = new Date(ref + 'T12:00:00');
            if (isNaN(cur.getTime())) return 0;
            for (let i = 0; i < 1826; i++) {
                const str = this.toStr(cur);
                const st = this.statutJour(plan, str, ref);
                if (st === 'completed') { streak++; }
                else if (st === 'no-plan' || st === 'future') { /* neutre */ }
                else if (str === ref) { /* today incomplet (Cas A/C) : non compté, on remonte */ }
                else { break; }
                cur.setDate(cur.getDate() - 1);
            }
            return streak;
        },

        // Record : plus longue séquence de 'completed' (no-plan neutre).
        calculerRecordStreak(plan, today) {
            const ref = today || this.toStr(new Date());
            if (!Array.isArray(plan) || plan.length === 0) return 0;
            const dates = [...new Set(plan.map(j => j && j.date).filter(Boolean))]
                .filter(d => d <= ref).sort();
            let record = 0, courant = 0;
            for (const d of dates) {
                const st = this.statutJour(plan, d, ref);
                if (st === 'completed') { courant++; if (courant > record) record = courant; }
                else if (st === 'no-plan' || st === 'today') { /* neutre */ }
                else { courant = 0; }
            }
            return record;
        },

        // Semaine Lun→Dim (7 jours max).
        calculerProgressionSemaine(plan, today) {
            const ref = today || this.toStr(new Date());
            const refDate = new Date(ref + 'T12:00:00');
            const dow = (refDate.getDay() + 6) % 7;
            const lundi = new Date(refDate);
            lundi.setDate(refDate.getDate() - dow);
            const sem = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(lundi);
                d.setDate(lundi.getDate() + i);
                const str = this.toStr(d);
                sem.push({ date: str, status: this.statutJour(plan, str, ref) });
            }
            return sem;
        },

        // Objet streak complet V3.3 §3.
        calculerStreakDetail(plan, today) {
            const ref = today || this.toStr(new Date());
            const det = this.detailJour(plan, ref);
            return {
                current: this.calculerStreak(plan, ref),
                record: this.calculerRecordStreak(plan, ref),
                todayCompleted: det.termine,
                todayProgress: det.faites,
                todayGoal: det.total,
                week: this.calculerProgressionSemaine(plan, ref)
            };
        },

        // FIN-BLOC-A
        calculerXPSession(session) {
            if (!session || !session.faite) return 0;
            let xp = 10; // Session terminée : +10 XP
            if (session.bilan && session.bilan.maitrise) {
                const valides = ['facile', 'moyen', 'a-revoir'];
                if (valides.includes(session.bilan.maitrise)) {
                    xp += 15; // Bilan complété avec niveau de maîtrise : +15 XP
                }
                if (session.bilan.note && String(session.bilan.note).trim().length > 0) {
                    xp += 5; // Note de bilan non vide : +5 XP
                }
            }
            return xp;
        },

        // Calcul pur de l'XP global et journalier (V3.2)
        // V3.4 : intègre le bonus d'objectif quotidien (+25 XP par jour
        // dont toutes les sessions prévues sont terminées). Purement
        // dérivé du plan → idempotent, aucun stockage supplémentaire.
        calculerXP(plan, today) {
            if (!Array.isArray(plan)) {
                return { xpTotal: 0, xpAujourdhui: 0, xpObjectifsQuotidiens: 0, objectifsAtteints: 0 };
            }
            const dateRef = today || this.toStr(new Date());
            let xpTotal = 0;
            let xpAujourdhui = 0;
            let objectifsAtteints = 0;

            for (const jour of plan) {
                if (!jour || !Array.isArray(jour.sessions)) continue;
                const isToday = (jour.date === dateRef);
                for (const s of jour.sessions) {
                    const sessionXp = this.calculerXPSession(s);
                    xpTotal += sessionXp;
                    if (isToday) xpAujourdhui += sessionXp;
                }
                // Bonus d'objectif (V3.4) : détecté sur le plan historique.
                if (this.estObjectifQuotidienAtteint(plan, jour.date)) {
                    objectifsAtteints++;
                    xpTotal += XP_OBJECTIF_QUOTIDIEN;
                    if (isToday) xpAujourdhui += XP_OBJECTIF_QUOTIDIEN;
                }
            }

            return {
                xpTotal,
                xpAujourdhui,
                xpObjectifsQuotidiens: objectifsAtteints * XP_OBJECTIF_QUOTIDIEN,
                objectifsAtteints
            };
        },

        // Stats globales du planning
        calculerStats(plan, modules, backlog = []) {
            const today = this.toStr(new Date());
            const moduleProgress = modules.map(module => this.getModuleProgress(module, plan));
            const totalSessions = moduleProgress.reduce((acc, current) => acc + current.total, 0);
            const faits = moduleProgress.reduce((acc, current) => acc + current.faites, 0);
            const pourcentage = totalSessions > 0
                ? Math.min(100, Math.round((faits / totalSessions) * 100))
                : 0;

            // Prochain exam
            const prochain    = this.prochainExamen(modules);
            const joursRestants = prochain
                ? Math.max(0, Math.ceil(
                    (new Date(prochain.dateExam) - new Date(today)) / 86400000
                  ))
                : 0;

            // Streak V3.3 — délégué à la métrique pure (neutre no-plan,
            // today incomplet non compté mais ne casse pas : on compte
            // les jours précédents réellement réussis).
            let streak = 0;
            try { streak = this.calculerStreak(plan, today); } catch (e) { streak = 0; }

            // Vélocité sur 3 jours
            const il2j = new Date();
            il2j.setDate(il2j.getDate() - 2); // Fenêtre de 3 jours : J-2, J-1, Aujourd'hui
            const str2j = this.toStr(il2j);
            let sessRec = 0;
            plan
                .filter(j => j.date >= str2j && j.date <= today)
                .forEach(j => j.sessions.forEach(s => { if (s.faite) sessRec++; }));
            const velocite = +(sessRec / 3).toFixed(1);

            const { xpTotal, xpAujourdhui, xpObjectifsQuotidiens, objectifsAtteints } = this.calculerXP(plan, today);

            return {
                totalSessions: totalSessions,
                sessionsFaites: faits,
                pourcentage,
                joursRestants,
                streak,
                velocite,
                xpTotal,
                xpAujourdhui,
                xpObjectifsQuotidiens,
                objectifsAtteints
            };
        }
    };
})();