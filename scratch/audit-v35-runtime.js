// ============================================================
// audit-v35-runtime.js — Audit runtime V3.5 (Chrome CDP réel)
// Vérifie sur de VRAIES pages : métadonnées, réseau (404),
// console, contraste (light/dark), responsive, mouvement réduit,
// accessibilité clavier, états vides, déterminisme.
//
// Prérequis :
//   1) python serve.py                      (http://localhost:8080)
//   2) chrome --remote-debugging-port=9222 --user-data-dir=<tmp>
// Exécution : node scratch/audit-v35-runtime.js
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8080';
const CDP  = 'http://127.0.0.1:9222';
const ROOT = path.resolve(__dirname, '..');

// Liste les .js DU PRODUIT (hors .git, node_modules ET hors scratch/) :
// le harnais de test ne doit jamais pouvoir se compter lui-même
// comme consommateur d'un champ d'état.
function listerJs(dir = ROOT, acc = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === '.git' || e.name === 'node_modules' || e.name === 'scratch') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) listerJs(p, acc);
        else if (e.name.endsWith('.js')) acc.push(p);
    }
    return acc;
}

const PAGES = [
    { nom: 'dashboard', url: `${BASE}/components/dashboard/dashboard.html` },
    { nom: 'wizard',    url: `${BASE}/components/wizard/wizard.html` },
    { nom: 'history',   url: `${BASE}/history/index.html` },
    { nom: 'landing',   url: `${BASE}/landing/index.html` },
    { nom: 'racine',    url: `${BASE}/index.html` }
];

let ok = 0, ko = 0;
const echecs = [];
const NA = [];   // exceptions documentées et volontaires (exemptées)
const INFO = []; // constats sans impact (ex. champ d'état inerte)

// ============================================================
// EXCEPTIONS DOCUMENTÉES — LISTE FERMÉE
// Toute assertion qui n'est pas listée ici reste un FAIL.
// Chaque entrée doit être structurelle (DOM réel), jamais fondée sur
// une simple comparaison de taille ou de ratio, afin qu'aucun vrai
// défaut ne puisse être absorbé par cette classification.
// ============================================================
const EXCEPTIONS = {
    'marque': {
        libelle: 'texte de marque',
        raison: "WCAG 1.4.3 : le texte d'un logo / nom de marque est explicitement exempté du seuil de contraste. Valeur mesurée conservée telle quelle, le mot-symbole n'est pas assombri artificiellement."
    },
    'maquette': {
        libelle: 'maquette décorative',
        raison: "Élément situé dans .preview-frame : il s'agit de la reproduction miniature et illustrative de l'interface dans la landing, pas de texte fonctionnel. Le CSS n'est pas modifié pour l'agrandir."
    }
};

// Décision de classification N/A — fonction unique, appelée par le chemin
// réel ET par l'auto-test de falsification. Elle ne repose QUE sur des faits
// structurels du DOM, jamais sur le ratio ni sur la taille du texte.
function casDeLElement(p) {
    if (p.estMarque) return 'marque';
    if (p.dansMaquette) return 'maquette';
    return null;
}

function classerNa(id, cas, libelle, details) {
    const e = EXCEPTIONS[cas];
    NA.push({ id, cas, libelle, mesure: details, raison: e.raison });
    console.log(`  \u2796 [N/A] ${id} \u2014 ${libelle}`);
    console.log(`      cas    : ${e.libelle}`);
    console.log(`      mesure : ${details}`);
    console.log(`      raison : ${e.raison}`);
}
function classerInfo(id, libelle, details) {
    INFO.push({ id, libelle, details });
    console.log(`  \u2139 [INFO] ${id} \u2014 ${libelle}`);
    if (details !== undefined) console.log('      \u2192', typeof details === 'string' ? details : JSON.stringify(details, null, 1).slice(0, 700));
}

function check(id, libelle, condition, details) {
    if (condition) { ok++; console.log(`  \u2705 ${id} \u2014 ${libelle}`); }
    else {
        ko++; echecs.push(id);
        console.log(`  \u274C ${id} \u2014 ${libelle}`);
        if (details !== undefined) console.log('      \u2192', typeof details === 'string' ? details : JSON.stringify(details, null, 1).slice(0, 2000));
    }
}
// Un résultat non mesurable (undefined / exception CDP) ne doit JAMAIS passer pour un succès.
function mesurable(r) { return r !== undefined && r !== null && !(typeof r === 'object' && r.__exc); }
function mesure(id, libelle, r) {
    if (!mesurable(r)) { ko++; echecs.push(`${id}-mesure`); console.log(`  \u274C ${id} \u2014 ${libelle} NON MESURABLE`); console.log('      \u2192', JSON.stringify(r)); }
    return mesurable(r);
}
function titre(t) { console.log(`\n\u2500\u2500 ${t} ${'\u2500'.repeat(Math.max(0, 58 - t.length))}`); }

// --- Client CDP minimal (http /json/list + WebSocket) ---
async function connecter() {
    const listRaw = await new Promise((res, rej) => {
        http.get(`${CDP}/json/list`, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej);
    });
    const page = JSON.parse(listRaw).find(p => p.type === 'page');
    if (!page) throw new Error('Aucune cible page dans Chrome CDP');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 1;
    const cbs = new Map();
    const journal = { erreurs: [], warnings: [], reseau: [] };

    ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.method === 'Runtime.exceptionThrown') {
            journal.erreurs.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
        }
        if (m.method === 'Runtime.consoleAPICalled') {
            const txt = (m.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' ');
            if (m.params.type === 'error') journal.erreurs.push('console.error: ' + txt);
            else if (m.params.type === 'warning') journal.warnings.push('console.warn: ' + txt);
        }
        if (m.method === 'Network.responseReceived') {
            const r = m.params.response;
            if (r.status >= 400) journal.reseau.push(`HTTP ${r.status} ${r.url}`);
        }
        if (m.method === 'Network.loadingFailed') {
            journal.reseau.push(`ECHEC ${m.params.errorText} (${m.params.type})`);
        }
        if (m.id && cbs.has(m.id)) { cbs.get(m.id)(m); cbs.delete(m.id); }
    };

    const send = (method, params = {}) => new Promise(r => {
        const cur = id++; cbs.set(cur, r);
        ws.send(JSON.stringify({ id: cur, method, params }));
    });
    await new Promise(r => ws.onopen = r);
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Network.enable');
    // Indispensable : sans ceci Chrome ressert le HTML/CSS depuis son cache
    // (serve.py n'envoie pas de Cache-Control) et l'audit mesure d'anciens octets.
    await send('Network.setCacheDisabled', { cacheDisabled: true });

    const ev = async (code) => {
        const r = await send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
        if (r.result?.exceptionDetails) return { __exc: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
        return r.result?.result?.value;
    };
    return { send, ev, journal, fermer: () => ws.close() };
}

