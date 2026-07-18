// ============================================================
// wizard-view.js — Logique de rendu du Wizard (corrigé)
// ============================================================

const WizardView = (() => {
    return {
        calState: { mois: new Date().getMonth(), annee: new Date().getFullYear() },

        mettreAJourUI(etape) {
            document.getElementById('wiz-hint').textContent = `Étape ${etape} sur 3`;
            for (let i = 1; i <= 3; i++) {
                const item = document.getElementById(`wsi-${i}`);
                const line = document.getElementById(`wsl-${i}`);
                if (!item) continue;
                item.classList.remove('active', 'done');
                if (i < etape) item.classList.add('done');
                if (i === etape) item.classList.add('active');
                if (line) line.classList.toggle('done', i < etape);
            }
        },

        rendreListe(modules) {
            const container = document.getElementById('modules-list');
            if (!container) {
                console.error('❌ Élément #modules-list introuvable');
                return;
            }
            if (!modules.length) {
                container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Aucun module ajouté</div></div>`;
                return;
            }
            container.innerHTML = modules.map(mod => this.moduleRowHTML(mod)).join('');
        },

        moduleRowHTML(mod) {
            if (typeof Planning === 'undefined' || !Planning.calculerScore) {
                console.error('Planning.js non chargé');
                return `<div class="module-row" style="border:1px solid red;padding:1rem;">Erreur : Planning.js manquant</div>`;
            }
            const score = Planning.calculerScore(mod, null);
            const pKey = Planning.labelPriorite(score);
            const pLbl = score === 0 ? 'En attente de date' : { high: 'Urgent : Priorité Haute', medium: 'Priorité Moyenne', low: 'Priorité Basse' }[pKey];

            // Gestion de la couleur du point (score === 0)
            let pColor;
            if (score === 0) {
                pColor = 'var(--text-3)';
            } else {
                pColor = `var(--${pKey === 'high' ? 'danger' : pKey === 'medium' ? 'warning' : 'success'})`;
            }

            const rgbaColor = mod.couleur + '15';

            // Fallback si UI.icone n'existe pas
            const iconeTrash = (typeof UI !== 'undefined' && UI.icone) ? UI.icone('trash', 16) : '🗑️';
            const iconeCalendar = (typeof UI !== 'undefined' && UI.icone) ? UI.icone('calendar', 14) : '📅';
            const iconeLayers = (typeof UI !== 'undefined' && UI.icone) ? UI.icone('layers', 14) : '📚';
            const iconeStar = (typeof UI !== 'undefined' && UI.icone) ? UI.icone('star', 18) : '⭐';

            return `
            <div class="module-row animate-pop" id="mrow-${mod.id}" style="border-left: 8px solid ${mod.couleur}; background: linear-gradient(to right, ${rgbaColor}, var(--wiz-surface))">
                <div class="module-header-row">
                    <input id="mnom-${mod.id}" 
                           class="module-input-name" 
                           type="text" 
                           placeholder="Ex: Analyse mathématique..." 
                           value="${UI.echapperHTML(mod.nom || '')}" 
                           oninput="Wizard._updateNom('${mod.id}', this.value)">
                    <button class="module-delete-btn" onclick="Wizard._supprimerModule('${mod.id}')" title="Supprimer">
                        ${iconeTrash}
                    </button>
                </div>
                
                <div class="module-details-grid">
                    <div class="module-field-group">
                        <label>Date Examen</label>
                        <div class="module-input-wrapper">
                            ${iconeCalendar}
                            <input type="date" value="${mod.dateExam || ''}" onchange="Wizard._updateDate('${mod.id}', this.value)">
                        </div>
                    </div>
                    
                    <div class="module-field-group">
                        <label>Nombre de chapitres à réviser</label>
                        <div class="module-help-text">Estime le volume de contenu à couvrir</div>
                        <div class="module-input-wrapper">
                            ${iconeLayers}
                            <input type="number" min="1" value="${mod.chapitres || 5}" onchange="Wizard._updateChapitres('${mod.id}', this.value)">
                        </div>
                    </div>

                    <div class="module-field-group">
                        <label>Difficulté</label>
                        <div class="stars-mini-row" id="stars-${mod.id}">
                            ${[1,2,3,4,5].map(n => `<button class="star-mini-btn ${n <= mod.etoiles ? 'active' : ''}" onclick="Wizard._setEtoiles('${mod.id}', ${n})" title="Difficulté ${n}/5">${iconeStar}</button>`).join('')}
                        </div>
                    </div>
                </div>
                
                <div class="module-footer-row">
                    <div class="priority-mini-badge priority-${pKey}">
                        <span class="dot" style="background:${pColor}"></span>
                        ${pLbl}
                    </div>
                </div>
            </div>`;
        },

        rendreCalendrier(modules, joursFeries, joursBlockes) {
            const container = document.getElementById('wiz-calendar-container');
            if (!container) {
                console.error('❌ Conteneur #wiz-calendar-container introuvable');
                return;
            }

            // Valeurs par défaut si UI est absent
            const joursSem = (UI && UI.JOURS_SEM) ? UI.JOURS_SEM : ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
            const nomsMois = (UI && UI.NOMS_MOIS) ? UI.NOMS_MOIS : ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

            const debut = document.getElementById('f-debut').value || Planning.toStr(new Date());
            const datesExam = modules.map(m => m.dateExam);
            const premier = new Date(this.calState.annee, this.calState.mois, 1);
            let offset = premier.getDay() - 1;
            if (offset < 0) offset = 6;
            const nbJours = new Date(this.calState.annee, this.calState.mois + 1, 0).getDate();

            try {
                const entetes = joursSem.map(j => `<div class="wiz-cal-head">${j}</div>`).join('');
                let cellules = '';
                for (let i = 0; i < offset; i++) cellules += `<div class="wiz-cal-day empty"></div>`;
                for (let d = 1; d <= nbJours; d++) {
                    const str = `${this.calState.annee}-${String(this.calState.mois + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                    const isPast = str < debut;
                    const isWE = (new Date(str + 'T12:00:00').getDay() % 6 === 0);
                    const isFerie = joursFeries.includes(str);
                    const isBlk = joursBlockes.includes(str);
                    let cls = 'wiz-cal-day';
                    if (isPast) cls += ' past';
                    else if (isFerie) cls += ' ferie';
                    else if (isWE) cls += ' weekend';
                    else if (isBlk) cls += ' blocked';
                    else cls += ' available';
                    if (datesExam.includes(str)) cls += ' exam-day';
                    cellules += `<div class="${cls}" ${!isPast && !isWE && !isFerie ? `onclick="Wizard._toggleJour('${str}')"` : ''}>${d}</div>`;
                }
                container.innerHTML = `<div class="wiz-cal-header">
                    <div class="wiz-cal-month">${nomsMois[this.calState.mois]} ${this.calState.annee}</div>
                    <div class="wiz-cal-nav">
                        <button class="wiz-cal-nav-btn" onclick="Wizard._calPrev()">‹</button>
                        <button class="wiz-cal-nav-btn" onclick="Wizard._calNext()">›</button>
                    </div>
                </div>
                <div class="wiz-cal-grid">${entetes}${cellules}</div>`;
            } catch (err) {
                console.error("Erreur dans rendreCalendrier", err);
                container.innerHTML = '<div class="empty-state">Erreur de génération du calendrier</div>';
            }
        }
    };
})();