// ============================================================
// planning.js — Algorithme de planification
// Fonctions pures uniquement — zéro manipulation du DOM
// ============================================================

const Planning = (() => {

    return {

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
        genererJours(dateDebut, modules, config, joursFeeries = []) {
            const jours     = [];
            const today     = this.toStr(new Date());
            const dateMax   = [...modules].map(m => m.dateExam).sort().pop();
            if (!dateMax) return [];

            const current = new Date(dateDebut + 'T12:00:00');
            const last    = new Date(dateMax    + 'T12:00:00');

            while (current <= last) {
                const str     = this.toStr(current);
                const estWE   = this.estSamediDimanche(str);
                const estFerie = joursFeeries.includes(str);
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
        generer({ dateDebut, modules, config, joursFeeries = [], planActuel = [] }) {
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

            const joursFuturs = this.genererJours(debutFutur, modules, config, joursFeeries);

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

            // Streak
            let streak = 0;
            const sorted = [...plan]
                .filter(j => j.date <= today && j.sessions.length)
                .sort((a, b) => b.date.localeCompare(a.date));
            for (const j of sorted) {
                if (j.sessions.every(s => s.faite)) streak++;
                else break;
            }

            // Vélocité sur 3 jours
            const il2j = new Date();
            il2j.setDate(il2j.getDate() - 2); // Fenêtre de 3 jours : J-2, J-1, Aujourd'hui
            const str2j = this.toStr(il2j);
            let sessRec = 0;
            plan
                .filter(j => j.date >= str2j && j.date <= today)
                .forEach(j => j.sessions.forEach(s => { if (s.faite) sessRec++; }));
            const velocite = +(sessRec / 3).toFixed(1);

            return {
                totalSessions: totalVolume,
                sessionsFaites: faits,
                pourcentage,
                joursRestants,
                streak,
                velocite
            };
        }
    };
})();