async function naviguer(c, url, attente = 1400) {
    c.journal.erreurs.length = 0;
    c.journal.warnings.length = 0;
    c.journal.reseau.length = 0;
    await c.send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, attente));
    // Laisse les transitions CSS se terminer (piège du test V3.2 Test G).
    await c.ev(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 250))))`);
}


// --- Section : métadonnées + réseau + console, page par page ---
async function auditerPage(c, p) {
    titre(`PAGE ${p.nom.toUpperCase()} (${p.url.replace(BASE, '')})`);
    await naviguer(c, p.url);

    const meta = await c.ev(`({
        title: document.title,
        lang: document.documentElement.lang,
        charset: document.characterSet,
        viewport: (document.querySelector('meta[name="viewport"]') || {}).content || null,
        description: (document.querySelector('meta[name="description"]') || {}).content || null,
        favicon: [...document.querySelectorAll('link[rel*="icon"]')].map(l => l.getAttribute('href')),
        accentsOk: (() => { const s = document.body.innerText || ''; return !/\u00c3\u00a9|\u00c3\u00a8|\u00c3 |\u00c3\u00a7|\u00e2\u20ac/.test(s); })()
    })`);

    if (!mesure(`${p.nom}-meta`, `${p.nom} : lecture des métadonnées`, meta)) return null;
    check(`${p.nom}-1`, `${p.nom} : <title> non vide`, !!meta.title && meta.title.trim().length > 0, meta.title);
    check(`${p.nom}-2`, `${p.nom} : lang="fr"`, meta.lang === 'fr', meta.lang);
    check(`${p.nom}-3`, `${p.nom} : UTF-8 (charset=${meta.charset})`, (meta.charset || '').toUpperCase() === 'UTF-8', meta.charset);
    check(`${p.nom}-4`, `${p.nom} : meta viewport présent`, /width=device-width/.test(meta.viewport || ''), meta.viewport);
    check(`${p.nom}-5`, `${p.nom} : favicon déclaré`, meta.favicon.length > 0, meta.favicon);
    check(`${p.nom}-6`, `${p.nom} : accents non corrompus (pas de mojibake)`, meta.accentsOk === true);
    check(`${p.nom}-7`, `${p.nom} : 0 requête >=400 / 0 échec réseau`, c.journal.reseau.length === 0, c.journal.reseau);
    check(`${p.nom}-8`, `${p.nom} : 0 erreur console`, c.journal.erreurs.length === 0, c.journal.erreurs);
    check(`${p.nom}-9`, `${p.nom} : 0 warning console`,
        c.journal.warnings.filter(w => !/DevTools|third-party cookie|Deprecat/i.test(w)).length === 0,
        c.journal.warnings);
    return meta;
}

// --- Section : contraste WCAG (light + dark), avec aplatissement alpha ---
const CODE_CONTRASTE = `(function auditerContraste(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const parse = (c) => {
        const m = String(c).match(/rgba?\\(([^)]+)\\)/);
        if (!m) return null;
        const p = m[1].split(',').map(s => parseFloat(s.trim()));
        return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const melange = (fg, bg) => [
        fg[0] * fg[3] + bg[0] * (1 - fg[3]),
        fg[1] * fg[3] + bg[1] * (1 - fg[3]),
        fg[2] * fg[3] + bg[2] * (1 - fg[3]),
        1
    ];
    const lum = (c) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    const fondEffectif = (el) => {
        const chaine = [];
        let cur = el;
        while (cur && cur.nodeType === 1) {
            const bg = parse(getComputedStyle(cur).backgroundColor);
            if (bg && bg[3] > 0) { chaine.push(bg); if (bg[3] >= 1) break; }
            cur = cur.parentElement;
        }
        let fond = [255, 255, 255, 1];
        for (let i = chaine.length - 1; i >= 0; i--) fond = melange(chaine[i], fond);
        return fond;
    };
    // Un emoji est peint par la police, pas par la propriété CSS "color" :
    // mesurer color/fond sur un pictogramme n'a pas de sens (faux positif).
    const estEmoji = (t) => /^[\\p{Extended_Pictographic}\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\uFE0F\\u200D\\s]+$/u.test(t);
    const cibles = [...document.querySelectorAll('body *')].filter(el => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
        const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
        if (!t || estEmoji(t)) return false;
        const r = el.getBoundingClientRect();
        return r.width >= 4 && r.height >= 4;
    });
    const texteDe = (el) => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
    const problemes = [];
    const pires = { ratio: 99, sel: '' };
    for (const el of cibles) {
        const cs = getComputedStyle(el);
        const fg = parse(cs.color);
        if (!fg) continue;
        const fond = fondEffectif(el);
        const fgAplati = fg[3] >= 1 ? fg : melange(fg, fond);
        const taille = parseFloat(cs.fontSize);
        const gras = (parseInt(cs.fontWeight, 10) || 400) >= 700;
        const grand = taille >= 24 || (taille >= 18.66 && gras);
        const seuil = grand ? 3.0 : 4.5;
        const r = ratio(fgAplati, fond);
        const sel = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
        if (r < pires.ratio) { pires.ratio = Math.round(r * 100) / 100; pires.sel = sel; }
        if (r < seuil) {
            problemes.push({
                sel,
                texte: texteDe(el).slice(0, 40),
                ratio: Math.round(r * 100) / 100,
                seuil,
                taille: Math.round(taille),
                // Faits structurels mesurés dans le DOM réel (base de la
                // classification N/A). Jamais déduits du ratio ou de la taille.
                dansMaquette: !!el.closest('.preview-frame'),
                estMarque: el.tagName === 'SPAN' && !!el.parentElement && el.parentElement.classList.contains('brand-text')
            });
        }
    }
    return { theme, total: cibles.length, problemes, pires };
})`;

// --- Section : responsive (4 largeurs) + débordement horizontal ---
const LARGEURS = [1280, 768, 390, 320];
const CODE_RESPONSIVE = `(function() {
    const docW = document.documentElement.scrollWidth;
    const winW = window.innerWidth;
    const coupables = [];
    if (docW > winW) {
        for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            if ((r.right > winW + 1 || r.left < -1) && r.width <= winW + 4) {
                coupables.push({
                    sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''),
                    left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width)
                });
            }
        }
    }
    return { winW, docW, deborde: docW > winW, coupables: coupables.slice(0, 8) };
})`;

async function auditerResponsive(c, nom) {
    titre(`RESPONSIVE — ${nom}`);
    const res = [];
    for (const w of LARGEURS) {
        await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: 820, deviceScaleFactor: 1, mobile: w < 768 });
        await new Promise(r => setTimeout(r, 350));
        const r = await c.ev(`${CODE_RESPONSIVE}()`);
        res.push({ w, ...r });
        if (!mesure(`resp-${nom}-${w}`, `${nom} @${w}px`, r)) continue;
        check(`resp-${nom}-${w}`, `${nom} @${w}px : aucun débordement horizontal (doc ${r.docW} / fenêtre ${r.winW})`, r.deborde === false, r.coupables);
    }
    await new Promise(r => setTimeout(r, 400));

    // Navigation : toutes les entrées doivent rester atteignables (défilement possible).
    titre(`NAVIGATION (entrées atteignables) — ${nom}`);
    for (const w of LARGEURS) {
        await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: 820, deviceScaleFactor: 1, mobile: w < 768 });
        await new Promise(r => setTimeout(r, 300));
        const nav = await c.ev(`(() => {
            const n = document.querySelector('.topbar-nav, .nav-links');
            if (!n) return { sansNav: true };
            const items = [...n.querySelectorAll('a, button')].filter(i => i.offsetParent !== null);
            const inOuter = items.filter(i => { const b = i.getBoundingClientRect(); return b.right <= window.innerWidth + 1 && b.left >= -1; }).length;
            return {
                total: items.length,
                visibles: inOuter,
                defilable: n.scrollWidth > n.clientWidth,
                cs: getComputedStyle(n).overflowX
            };
        })()`);
        if (!mesure(`nav-${nom}-${w}`, `nav ${nom} @${w}px`, nav)) continue;
        // Pas de navigation sur cette page / à cette largeur (ex. menu landing masqué
        // en mobile) : le test ne s'applique pas et ne doit pas compter comme un PASS.
        if (nav.sansNav || !nav.total) {
            console.log(`  \u2013 nav-${nom}-${w} \u2014 ${nom} @${w}px : pas de navigation affich\u00e9e (non applicable)`);
            continue;
        }
        check(`nav-${nom}-${w}`, `${nom} @${w}px : les ${nav.total} entr\u00e9es de navigation sont atteignables`,
            nav.visibles === nav.total || nav.defilable === true,
            { total: nav.total, visibles: nav.visibles, defilable: nav.defilable, overflowX: nav.cs });
    }
    await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 250));
    return res;
}

// --- Section : préférence de mouvement réduit ---
async function auditerMouvementReduit(c, nom) {
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await new Promise(r => setTimeout(r, 400));
    const res = await c.ev(`(() => {
        const sels = ['.subtext-pill.streak-pill', '.subtext-pill.goal-pill', '.subtext-pill.xp-pill',
                      '.streak-dot.today', '.toast', '.card', '.btn', '.nav-link', '.badge'];
        const anime = [];
        for (const s of sels) {
            for (const el of document.querySelectorAll(s)) {
                const cs = getComputedStyle(el);
                // La règle prefers-reduced-motion du projet utilise la technique 0.01ms :
                // toute durée <= 50ms est donc considérée comme neutralisée.
                const duree = cs.animationDuration.split(',').map(v => parseFloat(v) || 0);
                const boucle = cs.animationIterationCount.split(',').some(v => v.trim() === 'infinite');
                const anim = duree.some(d => d > 0.05) || boucle;
                const trans = cs.transitionDuration.split(',').map(v => parseFloat(v) || 0).some(d => d > 0.05);
                if (anim || trans) anime.push({ sel: s, animation: anim, boucle, transition: trans });
            }
        }
        return { matches: matchMedia('(prefers-reduced-motion: reduce)').matches, anime: anime.slice(0, 10) };
    })()`);
    if (!mesure(`motion-${nom}`, `${nom} : préférence mouvement réduit`, res)) return null;
    check(`motion-${nom}-1`, `${nom} : media query reduce active`, res.matches === true);
    check(`motion-${nom}-2`, `${nom} : aucune animation/transition persistante`, res.anime.length === 0, res.anime);
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await new Promise(r => setTimeout(r, 250));
    return res;
}

// --- Section : états métier du dashboard (vide, partiel, atteint) + toasts ---
async function auditerEtatsDashboard(c) {
    titre('ÉTATS DASHBOARD (vide / partiel / atteint) + toasts');

    // 1) Aucun module : état vide compréhensible
    const vide = await c.ev(`(() => {
        State.reset();
        DashboardView.rendreAujourdHui(State.get());
        const txt = document.body.innerText;
        const pillGoal = document.getElementById('stat-goal-pill');
        const pillXp = document.getElementById('stat-xp-pill');
        return {
            goalText: pillGoal?.textContent, goalTitle: pillGoal?.title,
            xpText: pillXp?.textContent, xpTitle: pillXp?.title,
            hasCtaEmpty: !!document.querySelector('.empty-state, [class*="empty"], .dash-empty') || /aucun|commencez|cr[ée]er|configur/i.test(txt),
            contradictoire: /undefined|NaN|\\[object Object\\]/.test(txt)
        };
    })()`);
    check('etat-1', 'aucun module : pastille objectif explicite (pas de "0 / 0" trompeur)',
        /[Aa]ucun objectif/.test(vide.goalText || ''), vide.goalText);
    check('etat-2', 'aucun module : XP affiché à 0 sans NaN', /0 XP/.test(vide.xpText || ''), vide.xpText);
    check('etat-3', 'aucun module : aucun "undefined" / "NaN" / "[object Object]" visible', vide.contradictoire === false, vide);
    check('etat-4', 'aucun module : un message ou CTA de démarrage est présent', vide.hasCtaEmpty === true);

    // 2) Plan réel : objectif partiel puis atteint + toast (transition observée)
    const progression = await c.ev(`(() => {
        const today = Planning.toStr(new Date());
        window.__toasts = [];
        const orig = UI.toast;
        UI.toast = function (...a) { window.__toasts.push(String(a[0])); return orig.apply(this, a); };

        State.reset();
        State.update({
            config: { dateDebut: today, heuresSoir: 3, heuresWeekend: 6, dureeSession: 1, joursBlockes: [], joursLibres: [] },
            modules: [{ id: 'm1', nom: 'Audit V3.5', etoiles: 3, chapitres: 3, dateExam: '2026-12-15', sessionsValidees: 0, couleur: '#4F46E5' }]
        });
        State.planifier();
        DashboardView.rendreAujourdHui(State.get());

        const jour = State.get().plan.find(j => j.date === today);
        const total = jour.sessions.length;
        const p = document.getElementById('stat-goal-pill');
        const etapes = [];
        etapes.push({ etape: 'initial', texte: p.textContent, done: p.classList.contains('is-done'), toasts: [...window.__toasts] });

        const s0 = jour.sessions[0];
        State.validerSession(s0.moduleId, today, s0.id);
        DashboardView.rendreAujourdHui(State.get());
        etapes.push({ etape: 'partiel', texte: p.textContent, done: p.classList.contains('is-done'), toasts: [...window.__toasts] });

        const restantes = State.get().plan.find(j => j.date === today).sessions.slice(1);
        for (const s of restantes) State.validerSession(s.moduleId, today, s.id);
        DashboardView.rendreAujourdHui(State.get());
        etapes.push({ etape: 'atteint', texte: p.textContent, done: p.classList.contains('is-done'), toasts: [...window.__toasts], title: p.title });

        DashboardView.rendreAujourdHui(State.get());
        DashboardView.rendreAujourdHui(State.get());
        etapes.push({ etape: 're-rendu', texte: p.textContent, toasts: [...window.__toasts] });

        UI.toast = orig;
        return { total, etapes };
    })()`);

    const [initial, partiel, atteint, rerendu] = progression.etapes;
    check('etat-5', `objectif initial : "${initial.texte}" (0/N attendu, sans classe is-done)`,
        /Objectif\s*:\s*0\s*\/\s*\d+/.test(initial.texte) && !initial.done, initial.texte);
    check('etat-6', 'objectif partiel : compteur 1/N affiché, pas de bonus accordé',
        /Objectif\s*:\s*1\s*\/\s*\d+/.test(partiel.texte) && !partiel.done, partiel.texte);
    check('etat-7', 'objectif atteint : texte + pastille is-done',
        /Objectif atteint/.test(atteint.texte) && atteint.done === true, atteint);
    check('etat-8', 'objectif atteint : exactement 1 toast (aucun doublon)',
        atteint.toasts.length === 1, atteint.toasts);
    check('etat-9', 'objectif atteint : le toast mentionne le bonus réel',
        (atteint.toasts[0] || '').includes('+25 XP'), atteint.toasts);
    check('etat-10', 'aucun toast parasite pendant la progression partielle',
        partiel.toasts.length === 0 && initial.toasts.length === 0, { initial: initial.toasts, partiel: partiel.toasts });
    check('etat-11', 're-rendu après atteinte : pas de nouveau toast (feedback non répétable)',
        rerendu.toasts.length === 1, rerendu.toasts);
    check('etat-12', 'info d\'atteinte aussi disponible sans couleur (title)',
        /bonus obtenu/i.test(atteint.title || ''), atteint.title);

    // 3) Streak : 0 sans journée complète, puis ≥1 après une journée complète.
    //    Note : le planificateur ne crée pas de jours passés (hier = 'no-plan'),
    //    la journée de référence est donc aujourd'hui.
    const streak = await c.ev(`(() => {
        const today = Planning.toStr(new Date());
        State.reset();
        State.update({
            config: { dateDebut: today, heuresSoir: 3, heuresWeekend: 6, dureeSession: 1, joursBlockes: [], joursLibres: [] },
            modules: [{ id: 'm1', nom: 'Streak', etoiles: 3, chapitres: 2, dateExam: '2026-12-20', sessionsValidees: 0, couleur: '#10B981' }]
        });
        State.planifier();
        DashboardView.rendreAujourdHui(State.get());
        const avant = State.get().stats.streak;
        const jt = State.get().plan.find(j => j.date === today);
        const nbSessions = jt ? jt.sessions.length : 0;
        const statutAvant = jt ? Planning.statutJour(State.get().plan, today, today) : null;
        if (jt) for (const s of jt.sessions) State.validerSession(s.moduleId, today, s.id);
        const plan = State.get().plan;
        DashboardView.rendreAujourdHui(State.get());
        const pill = document.getElementById('stat-streak-pill') || document.querySelector('.subtext-pill.streak-pill');
        return {
            avant, nbSessions, statutAvant,
            statutApres: Planning.statutJour(plan, today, today),
            apres: State.get().stats.streak,
            recordCalcule: Planning.calculerRecordStreak(plan, today),
            pillText: pill ? pill.textContent.trim() : null,
            pillClasses: pill ? pill.className : null
        };
    })()`);
    if (mesure('etat-13', 'streak', streak)) {
        check('etat-13', `streak = 0 sans journée complète (statut "${streak.statutAvant}"), puis = ${streak.apres} après ${streak.nbSessions}/${streak.nbSessions} sessions`,
            streak.avant === 0 && streak.statutApres === 'completed' && streak.apres >= 1, streak);
        check('etat-13b', 'record dérivé cohérent (>= streak courante)',
            streak.recordCalcule >= streak.apres, { record: streak.recordCalcule, streak: streak.apres });
    }
    check('etat-14', 'streak : pastille rendue avec un libellé non vide', !!streak.pillText, streak.pillText);

    // 4) Anomalies visuelles génériques : animations infinies + NaN.
    //    Exception documentée : .col-status-dot.pulse marque la session EN COURS
    //    (indicateur "live" de 8px, volontaire, neutralisé par prefers-reduced-motion).
    const sain = await c.ev(`(() => {
        DashboardView.rendreAujourdHui(State.get());
        const infinis = [];
        for (const el of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(el);
            if (cs.animationName !== 'none' && cs.animationIterationCount.includes('infinite')) {
                infinis.push(el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : ''));
            }
        }
        const uniques = [...new Set(infinis)];
        const whitelist = uniques.filter(x => x === 'span.col-status-dot');
        return {
            infinis: uniques.slice(0, 10),
            autres: uniques.filter(x => x !== 'span.col-status-dot'),
            indicateursSession: whitelist.length,
            enCours: [...document.querySelectorAll('.col-status-dot')].length,
            texteNa: /undefined|NaN/.test(document.body.innerText)
        };
    })()`);
    check('etat-15', 'aucune animation infinie hors indicateur de session en cours',
        sain.autres.length === 0, { autres: sain.autres, infinis: sain.infinis });
    check('etat-15b', 'indicateur de session limité à la session en cours (pas de pulsation généralisée)',
        sain.indicateursSession <= 1, sain);
    // L'indicateur doit disparaître sous prefers-reduced-motion.
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await new Promise(r => setTimeout(r, 300));
    const reduit = await c.ev(`[...document.querySelectorAll('body *')].filter(el => {
        const cs = getComputedStyle(el);
        return cs.animationName !== 'none' && cs.animationIterationCount.includes('infinite') && parseFloat(cs.animationDuration) > 0.05;
    }).length`);
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await new Promise(r => setTimeout(r, 200));
    check('etat-15c', 'sous prefers-reduced-motion : plus aucune animation infinie', reduit === 0, { restants: reduit });
    check('etat-16', 'aucun "undefined" / "NaN" visible après progression complète', sain.texteNa === false);

    // 5) Déterminisme : calculerXP idempotent + re-rendu sans effet de bord
    const determ = await c.ev(`(() => {
        const a = Planning.calculerXP(State.get().plan, Planning.toStr(new Date()));
        const b = Planning.calculerXP(State.get().plan, Planning.toStr(new Date()));
        const p1 = document.getElementById('stat-xp-pill').textContent;
        DashboardView.rendreAujourdHui(State.get());
        DashboardView.rendreAujourdHui(State.get());
        const p2 = document.getElementById('stat-xp-pill').textContent;
        return { identique: JSON.stringify(a) === JSON.stringify(b), champs: Object.keys(a).sort(), pillStable: p1 === p2, p1, p2 };
    })()`);
    check('etat-17', 'calculerXP déterministe (2 appels identiques)', determ.identique === true, determ);
    check('etat-18', 'calculerXP renvoie les 4 champs V3.4',
        JSON.stringify(determ.champs) === JSON.stringify(['objectifsAtteints', 'xpAujourdhui', 'xpObjectifsQuotidiens', 'xpTotal']), determ.champs);
    check('etat-19', 're-rendu multiple sans effet de bord (pastille XP stable)', determ.pillStable === true, determ);

    // 6) Persistance réelle (F5) : aucun double comptage après rechargement.
    //    On re-sème un état "objectif atteint" pour que la mesure ne dépende pas
    //    des sections précédentes (le bloc streak a remplacé l'état).
    const avantF5 = await c.ev(`(() => {
        const today = Planning.toStr(new Date());
        State.reset();
        State.update({
            config: { dateDebut: today, heuresSoir: 3, heuresWeekend: 6, dureeSession: 1, joursBlockes: [], joursLibres: [] },
            modules: [{ id: 'm1', nom: 'Persistance', etoiles: 3, chapitres: 3, dateExam: '2026-12-15', sessionsValidees: 0, couleur: '#4F46E5' }]
        });
        State.planifier();
        const jt = State.get().plan.find(j => j.date === today);
        for (const s of jt.sessions) State.validerSession(s.moduleId, today, s.id);
        DashboardView.rendreAujourdHui(State.get());
        const s = State.get();
        return { xp: s.stats.xpAujourdhui, total: s.stats.xpTotal, obj: s.stats.xpObjectifsQuotidiens,
                 pillGoal: document.getElementById('stat-goal-pill')?.textContent,
                 done: document.getElementById('stat-goal-pill')?.classList.contains('is-done') };
    })()`);
    await c.send('Page.reload');
    await new Promise(r => setTimeout(r, 1800));
    const apresF5 = await c.ev(`(() => {
        const s = State.get();
        return {
            xp: s.stats.xpAujourdhui, total: s.stats.xpTotal, obj: s.stats.xpObjectifsQuotidiens,
            pillXp: document.getElementById('stat-xp-pill')?.textContent,
            pillGoal: document.getElementById('stat-goal-pill')?.textContent,
            pillGoalDone: document.getElementById('stat-goal-pill')?.classList.contains('is-done'),
            toasts: (() => { const c = document.getElementById('toast-container'); return c ? c.children.length : -1; })()
        };
    })()`);
    check('etat-20', 'F5 : XP identiques (pas de double comptage)',
        apresF5.xp === avantF5.xp && apresF5.total === avantF5.total && apresF5.obj === avantF5.obj,
        { avantF5, apresF5 });
    check('etat-21', 'F5 : aucun toast intempestif au rechargement (#toast-container vide)',
        apresF5.toasts === 0, apresF5);
    check('etat-22', 'F5 : objectif toujours signalé comme atteint (info conservée sans toast)',
        apresF5.pillGoalDone === true && /Objectif atteint/.test(apresF5.pillGoal || ''), apresF5.pillGoal);
}

// --- Section : accessibilité (noms, labels, focus, tailles, modales) ---
async function auditerAccessibilite(c, nom) {
    titre(`ACCESSIBILITÉ — ${nom}`);
    const res = await c.ev(`(() => {
        const visible = (el) => {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };
        const interactifs = [...document.querySelectorAll('button, a[href], input, select, textarea, [tabindex], [role="button"]')].filter(visible);
        const sansNom = [];
        for (const el of interactifs) {
            if (['INPUT','SELECT','TEXTAREA'].includes(el.tagName)) {
                const lab = el.id ? document.querySelector('label[for="' + el.id + '"]') : null;
                const nomme = el.getAttribute('aria-label') || lab || el.closest('label') || el.getAttribute('title');
                if (!nomme && el.type !== 'hidden') sansNom.push({ sel: el.tagName.toLowerCase() + '#' + (el.id || '(sans id)'), type: el.type || '' });
                continue;
            }
            const nom = (el.getAttribute('aria-label') || el.innerText || el.textContent || el.getAttribute('title') || '').trim();
            if (!nom) sansNom.push({ sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : ''), type: 'sans texte' });
        }
        const tropPetit = [];
        for (const el of document.querySelectorAll('body *')) {
            if (!visible(el)) continue;
            const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('').trim();
            if (!txt) continue;
            const px = parseFloat(getComputedStyle(el).fontSize);
            if (px < 11) tropPetit.push({ sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : ''), px, texte: txt.slice(0, 30), dansMaquette: !!el.closest('.preview-frame') });
        }
        const imgSansAlt = [...document.querySelectorAll('img')].filter(visible).filter(i => !i.hasAttribute('alt')).length;
        // Modales : on inspecte AUSSI les modales masquées (sinon le test ne vérifie rien).
        const modales = [...document.querySelectorAll('.modal-backdrop, [role="dialog"], dialog')]
            .map(m => ({
                sel: '#' + (m.id || '(sans id)'),
                role: m.getAttribute('role') || null,
                ariaModal: m.getAttribute('aria-modal') || null,
                labelled: !!(m.getAttribute('aria-label') || m.getAttribute('aria-labelledby')),
                cachee: m.classList.contains('hidden')
            }));
        return {
            nbInteractifs: interactifs.length, sansNom,
            tropPetit: tropPetit.slice(0, 8), imgSansAlt, modales,
            focusVisibleStyle: (() => [...document.styleSheets].some(sh => { try { return [...sh.cssRules].some(r => r.selectorText && r.selectorText.includes(':focus-visible')); } catch (e) { return false; } }))()
        };
    })()`);

    if (!mesure(`a11y-${nom}`, `${nom} : inventaire accessibilité`, res)) return null;
    check(`a11y-${nom}-1`, `${nom} : nom accessible sur tous les interactifs (${res.nbInteractifs} testés)`, res.sansNom.length === 0, res.sansNom);
    // Texte < 11px : classification par élément (maquette décorative vs texte réel).
    const tropPetitReels = [];
    for (const t of res.tropPetit) {
        const id = `a11y-${nom}-2-${t.sel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
        const mesureTxt = `${t.sel} "${t.texte}" à ${t.px}px`;
        if (t.dansMaquette) classerNa(id, 'maquette', `${nom} : ${mesureTxt}`, `${t.px}px`);
        else { tropPetitReels.push(t); check(id, `${nom} : ${mesureTxt} (< 11px)`, false, t); }
    }
    check(`a11y-${nom}-2-global`, `${nom} : aucun texte fonctionnel < 11px (${res.tropPetit.length} détectés, ${tropPetitReels.length} hors maquette)`,
        tropPetitReels.length === 0, tropPetitReels);
    check(`a11y-${nom}-3`, `${nom} : images sans attribut alt = 0`, res.imgSansAlt === 0, { imgSansAlt: res.imgSansAlt });
    check(`a11y-${nom}-4`, `${nom} : règle :focus-visible présente`, res.focusVisibleStyle === true);
    check(`a11y-${nom}-5`, `${nom} : modales déclarées (role=dialog + aria-modal + titre)`,
        res.modales.length > 0 && res.modales.every(m => m.role === 'dialog' && m.ariaModal === 'true' && m.labelled) || res.modales.length === 0,
        res.modales);

    const clavier = await testerFocusClavier(c);
    check(`a11y-${nom}-6`, `${nom} : focus clavier réel (Tab) visible sur le 1er élément focusable`,
        clavier.visible === true, clavier);
    check(`a11y-${nom}-7`, `${nom} : au moins ${clavier.attendus} éléments atteignables au clavier`,
        clavier.nbFocusables >= clavier.attendus, { nbFocusables: clavier.nbFocusables });
    return res;
}

