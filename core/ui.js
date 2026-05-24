// ============================================================
// ui.js — Helpers UI globaux partagés entre composants
// ============================================================

const UI = (() => {
    return {
        NOMS_MOIS: ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
        JOURS_SEM: ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'],

        // 11. Liste centralisée des pays pour éviter les doublons HTML
        PAYS: {
            "AF": "🇦🇫 Afghanistan", "ZA": "🇿🇦 Afrique du Sud", "AL": "🇦🇱 Albanie", "DZ": "🇩🇿 Algérie", "DE": "🇩🇪 Allemagne",
            "AD": "🇦🇩 Andorre", "AO": "🇦🇴 Angola", "SA": "🇸🇦 Arabie Saoudite", "AR": "🇦🇷 Argentine", "AM": "🇦🇲 Arménie",
            "AU": "🇦🇺 Australie", "AT": "🇦🇹 Autriche", "AZ": "🇦🇿 Azerbaïdjan", "BS": "🇧🇸 Bahamas", "BH": "🇧🇭 Bahreïn",
            "BD": "🇧🇩 Bangladesh", "BB": "🇧🇧 Barbade", "BE": "🇧🇪 Belgique", "BJ": "🇧🇯 Bénin", "BT": "🇧🇹 Bhoutan",
            "BY": "🇧🇾 Biélorussie", "BO": "🇧🇴 Bolivie", "BA": "🇧🇦 Bosnie-Herzégovine", "BW": "🇧🇼 Botswana", "BR": "🇧🇷 Brésil",
            "BN": "🇧🇳 Brunei", "BG": "🇧🇬 Bulgarie", "BF": "🇧🇫 Burkina Faso", "BI": "🇧🇮 Burundi", "KH": "🇰🇭 Cambodge",
            "CM": "🇨🇲 Cameroun", "CA": "🇨🇦 Canada", "CV": "🇨🇻 Cap-Vert", "CL": "🇨🇱 Chili", "CN": "🇨🇳 Chine",
            "CY": "🇨🇾 Chypre", "CO": "🇨🇴 Colombie", "KM": "🇰🇲 Comores", "CG": "🇨🇬 Congo-Brazzaville", "CD": "🇨🇩 Congo-Kinshasa",
            "KR": "🇰🇷 Corée du Sud", "CR": "🇨🇷 Costa Rica", "CI": "🇨🇮 Côte d’Ivoire", "HR": "🇭🇷 Croatie", "CU": "🇨🇺 Cuba",
            "DK": "🇩🇰 Danemark", "DJ": "🇩🇯 Djibouti", "EG": "🇪🇬 Égypte", "AE": "🇦🇪 Émirats Arabes Unis", "EC": "🇪🇨 Équateur",
            "ER": "🇪🇷 Érythrée", "ES": "🇪🇸 Espagne", "EE": "🇪🇪 Estonie", "US": "🇺🇸 États-Unis", "ET": "🇪🇹 Éthiopie",
            "FJ": "🇫🇯 Fidji", "FI": "🇫🇮 Finlande", "FR": "🇫🇷 France", "GA": "🇬🇦 Gabon", "GM": "🇬🇲 Gambie",
            "GE": "🇬🇪 Géorgie", "GH": "🇬🇭 Ghana", "GR": "🇬🇷 Grèce", "GT": "🇬🇹 Guatemala", "GN": "🇬🇳 Guinée",
            "HT": "🇭🇹 Haïti", "HN": "🇭🇳 Honduras", "HU": "🇭🇺 Hongrie", "IN": "🇮🇳 Inde", "ID": "🇮🇩 Indonésie",
            "IQ": "🇮🇶 Irak", "IR": "🇮🇷 Iran", "IE": "🇮🇪 Irlande", "IS": "🇮🇸 Islande", "IL": "🇮🇱 Israël",
            "IT": "🇮🇹 Italie", "JM": "🇯🇲 Jamaïque", "JP": "🇯🇵 Japon", "JO": "🇯🇴 Jordanie", "KZ": "🇰🇿 Kazakhstan",
            "KE": "🇰🇪 Kenya", "KG": "🇰🇬 Kirghizistan", "KW": "🇰🇼 Koweït", "LA": "🇱🇦 Laos", "LS": "🇱🇸 Lesotho",
            "LV": "🇱🇻 Lettonie", "LB": "🇱🇧 Liban", "LR": "🇱🇷 Liberia", "LY": "🇱🇾 Libye", "LT": "🇱🇹 Lituanie",
            "LU": "🇱🇺 Luxembourg", "MK": "🇲🇰 Macédoine du Nord", "MG": "🇲🇬 Madagascar", "MY": "🇲🇾 Malaisie",
            "MW": "🇲🇼 Malawi", "MV": "🇲🇻 Maldives", "ML": "🇲🇱 Mali", "MT": "🇲🇹 Malte", "MA": "🇲🇦 Maroc",
            "MU": "🇲🇺 Maurice", "MR": "🇲🇷 Mauritanie", "MX": "🇲🇽 Mexique", "MD": "🇲🇩 Moldavie", "MC": "🇲🇨 Monaco",
            "MN": "🇲🇳 Mongolie", "ME": "🇲🇪 Monténégro", "MZ": "🇲🇿 Mozambique", "NA": "🇳🇦 Namibie", "NP": "🇳🇵 Népal",
            "NI": "🇳🇮 Nicaragua", "NE": "🇳🇪 Niger", "NG": "🇳🇬 Nigeria", "NO": "🇳🇴 Norvège", "NZ": "🇳🇿 Nouvelle-Zélande",
            "OM": "🇴🇲 Oman", "UG": "🇺🇬 Ouganda", "UZ": "🇺🇿 Ouzbékistan", "PK": "🇵🇰 Pakistan", "PA": "🇵🇦 Panama",
            "PY": "🇵🇾 Paraguay", "NL": "🇳🇱 Pays-Bas", "PE": "🇵🇪 Pérou", "PH": "🇵🇭 Philippines", "PL": "🇵🇱 Pologne",
            "PT": "🇵🇹 Portugal", "QA": "🇶🇦 Qatar", "RO": "🇷🇴 Roumanie", "GB": "🇬🇧 Royaume-Uni", "RU": "🇷🇺 Russie",
            "RW": "🇷🇼 Rwanda", "SV": "🇸🇻 Salvador", "SN": "🇸🇳 Sénégal", "RS": "🇷🇸 Serbie", "SG": "🇸🇬 Singapour",
            "SK": "🇸🇰 Slovaquie", "SI": "🇸🇮 Slovénie", "SO": "🇸🇴 Somalie", "SD": "🇸🇩 Soudan", "LK": "🇱🇰 Sri Lanka",
            "SE": "🇸🇪 Suède", "CH": "🇨🇭 Suisse", "SY": "🇸🇾 Syrie", "TJ": "🇹🇯 Tadjikistan", "TZ": "🇹🇿 Tanzanie",
            "TD": "🇹🇩 Tchad", "CZ": "🇨🇿 Tchéquie", "TH": "🇹🇭 Thaïlande", "TG": "🇹🇬 Togo", "TN": "🇹🇳 Tunisie",
            "TR": "🇹🇷 Turquie", "UA": "🇺🇦 Ukraine", "UY": "🇺🇾 Uruguay", "VE": "🇻🇪 Venezuela", "VN": "🇻🇳 Vietnam",
            "YE": "🇾🇪 Yémen", "ZM": "🇿🇲 Zambie", "ZW": "🇿🇼 Zimbabwe"
        },

        // Remplit un select avec la liste des pays
        remplirSelectPays(selectId, codeSelectionne) {
            const el = document.getElementById(selectId);
            if (!el) return;
            el.innerHTML = Object.entries(this.PAYS)
                .map(([code, nom]) => `<option value="${code}" ${code === codeSelectionne ? 'selected' : ''}>${nom}</option>`)
                .join('');
        },

        // Toast notification
        toast(message, type = 'info', duree = 4000) {
            const container = document.getElementById('toast-container');
            if (!container) return;
            const icones = {
                success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
                error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
                info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
                warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>`
            };
            const couleurs = {
                success: 'var(--green)',
                error:   'var(--red)',
                info:    '#3B82F6',
                warning: 'var(--orange)'
            };
            const toast = document.createElement('div');
            toast.style.cssText = `display: flex; align-items: center; gap: 12px; padding: 13px 16px; background: var(--surface); border: 1px solid var(--border); border-left: 3px solid ${couleurs[type]}; border-radius: var(--radius-md); box-shadow: var(--shadow-lg); min-width: 260px; max-width: 360px; pointer-events: all; cursor: pointer; animation: slideIn 0.35s var(--ease-back); position: relative; overflow: hidden;`;
            toast.innerHTML = `<span style="color:${couleurs[type]};width:16px;height:16px;flex-shrink:0;display:flex;">${icones[type]}</span><span style="font-size:13px;font-weight:500;color:var(--text);flex:1;line-height:1.4;">${message}</span><div style="position:absolute;bottom:0;left:0;height:2px;background:${couleurs[type]};animation:toastBar ${duree}ms linear forwards;"></div>`;
            if (!document.getElementById('toast-keyframes')) {
                const style = document.createElement('style');
                style.id = 'toast-keyframes';
                style.textContent = `@keyframes toastBar { from { width: 100%; } to { width: 0%; } }`;
                document.head.appendChild(style);
            }
            const retirer = () => {
                toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(20px)';
                setTimeout(() => toast.remove(), 250);
            };
            toast.addEventListener('click', retirer);
            container.appendChild(toast);
            setTimeout(retirer, duree);
        },
        // Anime un nombre de from → to
        animerNombre(el, from, to, duree = 800) {
            if (!el) return;
            const debut = performance.now();
            const ease = t => 1 - Math.pow(1 - t, 3);
            const tick = (now) => {
                const p = Math.min((now - debut) / duree, 1);
                const val = Math.round(from + (to - from) * ease(p));
                el.textContent = val;
                if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        },
        // Anime un pourcentage
        animerPourcentage(el, to, duree = 800) {
            if (!el) return;
            const from = parseInt(el.textContent) || 0;
            const debut = performance.now();
            const ease = t => 1 - Math.pow(1 - t, 3);
            const tick = (now) => {
                const p = Math.min((now - debut) / duree, 1);
                const val = Math.round(from + (to - from) * ease(p));
                el.textContent = val + '%';
                if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        },
        // Animation d'apparition en cascade
        cascadeIn(selecteur, delai = 70) {
            const els = document.querySelectorAll(selecteur);
            els.forEach((el, i) => {
                el.style.opacity = '0';
                el.style.transform = 'translateY(14px)';
                setTimeout(() => {
                    el.style.transition = `opacity 0.4s var(--ease), transform 0.4s var(--ease)`;
                    el.style.opacity = '1';
                    el.style.transform = 'translateY(0)';
                }, i * delai);
            });
        },
        // Pulse sur un élément
        pulse(el) {
            if (!el) return;
            el.style.transition = 'transform 0.2s var(--ease-back)';
            el.style.transform = 'scale(1.06)';
            setTimeout(() => { el.style.transform = 'scale(1)'; }, 200);
        },
        // Shake — animation d'erreur sur un champ
        secouer(el) {
            if (!el) return;
            el.style.animation = 'none';
            void el.offsetHeight;
            el.style.animation = 'shake 0.4s ease';
            if (!document.getElementById('shake-keyframes')) {
                const style = document.createElement('style');
                style.id = 'shake-keyframes';
                style.textContent = `@keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }`;
                document.head.appendChild(style);
            }
            setTimeout(() => { el.style.animation = ''; }, 400);
        },
        // Confettis de célébration
        confettis() {
            if (typeof confetti === 'undefined') return;
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#2D9E6B', '#1f7a52', '#E8730A', '#b8deca', '#fff']
            });
        },
        // Formater une date en français
        formaterDate(str, options = {}) {
            if (!str) return '';
            const defaut = { weekday: 'long', day: 'numeric', month: 'long' };
            return new Date(str + 'T12:00:00').toLocaleDateString('fr-FR', { ...defaut, ...options });
        },
        // Formater une durée en heures
        formaterDuree(heures) {
            if (heures < 1) return `${Math.round(heures * 60)} min`;
            const h = Math.floor(heures);
            const m = Math.round((heures - h) * 60);
            return m > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`;
        },
        // Créer un élément SVG d'icône simple
        icone(nom, taille = 16) {
            const icones = {
                check:    `<polyline points="20 6 9 17 4 12"/>`,
                x:        `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`,
                plus:     `<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`,
                trash:    `<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>`,
                edit:     `<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>`,
                forward:  `<polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 004 4h12"/>`,
                calendar: `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
                clock:    `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
                download: `<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`,
                upload:   `<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>`,
                refresh:  `<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>`,
                info:     `<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>`,
                warning:  `<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/>`,
                star:     `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`,
                layers:   `<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>`,
                note:     `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>`,
                history:  `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`
            };
            const path = icones[nom] || icones.info;
            return `<svg width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
        },
        // Rendu des étoiles de difficulté
        rendreEtoiles(nb, max = 5) {
            return Array.from({ length: max }, (_, i) => `<span style="color:${i < nb ? 'var(--orange)' : 'var(--border-2)'}">${UI.icone('star', 13)}</span>`).join('');
        },
        // Modal de confirmation
        confirmer(message, onOui, onNon = null, labels = { oui: 'Confirmer', non: 'Annuler' }) {
            const overlay = document.createElement('div');
            overlay.style.cssText = `position:fixed; inset:0; background:rgba(15,28,46,0.5); backdrop-filter:blur(4px); z-index:var(--z-modal); display:flex; align-items:center; justify-content:center; animation:fadeIn 0.2s ease;`;
            overlay.innerHTML = `<div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-xl); padding:2rem; max-width:400px; width:90%; box-shadow:var(--shadow-lg); animation:scaleIn 0.25s var(--ease);"><div style="font-family:var(--font-display); font-size:16px; font-weight:700; color:var(--text); margin-bottom:0.75rem;">Confirmation</div><div style="font-size:14px; color:var(--text-2); line-height:1.6; margin-bottom:1.5rem;">${message}</div><div style="display:flex; gap:10px; justify-content:flex-end;"><button id="conf-non" class="btn btn-ghost btn-sm">${labels.non}</button><button id="conf-oui" class="btn btn-danger btn-sm">${labels.oui}</button></div></div>`;
            document.body.appendChild(overlay);
            const fermer = () => overlay.remove();
            overlay.querySelector('#conf-oui').addEventListener('click', () => {
                fermer();
                if (onOui) onOui();
            });
            overlay.querySelector('#conf-non').addEventListener('click', () => {
                fermer();
                if (onNon) onNon();
            });
            overlay.addEventListener('click', e => {
                if (e.target === overlay) fermer();
            });
        }
    };
})();