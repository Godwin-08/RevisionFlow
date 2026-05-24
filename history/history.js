// ============================================================
// history.js — Page historique des plannings archivés
// Lecture seule stricte
// ============================================================

const History = (() => {

    let _detailOuvert = null;

    function _rendreCartes(historique) {
        const container = document.getElementById('hist-liste');
        const empty     = document.getElementById('hist-empty');

        if (!historique?.length) {
            empty.classList.remove('hidden');
            container.innerHTML = '';
            return;
        }

        empty.classList.add('hidden');

        container.innerHTML = historique.map((h, i) => {
            const pct     = h.tauxCompletion || 0;
            const pctCls  = pct >= 70 ? 'ok' : pct >= 40 ? 'moyen' : 'faible';
            const couleur = pct >= 70
                ? 'var(--green)'
                : pct >= 40
                    ? 'var(--orange)'
                    : 'var(--red)';

            const dateArch = UI.formaterDate(h.dateArchive.split('T')[0], { 
                year: 'numeric' 
            });

            const nomsMods = h.modules?.map(m => m.nom).slice(0, 3).join(', ')
                + (h.modules?.length > 3 ? ` +${h.modules.length - 3}` : '');

            const stats = h.stats || {};

            return `
            <div class="hist-card"
                 onclick="History.ouvrirDetail('${h.id}')"
                 style="animation-delay:${i * 80}ms">

                <div class="hist-card-header">
                    <div class="hist-card-left">
                        <div class="hist-card-date">Archivé le ${dateArch}</div>
                        <div class="hist-card-mods">${nomsMods || '—'}</div>
                    </div>
                    <div class="hist-card-pct ${pctCls}">${pct}%</div>
                </div>

                <div class="hist-card-track">
                    <div class="hist-card-fill"
                         style="width:${pct}%;background:${couleur}"></div>
                </div>

                <div class="hist-card-footer">
                    <div class="hist-card-tags">
                        <span class="hist-card-tag">
                            ${stats.totalSessions || 0} sessions
                        </span>
                        <span class="hist-card-tag">
                            ${stats.streak || 0} jours de suite
                        </span>
                        <span class="hist-card-tag">
                            ${(stats.velocite || 0).toFixed(1)} sess/j
                        </span>
                    </div>
                    <span class="hist-card-voir">
                        Voir le détail
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="2.5" stroke-linecap="round"
                             width="13" height="13">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </span>
                </div>
            </div>`;
        }).join('');

        // Animer les barres après rendu
        setTimeout(() => {
            document.querySelectorAll('.hist-card-fill').forEach(bar => {
                bar.style.transition = 'width 0.8s var(--ease)';
            });
        }, 100);
    }

    function _rendreDetail(entry) {
        const pct     = entry.tauxCompletion || 0;
        const stats   = entry.stats || {};
        const modules = entry.modules || [];

        // Date
        document.getElementById('hd-date').textContent = 
            UI.formaterDate(entry.dateArchive.split('T')[0], { year: 'numeric', weekday: undefined });

        document.getElementById('hd-titre').textContent =
            modules.map(m => m.nom).join(' · ') || 'Planning archivé';

        // Stats
        document.getElementById('hd-stats').innerHTML = `
            <div class="hd-stat">
                <div class="hd-stat-val">${pct}%</div>
                <div class="hd-stat-lbl">Taux de complétion</div>
            </div>
            <div class="hd-stat">
                <div class="hd-stat-val">${stats.totalSessions || 0}</div>
                <div class="hd-stat-lbl">Sessions totales</div>
            </div>
            <div class="hd-stat">
                <div class="hd-stat-val">${stats.streak || 0}</div>
                <div class="hd-stat-lbl">Jours de suite</div>
            </div>
            <div class="hd-stat">
                <div class="hd-stat-val">${(stats.velocite || 0).toFixed(1)}</div>
                <div class="hd-stat-lbl">Sessions/jour</div>
            </div>
        `;

        // Modules archivés
        if (!modules.length) {
            document.getElementById('hd-modules').innerHTML =
                '<div class="empty-state"><div class="empty-state-desc">Aucun module.</div></div>';
            return;
        }

        // Calculer les stats par module depuis le plan archivé
        const modStats = {};
        modules.forEach(m => {
            let total = 0, faites = 0;
            entry.plan?.forEach(j => j.sessions?.forEach(s => {
                if (s.moduleId === m.id) {
                    total++;
                    if (s.faite) faites++;
                }
            }));
            modStats[m.id] = {
                total,
                faites,
                pct: total > 0 ? Math.round((faites / total) * 100) : 0
            };
        });

        document.getElementById('hd-modules').innerHTML =
            modules.map(m => {
                const ms      = modStats[m.id];
                const etoiles = '★'.repeat(m.etoiles) + '☆'.repeat(5 - m.etoiles);
                const dateExam = m.dateExam
                    ? new Date(m.dateExam + 'T12:00:00').toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'short'
                      })
                    : '—';

                return `
                <div class="hd-module-item">
                    <div class="hd-module-dot"
                         style="background:${m.couleur || 'var(--green)'}"></div>
                    <div class="hd-module-nom">${m.nom}</div>
                    <div class="hd-module-etoiles">${etoiles}</div>
                    <div class="hd-module-date">Exam : ${dateExam}</div>
                    <div class="hd-module-pct">${ms?.pct || 0}%</div>
                </div>`;
            }).join('');

        // Afficher le panneau
        const detail = document.getElementById('hist-detail');
        detail.classList.remove('hidden');
        detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    return {

        init() {
            const saved = Storage.charger();
            if (saved) State.replace(saved);

            const state = State.get();
            _rendreCartes(state.historique || []);
        },

        ouvrirDetail(id) {
            const state = State.get();
            const entry = state.historique?.find(h => h.id === id);
            if (!entry) return;

            _detailOuvert = id;
            _rendreDetail(entry);

            // Highlight la carte sélectionnée
            document.querySelectorAll('.hist-card').forEach(c => {
                c.style.opacity = '0.5';
            });
            document.querySelectorAll('.hist-card')[
                state.historique.findIndex(h => h.id === id)
            ].style.opacity = '1';
        },

        fermerDetail() {
            document.getElementById('hist-detail').classList.add('hidden');
            document.querySelectorAll('.hist-card').forEach(c => {
                c.style.opacity = '1';
            });
            _detailOuvert = null;
        }
    };

})();

document.addEventListener('DOMContentLoaded', () => {
    History.init();
});