// Test de focus avec de VRAIES frappes clavier (nécessaire pour :focus-visible).
async function testerFocusClavier(c, maxTab = 6) {
    const attendus = await c.ev(`(() => {
        const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        return [...document.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(vis).length;
    })()`);
    await c.ev(`document.activeElement && document.activeElement.blur(); document.body.focus(); 'ok'`);
    await new Promise(r => setTimeout(r, 120));

    const piste = [];
    for (let i = 0; i < maxTab; i++) {
        await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: 'Tab', code: 'Tab', modifiers: 0 });
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
        await new Promise(r => setTimeout(r, 90));
        const etat = await c.ev(`(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const cs = getComputedStyle(el);
            const outline = (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none');
            const ombre = cs.boxShadow && cs.boxShadow !== 'none';
            return {
                sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : ''),
                texte: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 25),
                outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor,
                boxShadow: String(cs.boxShadow).slice(0, 50),
                indicateur: outline || ombre
            };
        })()`);
        if (etat) piste.push(etat);
    }
    const premier = piste[0];
    return { nbFocusables: attendus, attendus: attendus >= 3 ? 3 : attendus, piste, visible: !!premier && premier.indicateur === true, premier };
}


// --- Section : modales (contraste light/dark + fermeture Escape réelle) ---
async function auditerModales(c) {
    titre('MODALES (contraste light/dark + Escape)');
    const prep = await c.ev(`(() => {
        const today = Planning.toStr(new Date());
        State.reset();
        State.update({
            config: { dateDebut: today, heuresSoir: 3, heuresWeekend: 6, dureeSession: 1, joursBlockes: [], joursLibres: [] },
            modules: [{ id: 'm1', nom: 'Modale Audit', etoiles: 3, chapitres: 3, dateExam: '2026-12-15', sessionsValidees: 0, couleur: '#4F46E5' }]
        });
        State.planifier();
        const jt = State.get().plan.find(j => j.date === today);
        const s = jt.sessions[0];
        DashboardView.rendreAujourdHui(State.get());
        Dashboard.ouvrirBilanModal(today, s.moduleId, s.id, 'Modale Audit', true);
        const m = document.getElementById('modal-bilan');
        return {
            ouvert: !!m && !m.classList.contains('hidden'),
            role: m ? m.getAttribute('role') : null,
            ariaModal: m ? m.getAttribute('aria-modal') : null,
            labelled: m ? !!m.getAttribute('aria-labelledby') : false,
            texte: m ? m.innerText.replace(/\\s+/g, ' ').slice(0, 90) : null
        };
    })()`);
    if (!mesure('modale-1', 'ouverture de la modale de bilan', prep)) return;
    check('modale-1', 'modale de bilan : s\'ouvre et contient son titre', prep.ouvert === true && /Session terminée/.test(prep.texte || ''), prep);

    for (const theme of ['light', 'dark']) {
        await c.ev(`document.documentElement.setAttribute('data-theme', '${theme}')`);
        await new Promise(r => setTimeout(r, 700));
        const r = await c.ev(`${CODE_CONTRASTE}('${theme}')`);
        if (!mesure(`modale-contraste-${theme}`, `contraste modale ${theme}`, r)) continue;
        const nonClassee = [];
        for (const p of r.problemes) {
            const id = `modale-contraste-${theme}-${p.sel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
            const mesureTxt = `${p.sel} "${p.texte}" = ${p.ratio}:1 (seuil ${p.seuil}, ${p.taille}px)`;
            const cas = casDeLElement(p);
            if (cas) classerNa(id, cas, `modale ${theme} : ${mesureTxt}`, `${p.ratio}:1`);
            else { nonClassee.push(p); check(id, `modale ${theme} : ${mesureTxt}`, false, p); }
        }
        check(`modale-contraste-${theme}-global`, `modale ${theme} : ${r.total} paires évaluées, ${r.problemes.length} sous le seuil, ${nonClassee.length} non classifiées (0 attendu)`,
            nonClassee.length === 0, nonClassee);
    }
    await c.ev(`document.documentElement.setAttribute('data-theme', 'light')`);
    await new Promise(r => setTimeout(r, 300));

    // Fermeture par Échap (vraie frappe clavier)
    await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
    await new Promise(r => setTimeout(r, 400));
    const etat = await c.ev(`(() => {
        const m = document.getElementById('modal-bilan');
        return {
            fermee: m.classList.contains('hidden'),
            listenersResiduels: document.body.onkeydown ? 1 : 0,
            focus: document.activeElement ? document.activeElement.tagName : null
        };
    })()`);
    check('modale-2', 'Échap ferme la modale de bilan', etat.fermee === true, etat);
    // Réouverture puis fermeture par le bouton, pour vérifier l'absence de fuite de listener.
    const fuite = await c.ev(`(() => {
        const today = Planning.toStr(new Date());
        const jt = State.get().plan.find(j => j.date === today);
        const s = jt.sessions[0];
        for (let i = 0; i < 3; i++) {
            Dashboard.ouvrirBilanModal(today, s.moduleId, s.id, 'Modale Audit', true);
            Dashboard.fermerBilanModal(false);
        }
        return { xpInchange: State.get().stats.xpAujourdhui === 0 };
    })()`);
    check('modale-3', 'ouverture/fermeture répétée sans effet de bord (pas de double comptage XP)', fuite.xpInchange === true, fuite);
}

// --- Section : vérification des octets réellement servis (indépendant du cache navigateur) ---
function get(chemin) {
    return new Promise((res) => {
        http.get(`${BASE}${chemin}`, r => {
            let d = '';
            r.on('data', c => d += c);
            r.on('end', () => res({ code: r.statusCode, corps: d }));
        }).on('error', (e) => res({ code: 0, corps: '', erreur: e.message }));
    });
}

async function verifierFichiersServis() {
    titre('FICHIERS RÉELLEMENT SERVIS (HTTP, hors cache navigateur)');
    const attendus = [
        ['/favicon.svg', '<svg', 'favicon créé et servi'],
        ['/index.html', 'favicon.svg?v=7', 'favicon déclaré (racine)'],
        ['/core/variables.css', '--color-primary-strong', 'token --color-primary-strong défini'],
        ['/core/variables.css', '--indigo-300: #A5B4FC', 'primitive --indigo-300 ajoutée'],
        ['/components/dashboard/dashboard.css', '.streak-lab {\n    font-size: var(--text-3xs);\n    font-weight: 600;\n    color: var(--text-secondary);', 'streak-lab : contraste corrigé'],
        ['/components/dashboard/dashboard.css', 'color: var(--color-primary-strong);', 'col-tag-live/brand-badge : token fort'],
        ['/components/dashboard/dashboard.html', 'aria-labelledby="modal-note-titre"', 'modale note : role=dialog'],
        ['/components/dashboard/dashboard.html', 'id="modal-edit-title"', 'modale examen : titre référençable'],
        ['/components/wizard/wizard.html', 'for="f-pays"', 'wizard : label associé au pays'],
        ['/components/wizard/wizard.html', 'for="f-debut"', 'wizard : label associé à la date'],
        ['/core/variables.css', '--neutral-600: #6B6B75', 'V3.5b : primitive --neutral-600 ajoutée'],
        ['/core/variables.css', '--text-secondary: var(--neutral-600)', 'V3.5b : --text-secondary clair corrigé'],
        ['/components/dashboard/dashboard.css', '[data-theme="dark"] .btn-save-primary', 'V3.5b : boutons primaires dark corrigés'],
        ['/components/dashboard/dashboard.js', "if (!noteOuverte && !editOuverte) return;", 'V3.5b : Échap sur les 2 modales']
    ];
    // Contrôles inversés : le motif ne doit PLUS être présent.
    const interdits = [
        ['/README.md', 'filter/', 'README : plus aucune reference au dossier filter/']
    ];
    for (let i = 0; i < attendus.length; i++) {
        const [chemin, motif, libelle] = attendus[i];
        const r = await get(chemin);
        const corps = r.corps.replace(/\r\n/g, '\n');
        check(`fichier-${i + 1}`, `${libelle} (${chemin} → HTTP ${r.code})`,
            r.code === 200 && corps.includes(motif), { code: r.code, motifNonTrouve: motif.slice(0, 60), erreur: r.erreur });
    }
    for (let i = 0; i < interdits.length; i++) {
        const [chemin, motif, libelle] = interdits[i];
        const r = await get(chemin);
        check(`interdit-${i + 1}`, `${libelle} (${chemin} → HTTP ${r.code})`,
            r.code === 200 && !r.corps.includes(motif), { code: r.code, encorePresent: motif });
    }
}

// --- Section : Pomodoro (arrêt / démarré / en pause / terminé) ---
async function auditerPomodoro(c) {
    titre('POMODORO (arrêté → démarré → pause → terminé)');
    // Les toasts sont des <div> sans classe (styles inline) dans #toast-container.
    // On enregistre en plus chaque appel à UI.toast pour ne pas dépendre du délai d'affichage.
    await c.ev(`(() => {
        window.__pomoToasts = [];
        if (!window.__uiToastHooked) {
            window.__uiToastHooked = true;
            const orig = UI.toast;
            UI.toast = function (...a) { window.__pomoToasts.push(String(a[0])); return orig.apply(this, a); };
        }
        return true;
    })()`);
    const lire = `(() => {
        const b = document.getElementById('btn-focus-timer-toggle');
        const d = document.getElementById('focus-timer-digits');
        const conteneur = document.getElementById('toast-container');
        return {
            label: b ? (b.querySelector('span') || b).textContent.trim() : null,
            digits: d ? d.textContent.trim() : null,
            title: document.title,
            toastsDom: conteneur ? [...conteneur.children].map(t => t.textContent.trim()) : [],
            toasts: window.__pomoToasts || [],
            sessions: (document.getElementById('pomo-sess-count') || {}).textContent || null
        };
    })()`;

    await c.ev(`Pomodoro.reset(); 'ok'`);
    await new Promise(r => setTimeout(r, 300));
    const init = await c.ev(lire);
    check('pomo-1', `arrêté : libellé "Démarrer" et chrono affiché (${init.digits})`,
        init.label === 'Démarrer' && /^\d{2}:\d{2}$/.test(init.digits || ''), init);

    await c.ev(`Pomodoro.toggle(); 'ok'`);
    await new Promise(r => setTimeout(r, 1400));
    const running = await c.ev(lire);
    check('pomo-2', `démarré : libellé "Pause" + onglet "(mm:ss) RevisionFlow" (${running.title})`,
        running.label === 'Pause' && /^\(\d{2}:\d{2}\) RevisionFlow$/.test(running.title || ''), running);
    check('pomo-3', `le chrono décompte réellement (${init.digits} → ${running.digits})`,
        running.digits !== init.digits && /^\d{2}:\d{2}$/.test(running.digits || ''),
        { avant: init.digits, apres: running.digits });

    await c.ev(`Pomodoro.toggle(); 'ok'`);
    await new Promise(r => setTimeout(r, 300));
    const paused = await c.ev(lire);
    await new Promise(r => setTimeout(r, 1200));
    const paused2 = await c.ev(lire);
    check('pomo-4', 'en pause : libellé "Démarrer" + titre normal',
        paused.label === 'Démarrer' && paused.title === 'RevisionFlow — Dashboard', paused);
    check('pomo-5', 'en pause : le chrono est gelé (aucune fuite de timer)', paused.digits === paused2.digits,
        { avant: paused.digits, apres: paused2.digits });

    await c.ev(`Pomodoro.reset(); 'ok'`);
    await new Promise(r => setTimeout(r, 300));
    const apresReset = await c.ev(lire);
    check('pomo-6', `reset : chrono revenu à la durée de base (${apresReset.digits})`,
        apresReset.digits === init.digits && apresReset.label === 'Démarrer', { init: init.digits, reset: apresReset.digits });

    // Fin de session réelle : 1 minute, on attend la fin.
    await c.ev(`Pomodoro.setDuree(1); 'ok'`);
    await c.ev(`Pomodoro.toggle(); 'ok'`);
    console.log('      (attente de la fin réelle d\'une session Pomodoro de 1 min…)');
    await new Promise(r => setTimeout(r, 63000));
    const fin = await c.ev(lire);
    await new Promise(r => setTimeout(r, 1500));
    const fin2 = await c.ev(lire);
    check('pomo-7', 'session terminée : message de fin de session émis',
        fin.toasts.some(t => /termin/i.test(t)), { emissions: fin.toasts, dom: fin.toastsDom });
    check('pomo-8', 'session terminée : le timer est arrêté (chrono figé)',
        fin.digits === fin2.digits && fin.label === 'Démarrer', { fin: fin.digits, fin2: fin2.digits, label: fin.label });
    check('pomo-9', 'session terminée : compteur de sessions incrémenté de 1',
        apresReset.sessions !== null && fin.sessions === String(parseInt(apresReset.sessions, 10) + 1),
        { avant: apresReset.sessions, apres: fin.sessions });
    await c.ev(`Pomodoro.reset(); Pomodoro.setDuree(25); 'ok'`);
}

// --- Section : validation de formulaire du Wizard ---
async function auditerWizard(c) {
    titre('WIZARD (validation de formulaire)');
    await naviguer(c, `${BASE}/components/wizard/wizard.html`, 1600);
    await c.ev(`(() => {
        window.__wizToasts = [];
        if (!window.__uiToastHookedWiz) {
            window.__uiToastHookedWiz = true;
            const orig = UI.toast;
            UI.toast = function (...a) { window.__wizToasts.push(String(a[0])); return orig.apply(this, a); };
        }
        return true;
    })()`);
    const r = await c.ev(`(() => {
        const etapeActive = () => [...document.querySelectorAll('.wiz-step-item')].findIndex(e => e.classList.contains('active')) + 1;
        const avant = etapeActive();
        Wizard.suivant(1);
        const apres = etapeActive();
        return { avant, apres, toasts: window.__wizToasts.slice() };
    })()`);
    if (!mesure('wizard-1', 'validation étape 1', r)) return;
    check('wizard-1', 'étape 1 sans profil : message d\'erreur explicite',
        r.toasts.some(t => /Choisis ton type de profil|Indique la date/.test(t)), r.toasts);
    check('wizard-2', 'étape 1 invalide : le wizard ne passe PAS à l\'étape suivante',
        r.avant === r.apres, { avant: r.avant, apres: r.apres });

    const r2 = await c.ev(`(() => {
        window.__wizToasts.length = 0;
        Wizard.suivant(2);
        return { toasts: window.__wizToasts.slice() };
    })()`);
    check('wizard-3', 'étape 2 sans module : message d\'erreur explicite',
        r2.toasts.some(t => /Ajoute au moins un module|n'a pas de nom|Indique la date d'examen/.test(t)), r2.toasts);
}

// --- Section : History (état vide / archive présente) ---
async function auditerHistory(c) {
    titre('HISTORY (aucun historique / archive présente)');

    await naviguer(c, `${BASE}/history/index.html`, 1200);
    await c.ev(`State.reset(); 'ok'`);
    await c.send('Page.reload');
    await new Promise(r => setTimeout(r, 1500));
    const vide = await c.ev(`(() => {
        const e = document.getElementById('hist-empty');
        const l = document.getElementById('hist-liste');
        return {
            visible: !!e && !e.classList.contains('hidden'),
            texte: e ? e.innerText.replace(/\\s+/g, ' ').trim().slice(0, 120) : null,
            cartes: l ? l.children.length : -1
        };
    })()`);
    if (!mesure('hist-1', 'état vide historique', vide)) return;
    check('hist-1', 'aucun historique : message d\'état vide explicite',
        vide.visible === true && /Aucun historique/i.test(vide.texte || ''), vide);
    check('hist-2', 'aucun historique : aucune carte fantôme', vide.cartes === 0, vide);

    const avec = await c.ev(`(() => {
        const today = Planning.toStr(new Date());
        State.update({
            config: { dateDebut: today, heuresSoir: 3, heuresWeekend: 6, dureeSession: 1, joursBlockes: [], joursLibres: [] },
            modules: [{ id: 'm1', nom: 'Archive Test', etoiles: 3, chapitres: 2, dateExam: '2026-12-15', sessionsValidees: 0, couleur: '#4F46E5' }]
        });
        State.planifier();
        State.archiverPlanning();
        return { nb: State.get().historique.length };
    })()`);
    await c.send('Page.reload');
    await new Promise(r => setTimeout(r, 1500));
    const rempli = await c.ev(`(() => {
        const e = document.getElementById('hist-empty');
        const l = document.getElementById('hist-liste');
        return {
            videCache: !!e && e.classList.contains('hidden'),
            cartes: l ? l.children.length : -1,
            pct: l && l.firstElementChild ? l.querySelector('.hist-card-pct')?.textContent.trim() : null
        };
    })()`);
    check('hist-3', `archive présente : ${rempli.cartes} carte(s) affichée(s) et état vide masqué`,
        avec.nb >= 1 && rempli.cartes >= 1 && rempli.videCache === true, { archive: avec, rendu: rempli });
    check('hist-4', 'carte d\'archive : pourcentage de complétion affiché', /^\d+%$/.test(rempli.pct || ''), rempli.pct);
}

// --- Section : touche Échap sur les 3 modales (V3.5b) ---
async function appuyerEchap(c) {
    await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape' });
    await new Promise(r => setTimeout(r, 320));
}
const ETAT_MODALES = `(() => ({
    bilan: !document.getElementById('modal-bilan').classList.contains('hidden'),
    note:  !document.getElementById('modal-note').classList.contains('hidden'),
    edit:  !document.getElementById('modal-edit-exam').classList.contains('hidden')
}))()`;

async function auditerEchapModales(c) {
    titre('TOUCHE ÉCHAP (3 modales + non-régression)');

    // 1) Aucune modale ouverte : Échap ne doit rien faire.
    const avant = await c.ev(ETAT_MODALES);
    await appuyerEchap(c);
    const apres = await c.ev(ETAT_MODALES);
    check('echap-1', 'aucune modale ouverte : Échap n\'ouvre rien et ne referme rien',
        !apres.bilan && !apres.note && !apres.edit, { avant, apres });

    // 2) Modale de notes
    await c.ev(`(() => {
        const today = Planning.toStr(new Date());
        const jt = State.get().plan.find(j => j.date === today);
        const s = jt.sessions[0];
        Dashboard.ouvrirModalNote(s.moduleId, 'Module Test');
        return true;
    })()`);
    const noteOuverte = await c.ev(ETAT_MODALES);
    await appuyerEchap(c);
    const noteFermee = await c.ev(ETAT_MODALES);
    check('echap-2', 'modale de notes : Échap la ferme',
        noteOuverte.note === true && noteFermee.note === false, { ouvert: noteOuverte, ferme: noteFermee });
    check('echap-3', 'modale de notes : les autres modales restent fermées',
        noteFermee.bilan === false && noteFermee.edit === false, noteFermee);

    // 3) Modale d'édition de date d'examen
    await c.ev(`(() => {
        const today = Planning.toStr(new Date());
        const jt = State.get().plan.find(j => j.date === today);
        Dashboard.ouvrirEditDate(jt.sessions[0].moduleId);
        return true;
    })()`);
    const editOuverte = await c.ev(ETAT_MODALES);
    await appuyerEchap(c);
    const editFermee = await c.ev(ETAT_MODALES);
    check('echap-4', 'modale d\'examen : Échap la ferme',
        editOuverte.edit === true && editFermee.edit === false, { ouvert: editOuverte, ferme: editFermee });

    // 4) Non-régression : la modale de bilan se ferme toujours avec Échap
    await c.ev(`(() => {
        const today = Planning.toStr(new Date());
        const jt = State.get().plan.find(j => j.date === today);
        const s = jt.sessions[0];
        Dashboard.ouvrirBilanModal(today, s.moduleId, s.id, 'Module Test', true);
        return true;
    })()`);
    const bilanOuvert = await c.ev(ETAT_MODALES);
    await appuyerEchap(c);
    const bilanFermee = await c.ev(ETAT_MODALES);
    check('echap-5', 'non-régression : la modale de bilan se ferme toujours avec Échap',
        bilanOuvert.bilan === true && bilanFermee.bilan === false, { ouvert: bilanOuvert, ferme: bilanFermee });
    check('echap-6', 'non-régression : fermer le bilan ne touche pas les autres modales',
        bilanFermee.note === false && bilanFermee.edit === false, bilanFermee);

    // 5) Pas de double listener : ouvrir/fermer 3 fois de suite
    let cycles = true;
    const detail = [];
    for (let i = 0; i < 3; i++) {
        await c.ev(`(() => {
            const today = Planning.toStr(new Date());
            const jt = State.get().plan.find(j => j.date === today);
            Dashboard.ouvrirModalNote(jt.sessions[0].moduleId, 'Module Test');
            return true;
        })()`);
        await appuyerEchap(c);
        const e = await c.ev(ETAT_MODALES);
        detail.push(e);
        if (e.note !== false) cycles = false;
    }
    check('echap-7', 'pas de double listener : 3 ouvertures/fermetures consécutives cohérentes',
        cycles === true, detail);

    // 6) Échap sans modale ne doit pas interférer avec le Pomodoro
    await c.ev(`Pomodoro.reset(); 'ok'`);
    await c.ev(`Pomodoro.toggle(); 'ok'`);
    await new Promise(r => setTimeout(r, 1300));
    const pomoAvant = await c.ev(`({ label: (document.getElementById('btn-focus-timer-toggle').querySelector('span') || document.getElementById('btn-focus-timer-toggle')).textContent.trim(), title: document.title })`);
    await appuyerEchap(c);
    const pomoApres = await c.ev(`({ label: (document.getElementById('btn-focus-timer-toggle').querySelector('span') || document.getElementById('btn-focus-timer-toggle')).textContent.trim(), title: document.title })`);
    check('echap-8', 'Échap sans modale : le Pomodoro continue de tourner',
        pomoAvant.label === 'Pause' && pomoApres.label === 'Pause' && pomoAvant.title === pomoApres.title,
        { avant: pomoAvant, apres: pomoApres });
    await c.ev(`Pomodoro.reset(); 'ok'`);
}

// --- Section : champs d'état persisté sans consommateur (INFO) ---
// Lit l'état par défaut réel (puis le parcourt) et recherche chaque chemin
// d'objet dans TOUT le JS du projet, hors core/state.js.
// Un objet dont le chemin n'apparaît nulle part n'est pas un défaut runtime :
// c'est un vestige inerte, classé INFO (jamais FAIL, jamais N/A).
async function auditerEtatInerte(c) {
    titre('ÉTAT PERSISTÉ — objets sans consommateur (INFO)');
    const parDefaut = await c.ev(`(() => { State.reset(); return JSON.parse(JSON.stringify(State.get())); })()`);
    if (!mesure('etat-inerte', 'lecture de l’état par défaut', parDefaut)) return;

    const objets = [];
    (function parcourir(o, chemin) {
        for (const cle of Object.keys(o)) {
            const v = o[cle];
            const c = chemin ? `${chemin}.${cle}` : cle;
            if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) {
                objets.push(c);
                parcourir(v, c);
            }
        }
    })(parDefaut, '');

    const fichiersJs = listerJs();
    const srcState = fs.readFileSync(path.join(ROOT, 'core', 'state.js'), 'utf8');
    // Comparaison de chemin normalisée (séparateurs Windows gérés).
    const rel = f => path.relative(ROOT, f).split(path.sep).join('/');
    const autres = fichiersJs
        .filter(f => rel(f) !== 'core/state.js')
        .map(f => ({ f, txt: fs.readFileSync(f, 'utf8') }));

    for (const chemin of objets) {
        const fragments = chemin.split('.');
        const utilise = autres.some(({ txt }) => {
            // chemin complet (prefs.filtre) ou dernier fragment via un accesseur d'état
            if (txt.includes(chemin)) return true;
            const clef = fragments[fragments.length - 1];
            return new RegExp(`\\.${clef}\\b|getKey\\(\\s*['"\`]${clef}['"\`]\\]|\\[['"\`]${clef}['"\`]\\]`).test(txt);
        });
        const definiDansState = srcState.includes(chemin.split('.').slice(0, -1).join('.')) && srcState.includes(chemin.split('.').pop());
        if (!utilise && definiDansState) {
            classerInfo(`etat-inerte-${chemin.replace(/[^a-z0-9]+/gi, '-')}`,
                `champ d'état inerte : ${chemin} (défini dans core/state.js, jamais consommé)`,
                `Valeur par défaut : ${JSON.stringify(parDefaut[chemin.split('.')[0]]?.[chemin.split('.')[1]] ?? null)} — conservé tel quel, le schéma de stockage n'est pas modifié.`);
        }
    }
}

// --- Section : auto-test de falsification du harnais ------------------
// Preuve que la classification N/A ne peut PAS masquer un vrai défaut :
// on injecte des défauts délibérés sur des éléments FONCTIONNELS (modification
// en mémoire uniquement, aucun fichier touché) et on vérifie que le chemin
// réel de classification les détecte comme non classifiés (=> FAIL).
async function autoTesterHarnais(c) {
    titre('AUTO-TEST DU HARNAIS (falsification : la classification masque-t-elle un défaut ?)');

    // 1) Contraste : on rend illisible un titre de colonne fonctionnel.
    const contraste = await c.ev(`(() => {
        const el = document.querySelector('.col-title');
        if (!el) return { erreur: '.col-title introuvable' };
        el.dataset.styleAvant = el.getAttribute('style') || '';
        el.style.color = 'rgba(255,255,255,0.12)';
        return { injecte: true, sel: el.tagName.toLowerCase() + '.col-title' };
    })()`);
    await new Promise(r => setTimeout(r, 800));
    const r1 = await c.ev(`${CODE_CONTRASTE}('light')`);
    const p1 = mesurable(r1) ? r1.problemes.find(p => /col-title/.test(p.sel)) : null;
    check('falsif-1', 'défaut de contraste injecté sur un élément FONCTIONNEL : détecté',
        !!p1, { injecte: contraste, detecte: p1 });
    check('falsif-2', 'ce défaut n\'est PAS classé N/A (il reste un FAIL réel)',
        p1 ? casDeLElement(p1) === null : false, { sel: p1 && p1.sel, cas: p1 ? casDeLElement(p1) : 'absent' });
    check('falsif-3', 'le défaut injecté est bien hors maquette et hors marque',
        p1 ? p1.dansMaquette === false && p1.estMarque === false : false, p1);
    await c.ev(`(() => { const el = document.querySelector('.col-title'); el.style.color = ''; return true; })()`);

    // 2) Taille de texte : on force 8px sur un élément fonctionnel.
    const taille = await c.ev(`(() => {
        const el = document.querySelector('.col-counter');
        if (!el) return { erreur: '.col-counter introuvable' };
        el.style.fontSize = '8px';
        return { injecte: true };
    })()`);
    await new Promise(r => setTimeout(r, 500));
    const r2 = await c.ev(`(() => {
        const el = document.querySelector('.col-counter');
        const px = parseFloat(getComputedStyle(el).fontSize);
        return { px, dansMaquette: !!el.closest('.preview-frame') };
    })()`);
    check('falsif-4', 'défaut de taille injecté (8px) : mesuré comme < 11px',
        r2 && r2.px === 8, r2);
    check('falsif-5', 'ce défaut n\'est PAS classé maquette (il reste un FAIL réel)',
        r2 && r2.dansMaquette === false, r2);
    await c.ev(`(() => { const el = document.querySelector('.col-counter'); el.style.fontSize = ''; return true; })()`);
    await new Promise(r => setTimeout(r, 300));

    // 3) Après nettoyage, plus aucun défaut injecté ne doit subsister.
    const r3 = await c.ev(`${CODE_CONTRASTE}('light')`);
    const residuel = mesurable(r3) ? r3.problemes.filter(p => /col-title|col-counter/.test(p.sel)) : ['mesure impossible'];
    check('falsif-6', 'nettoyage : les défauts injectés ne subsistent plus',
        Array.isArray(residuel) && residuel.length === 0, residuel);
}

// --- Orchestration ---
async function principal() {
    console.log('==========================================================');
    console.log(' AUDIT RUNTIME V3.5 — Chrome réel (CDP)');
    console.log('==========================================================');
    const c = await connecter();

    // 1) Pages : métadonnées, réseau, console
    for (const p of PAGES) await auditerPage(c, p);

    // 2) Dashboard : contraste light/dark, responsive, mouvement, a11y, états
    await naviguer(c, `${BASE}/components/dashboard/dashboard.html`);
    await c.ev(`(() => {
        const today = Planning.toStr(new Date());
        State.reset();
        State.update({
            config: { dateDebut: today, heuresSoir: 3, heuresWeekend: 6, dureeSession: 1, joursBlockes: [], joursLibres: [] },
            modules: [
                { id: 'm1', nom: 'Analyse', etoiles: 3, chapitres: 3, dateExam: '2026-12-15', sessionsValidees: 0, couleur: '#4F46E5' },
                { id: 'm2', nom: 'Physique', etoiles: 4, chapitres: 2, dateExam: '2026-12-20', sessionsValidees: 0, couleur: '#10B981' }
            ]
        });
        State.planifier();
        DashboardView.rendreAujourdHui(State.get());
        return true;
    })()`);
    await new Promise(r => setTimeout(r, 400));

    titre('CONTRASTE (light + dark, aplatissement alpha)');
    for (const theme of ['light', 'dark']) {
        await c.ev(`document.documentElement.setAttribute('data-theme', '${theme}')`);
        await new Promise(r => setTimeout(r, 700));
        const r = await c.ev(`${CODE_CONTRASTE}('${theme}')`);
        if (!mesure(`contraste-${theme}`, `contraste ${theme}`, r)) continue;
        // Résolution INDÉPENDANTE par élément : la classification N/A repose
        // uniquement sur des faits structurels du DOM, jamais sur le ratio.
        const nonClassee = [];
        for (const p of r.problemes) {
            const id = `contraste-${theme}-${p.sel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
            const mesureTxt = `${p.sel} "${p.texte}" = ${p.ratio}:1 (seuil ${p.seuil}, ${p.taille}px)`;
            if (p.estMarque) classerNa(id, 'marque', `contraste ${theme} : ${mesureTxt}`, `${p.ratio}:1`);
            else if (p.dansMaquette) classerNa(id, 'maquette', `contraste ${theme} : ${mesureTxt}`, `${p.ratio}:1`);
            else {
                nonClassee.push(p);
                check(id, `contraste ${theme} : ${mesureTxt}`, false, p);
            }
        }
        check(`contraste-${theme}-global`, `${theme} : ${r.total} paires texte/fond évaluées, ${r.problemes.length} sous le seuil, ${nonClassee.length} non classifiées (0 attendu)`,
            nonClassee.length === 0, nonClassee);
    }
    await c.ev(`document.documentElement.setAttribute('data-theme', 'light')`);

    await auditerResponsive(c, 'dashboard');
    await auditerMouvementReduit(c, 'dashboard');
    await auditerAccessibilite(c, 'dashboard');
    await auditerEtatsDashboard(c);
    await auditerModales(c);
    await auditerEchapModales(c);
    // Doit tourner sur le dashboard (avant toute navigation) : c'est ici que la
    // classification N/A est mise à l'épreuve par injection de défauts réels.
    await autoTesterHarnais(c);

    // 3) Autres pages : responsive + a11y
    for (const nom of ['wizard', 'history', 'landing']) {
        const p = PAGES.find(x => x.nom === nom);
        await naviguer(c, p.url);
        await auditerResponsive(c, nom);
        await auditerAccessibilite(c, nom);
    }

    // 3b) États Pomodoro + validation Wizard (sur leurs pages)
    await naviguer(c, `${BASE}/components/dashboard/dashboard.html`);
    await c.ev(`(() => {
        const today = Planning.toStr(new Date());
        State.reset();
        State.update({
            config: { dateDebut: today, heuresSoir: 3, heuresWeekend: 6, dureeSession: 1, joursBlockes: [], joursLibres: [] },
            modules: [{ id: 'm1', nom: 'Pomodoro', etoiles: 3, chapitres: 2, dateExam: '2026-12-15', sessionsValidees: 0, couleur: '#4F46E5' }]
        });
        State.planifier();
        DashboardView.rendreAujourdHui(State.get());
        return true;
    })()`);
    await new Promise(r => setTimeout(r, 400));
    await auditerPomodoro(c);
    await auditerWizard(c);
    await auditerHistory(c);

    // 4) Octets réellement servis + état inerte + synthèse
    await auditerEtatInerte(c);
    await verifierFichiersServis();
    console.log('\n==========================================================');
    console.log(' RÉSULTAT GLOBAL');
    console.log('==========================================================');
    console.log(` PASS : ${ok}`);
    console.log(` FAIL : ${ko}`);
    console.log(` N/A  : ${NA.length}`);
    console.log(` INFO : ${INFO.length}`);
    console.log('----------------------------------------------------------');
    console.log(` Total assertions évaluées : ${ok + ko}  (+ ${NA.length} N/A + ${INFO.length} INFO)`);
    if (ko > 0) {
        console.log(`\n \u274C ECHECS REELS (${ko}) : ${echecs.join(', ')}`);
    } else {
        console.log('\n \u2705 0 FAIL réel : toutes les anomalies restantes sont classifiées N/A ou INFO.');
    }
    if (NA.length) {
        console.log('\n Exceptions N/A (liste fermée, documentées) :');
        for (const n of NA) console.log(`   - [${n.cas}] ${n.id} \u2014 ${n.libelle}`);
    }
    if (INFO.length) {
        console.log('\n Constats INFO :');
        for (const i of INFO) console.log(`   - ${i.id} \u2014 ${i.libelle}`);
    }
    console.log('==========================================================');
    c.fermer();
    process.exit(ko > 0 ? 1 : 0);
}

principal().catch(e => { console.error('FATAL:', e.message); process.exit(2); });



