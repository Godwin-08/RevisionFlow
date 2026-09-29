// ============================================================
// test-v34-goal.js — Suite V3.4 : Objectif quotidien (+25 XP)
// Métrique 100 % dérivée du plan historique — aucun stockage.
// Exécution : node scratch/test-v34-goal.js
// ============================================================

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RACINE = path.join(__dirname, '..');

// --- Chargement isolé de core/planning.js (module pur, sans DOM) ---
const srcPlanning = fs.readFileSync(path.join(RACINE, 'core', 'planning.js'), 'utf8');
const Planning = vm.runInNewContext(srcPlanning + '\n;Planning', { console });

let ok = 0, ko = 0;
const echecs = [];

function check(id, libelle, condition, details) {
    if (condition) {
        ok++;
        console.log(`  \u2705 ${id} \u2014 ${libelle}`);
    } else {
        ko++;
        echecs.push(id);
        console.log(`  \u274C ${id} \u2014 ${libelle}`);
        if (details !== undefined) console.log('      \u2192', JSON.stringify(details));
    }
}

// --- Fabriques de fixtures ---
let _seq = 0;
const S = (faite, extra = {}) => ({ id: `s${++_seq}`, faite, ...extra });
const J = (date, sessions) => ({ date, sessions });
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('==============================================');
console.log('  SUITE V3.4 \u2014 OBJECTIF QUOTIDIEN (+25 XP)');
console.log('==============================================\n');

// ─────────────────────────────────────────────
// A. Plan absent / vide → aucun objectif, aucun XP
// ─────────────────────────────────────────────
console.log('A. Plan vide ou invalide');
check('A1', 'barème exposé = 25 (source unique)',
    Planning.XP_OBJECTIF_QUOTIDIEN === 25, Planning.XP_OBJECTIF_QUOTIDIEN);
check('A2', 'estObjectifQuotidienAtteint([]) === false',
    Planning.estObjectifQuotidienAtteint([], '2026-09-28') === false);
check('A3', 'calculerXP([]) renvoie les 4 compteurs à 0',
    eq(Planning.calculerXP([]), { xpTotal: 0, xpAujourdhui: 0, xpObjectifsQuotidiens: 0, objectifsAtteints: 0 }),
    Planning.calculerXP([]));

// ─────────────────────────────────────────────
// B. Jour sans session = 'no-plan' → jamais un objectif
// ─────────────────────────────────────────────
console.log('\nB. Jour sans session (no-plan)');
const planB = [J('2026-09-28', [])];
check('B1', 'aucune session → objectif non atteint',
    Planning.estObjectifQuotidienAtteint(planB, '2026-09-28') === false);
check('B2', 'aucun bonus versé (ni total ni jour)',
    eq(Planning.calculerXP(planB, '2026-09-28'),
       { xpTotal: 0, xpAujourdhui: 0, xpObjectifsQuotidiens: 0, objectifsAtteints: 0 }),
    Planning.calculerXP(planB, '2026-09-28'));

// ─────────────────────────────────────────────
// C. Objectif minimal : 1 session prévue, terminée
// ─────────────────────────────────────────────
console.log('\nC. Objectif minimal (1/1)');
const planC = [J('2026-09-28', [S(true)])];
check('C1', 'objectif atteint', Planning.estObjectifQuotidienAtteint(planC, '2026-09-28') === true);
const resC = Planning.calculerXP(planC, '2026-09-28');
check('C2', 'xpAujourdhui = 10 (session) + 25 (bonus) = 35',
    resC.xpAujourdhui === 35, resC);
check('C3', 'bonus comptabilisé une fois',
    resC.xpObjectifsQuotidiens === 25 && resC.objectifsAtteints === 1, resC);

// ─────────────────────────────────────────────
// D. Jour incomplet (2/3) → aucun bonus
// ─────────────────────────────────────────────
console.log('\nD. Jour incomplet (2/3)');
const planD = [J('2026-09-28', [S(true), S(true), S(false)])];
check('D1', 'objectif non atteint',
    Planning.estObjectifQuotidienAtteint(planD, '2026-09-28') === false);
const resD = Planning.calculerXP(planD, '2026-09-28');
check('D2', 'xpAujourdhui = 20 (sessions seules, pas de bonus)',
    resD.xpAujourdhui === 20 && resD.xpObjectifsQuotidiens === 0, resD);

// ─────────────────────────────────────────────
// E. Jour complet (3/3) → bonus versé UNE seule fois
// ─────────────────────────────────────────────
console.log('\nE. Jour complet (3/3)');
const planE = [J('2026-09-28', [S(true), S(true), S(true)])];
check('E1', 'objectif atteint', Planning.estObjectifQuotidienAtteint(planE, '2026-09-28') === true);
const resE = Planning.calculerXP(planE, '2026-09-28');
check('E2', 'bonus unique : 30 + 25 = 55 (jamais 3 × 25)',
    resE.xpAujourdhui === 55 && resE.xpObjectifsQuotidiens === 25 && resE.objectifsAtteints === 1, resE);

// ─────────────────────────────────────────────
// F. Robustesse des entrées → booléen strict, zéro exception
// ─────────────────────────────────────────────
console.log('\nF. Entrées invalides (robustesse)');
const entreesInvalides = [null, undefined, 'plan', 42, {}, true];
check('F1', 'plan non-tableau → false, sans exception',
    entreesInvalides.every(p => Planning.estObjectifQuotidienAtteint(p, '2026-09-28') === false));
check('F2', 'date absente / vide → false',
    Planning.estObjectifQuotidienAtteint(planC, null) === false
    && Planning.estObjectifQuotidienAtteint(planC, '') === false
    && Planning.estObjectifQuotidienAtteint(planC) === false);
check('F3', 'date inconnue du plan → false',
    Planning.estObjectifQuotidienAtteint(planC, '2030-01-01') === false);
check('F4', 'entrées corrompues (null dans le plan) → false, sans exception',
    Planning.estObjectifQuotidienAtteint([null, undefined], '2026-09-28') === false
    && Planning.estObjectifQuotidienAtteint([{ date: '2026-09-28', sessions: null }], '2026-09-28') === false);
check('F5', 'retour strictement booléen',
    typeof Planning.estObjectifQuotidienAtteint(planC, '2026-09-28') === 'boolean'
    && typeof Planning.estObjectifQuotidienAtteint([], '2026-09-28') === 'boolean');

// ─────────────────────────────────────────────
// G. Session sans champ `faite` → non terminée
// ─────────────────────────────────────────────
console.log('\nG. Session sans champ faite');
check('G1', 'session sans `faite` → objectif non atteint',
    Planning.estObjectifQuotidienAtteint([J('2026-09-28', [{ id: 'x' }])], '2026-09-28') === false);
check('G2', 'une seule session non renseignée suffit à invalider',
    Planning.estObjectifQuotidienAtteint([J('2026-09-28', [S(true), { id: 'y' }])], '2026-09-28') === false);

// ─────────────────────────────────────────────
// H. `faite` hybride (coercition booléenne, jamais throw)
// ─────────────────────────────────────────────
console.log('\nH. Coercition de `faite`');
check('H1', 'faite: 1 → considérée terminée',
    Planning.estObjectifQuotidienAtteint([J('2026-09-28', [S(1)])], '2026-09-28') === true);
check('H2', 'faite: 0 / "" → non terminée',
    Planning.estObjectifQuotidienAtteint([J('2026-09-28', [S(0)])], '2026-09-28') === false
    && Planning.estObjectifQuotidienAtteint([J('2026-09-28', [S('')])], '2026-09-28') === false);

// ─────────────────────────────────────────────
// I. Cumul historique sur plusieurs jours
// ─────────────────────────────────────────────
console.log('\nI. Cumul historique (3 jours réussis / 1 échoué)');
const planHisto = [
    J('2026-09-25', [S(true), S(true, { bilan: { maitrise: 'moyen', note: '' } })]),          // complet  → 35 + 25
    J('2026-09-26', [S(true)]),                                                              // complet  → 10 + 25
    J('2026-09-27', [S(true), S(false)]),                                                    // incomplet → 10
    J('2026-09-28', [S(true), S(true, { bilan: { maitrise: 'facile', note: 'ok' } })])       // complet  → 40 + 25
];
const snapshotHisto = JSON.stringify(planHisto);
const resI = Planning.calculerXP(planHisto, '2026-09-28');
check('I1', '3 objectifs atteints sur 4 jours',
    resI.objectifsAtteints === 3, resI);
check('I2', 'xpObjectifsQuotidiens = 3 × 25 = 75',
    resI.xpObjectifsQuotidiens === 75, resI);
check('I3', 'xpTotal = 95 (sessions) + 75 (bonus) = 170',
    resI.xpTotal === 170, resI);
check('I4', 'plan non muté par le calcul (deep-compare)',
    JSON.stringify(planHisto) === snapshotHisto);
check('I5', 'aucun champ parasite ajouté aux jours/sessions',
    planHisto.every(j => eq(Object.keys(j).sort(), ['date', 'sessions'])
        && j.sessions.every(s => !('xp' in s) && !('bonus' in s) && !('objectif' in s))));

// ─────────────────────────────────────────────
// J. Idempotence + déterminisme (2 appels identiques)
// ─────────────────────────────────────────────
console.log('\nJ. Idempotence & déterminisme');
const resJ1 = Planning.calculerXP(planHisto, '2026-09-28');
const resJ2 = Planning.calculerXP(planHisto, '2026-09-28');
check('J1', 'deux appels consécutifs → résultat identique (pas de double comptage)',
    eq(resJ1, resJ2), { resJ1, resJ2 });
const planGele = Object.freeze(planHisto.map(j => Object.freeze({ date: j.date, sessions: Object.freeze(j.sessions.map(s => Object.freeze({ ...s }))) })));
let geleOk = true, geleErr = null;
try { Planning.calculerXP(planGele, '2026-09-28'); } catch (e) { geleOk = false; geleErr = e.message; }
check('J2', 'plan gelé (Object.freeze) → aucun throw (calcul pur)', geleOk, geleErr);

// ─────────────────────────────────────────────
// K. Le bonus du jour est adossé à `today`, le cumul non
// ─────────────────────────────────────────────
console.log('\nK. Indépendance du cumul vis-à-vis de `today`');
const resK1 = Planning.calculerXP(planHisto, '2026-09-27');
check('K1', 'xpObjectifsQuotidiens inchangé quel que soit `today`',
    resK1.xpObjectifsQuotidiens === 75 && resK1.objectifsAtteints === 3, resK1);
check('K2', 'jour incomplet → xpAujourdhui sans bonus (10)',
    resK1.xpAujourdhui === 10, resK1);
check('K3', 'jour sans entrée au plan → xpAujourdhui = 0, cumul intact',
    (() => { const r = Planning.calculerXP(planHisto, '2026-12-31');
             return r.xpAujourdhui === 0 && r.xpObjectifsQuotidiens === 75; })(),
    Planning.calculerXP(planHisto, '2026-12-31'));
check('K4', 'le bonus du jour reste compté une seule fois dans xpTotal',
    resI.xpTotal === 170 && Planning.calculerXP(planHisto, '2026-09-25').xpTotal === 170);

// ─────────────────────────────────────────────
// L. Propagation dans calculerStats (store → UI)
// ─────────────────────────────────────────────
console.log('\nL. Propagation dans calculerStats');
const dAuj = new Date();
const todayReel = Planning.toStr(dAuj);
const hierDate = new Date(); hierDate.setDate(hierDate.getDate() - 1);
const hierReel = Planning.toStr(hierDate);
const planStats = [J(hierReel, [S(true)]), J(todayReel, [S(true), S(false)])];
const st = Planning.calculerStats(planStats, [], []);
check('L1', 'xpObjectifsQuotidiens exposé (1 jour réussi × 25)',
    st.xpObjectifsQuotidiens === 25, st.xpObjectifsQuotidiens);
check('L2', 'objectifsAtteints exposé', st.objectifsAtteints === 1, st.objectifsAtteints);
check('L3', 'xpTotal = 20 (sessions) + 25 (bonus hier) = 45',
    st.xpTotal === 45, st.xpTotal);
check('L4', 'aujourd\'hui incomplet → xpAujourdhui sans bonus (10)',
    st.xpAujourdhui === 10, st.xpAujourdhui);
check('L5', 'cohérence stats ↔ calculerXP direct',
    st.xpObjectifsQuotidiens === Planning.calculerXP(planStats, todayReel).xpObjectifsQuotidiens
    && st.objectifsAtteints === Planning.calculerXP(planStats, todayReel).objectifsAtteints);

// ─────────────────────────────────────────────
// M. NON-RÉGRESSION V3.2 — barème de session inchangé
// ─────────────────────────────────────────────
console.log('\nM. Non-régression barème V3.2');
const bar = [
    S(true),                                                // 10
    S(true, { bilan: { maitrise: 'moyen', note: '' } }),     // 25
    S(true, { bilan: { maitrise: 'facile', note: 'x' } }),   // 30
    S(false),                                                // 0
    S(true, { bilan: { maitrise: 'zzz' } }),                  // 10 (niveau invalide)
    S(true, { bilan: { maitrise: 'moyen', note: '   ' } })   // 25 (note blanche)
];
const xpAttendus = [10, 25, 30, 0, 10, 25];
check('M1', 'barème 10 / 25 / 30 / 0 inchangé',
    bar.every((s, i) => Planning.calculerXPSession(s) === xpAttendus[i]),
    bar.map(s => Planning.calculerXPSession(s)));
check('M2', 'session non terminée avec bilan → 0 XP',
    Planning.calculerXPSession({ faite: false, bilan: { maitrise: 'facile', note: 'x' } }) === 0);
check('M3', 'session absente/null → 0 XP, sans exception',
    Planning.calculerXPSession(null) === 0 && Planning.calculerXPSession(undefined) === 0);
const resM = Planning.calculerXP([J(todayReel, bar)], todayReel);
check('M4', 'jour incomplet → xpTotal = 100 sans aucun bonus',
    resM.xpTotal === 100 && resM.xpAujourdhui === 100 && resM.xpObjectifsQuotidiens === 0, resM);

// ─────────────────────────────────────────────
// N. NON-RÉGRESSION V3.3 — streak / statuts inchangés
// ─────────────────────────────────────────────
console.log('\nN. Non-régression V3.3 streak');
const planStreak = [
    J('2026-09-25', [S(true)]),
    J('2026-09-26', [S(true)]),
    J('2026-09-27', [S(true), S(false)]),
    J('2026-09-28', [S(true)])
];
check('N1', 'calculerStreak inchangée (= 1 : today compté, J-1 échoué)',
    Planning.calculerStreak(planStreak, '2026-09-28') === 1,
    Planning.calculerStreak(planStreak, '2026-09-28'));
check('N2', 'calculerRecordStreak inchangé (= 2)',
    Planning.calculerRecordStreak(planStreak, '2026-09-28') === 2,
    Planning.calculerRecordStreak(planStreak, '2026-09-28'));
check('N3', 'estJourObjectifAtteint inchangé (V3.3)',
    Planning.estJourObjectifAtteint(planStreak, '2026-09-25', '2026-09-28') === true
    && Planning.estJourObjectifAtteint(planStreak, '2026-09-27', '2026-09-28') === false);
check('N4', 'V3.4 cohérent avec statutJour sur toutes les dates du plan',
    planStreak.every(j => Planning.estObjectifQuotidienAtteint(planStreak, j.date)
        === (Planning.statutJour(planStreak, j.date, '2026-09-28') === 'completed')));
const detN = Planning.calculerStreakDetail(planStreak, '2026-09-28');
check('N5', 'calculerStreakDetail : todayProgress / todayGoal inchangés',
    detN.todayProgress === 1 && detN.todayGoal === 1 && detN.todayCompleted === true, detN);
check('N6', 'calculerProgressionSemaine : 7 jours, inchangée',
    Planning.calculerProgressionSemaine(planStreak, '2026-09-28').length === 7);


// ─────────────────────────────────────────────
// O. CONTRAT DOM / CSS (vérification statique des fichiers)
// ─────────────────────────────────────────────
console.log('\nO. Contrat DOM / CSS');
const srcHtml  = fs.readFileSync(path.join(RACINE, 'components', 'dashboard', 'dashboard.html'), 'utf8');
const srcCss   = fs.readFileSync(path.join(RACINE, 'components', 'dashboard', 'dashboard.css'), 'utf8');
const srcView  = fs.readFileSync(path.join(RACINE, 'components', 'dashboard', 'dashboard-view.js'), 'utf8');

check('O1', 'pilule exposée : id + classe dans dashboard.html',
    /id="stat-goal-pill"/.test(srcHtml) && /class="[^"]*goal-pill[^"]*"[^>]*id="stat-goal-pill"/.test(srcHtml)
    || (/id="stat-goal-pill"/.test(srcHtml) && /class="subtext-pill goal-pill"/.test(srcHtml)));
const iPillStreak = srcHtml.indexOf('id="stat-streak-pill"');
const iPillGoal   = srcHtml.indexOf('id="stat-goal-pill"');
const iPillXp     = srcHtml.indexOf('id="stat-xp-pill"');
check('O2', 'position : entre la série et l\'XP (ordre du hero-subtext)',
    iPillStreak !== -1 && iPillStreak < iPillGoal && iPillGoal < iPillXp,
    { iPillStreak, iPillGoal, iPillXp });

const marqueurV34 = srcCss.indexOf('V3.4 OBJECTIF QUOTIDIEN');
const marqueurV33 = srcCss.indexOf('V3.3 STREAK');
const blocGoal = marqueurV34 !== -1 && marqueurV33 > marqueurV34
    ? srcCss.slice(marqueurV34, marqueurV33) : '';
check('O3', 'règles CSS V3.4 présentes (.goal-pill + .is-done)',
    /\.subtext-pill\.goal-pill\s*\{/.test(blocGoal) && /\.subtext-pill\.goal-pill\.is-done\s*\{/.test(blocGoal),
    blocGoal.length);
check('O4', 'tokens uniquement : aucun #hex ni rgb()/rgba() en dur',
    blocGoal.length > 0 && /var\(--/.test(blocGoal)
    && !/#[0-9a-fA-F]{3,8}\b/.test(blocGoal) && !/\brgba?\s*\(/.test(blocGoal));
check('O5', 'prefers-reduced-motion : animation neutralisée',
    /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.subtext-pill\.goal-pill/.test(srcCss));
check('O6', 'feedback déclenché sur la seule transition false → true',
    /_prevGoalReached === false && goalReached/.test(srcView));
check('O7', 'mémoire volatile initialisée à null (aucun toast au 1er rendu / F5)',
    /let _prevGoalReached = null;/.test(srcView));
check('O8', 'rendu via textContent (pas d\'innerHTML → pas d\'injection)',
    /statGoal\.textContent/.test(srcView) && !/statGoal\.innerHTML/.test(srcView));
check('O9', 'bonus affiché depuis la constante partagée, jamais un 25 codé en dur',
    (() => {
        const lignesAffichage = srcView.split(/\r?\n/)
            .filter(l => /statGoal\.(textContent|title)/.test(l) || /UI\.toast/.test(l));
        return lignesAffichage.length >= 4
            && lignesAffichage.every(l => !/\b25\b/.test(l))
            && /Planning\.XP_OBJECTIF_QUOTIDIEN/.test(srcView);
    })(),
    srcView.split(/\r?\n/).filter(l => /statGoal\.(textContent|title)/.test(l) || /UI\.toast/.test(l)));

// ─────────────────────────────────────────────
// P. ARCHITECTURE — aucun nouveau stockage, module pur
// ─────────────────────────────────────────────
console.log('\nP. Architecture : zéro stockage ajouté');
const srcStorage = fs.readFileSync(path.join(RACINE, 'core', 'storage.js'), 'utf8');
const srcState   = fs.readFileSync(path.join(RACINE, 'core', 'state.js'), 'utf8');
check('P1', 'planning.js reste pur (ni Storage, ni localStorage, ni DOM)',
    !/\blocalStorage\b|\bStorage\s*\.|\bdocument\s*[.[]|\bwindow\s*[.[]/.test(srcPlanning));
check('P2', 'storage.js : aucune nouvelle clé d\'objectif persistée',
    !/objectif/i.test(srcStorage) && !/\bgoal\b/i.test(srcStorage));
check('P3', 'state.js : stats initiales complétées (2 nouveaux compteurs dérivés)',
    /xpObjectifsQuotidiens: 0, objectifsAtteints: 0/.test(srcState));
const corpsCalculerXP = (() => {
    const i = srcPlanning.indexOf('calculerXP(plan, today) {');
    return i === -1 ? '' : srcPlanning.slice(i, srcPlanning.indexOf('\n        },', i));
})();
check('P4', 'calculerXP n\'embarque aucun montant littéral (barème centralisé)',
    corpsCalculerXP.length > 0 && /XP_OBJECTIF_QUOTIDIEN/.test(corpsCalculerXP)
    && !/\b25\b/.test(corpsCalculerXP));
check('P5', 'helper unique réutilisé par calculerXP (pas de duplication de la règle)',
    /estObjectifQuotidienAtteint\(plan, jour\.date\)/.test(corpsCalculerXP));

// ─────────────────────────────────────────────
// Q. THÈMES / RESPONSIVE / PERSISTANCE (statique)
// ─────────────────────────────────────────────
console.log('\nQ. Thèmes, responsive & persistance');
const srcVariables = fs.readFileSync(path.join(RACINE, 'core', 'variables.css'), 'utf8');
const blocDark = srcVariables.slice(srcVariables.indexOf('[data-theme="dark"] {'));
const tokensGoal = ['--color-success-soft', '--color-success-strong', '--text-secondary', '--surface-2'];
check('Q1', 'les 4 tokens de la pilule sont redéfinis en thème sombre',
    tokensGoal.every(t => new RegExp(`${t}\\s*:`).test(blocDark)),
    tokensGoal.filter(t => !new RegExp(`${t}\\s*:`).test(blocDark)));
check('Q2', 'hero-subtext autorise le retour à la ligne (5e pilule sans débordement)',
    /\.hero-subtext\s*\{[^}]*flex-wrap:\s*wrap/.test(srcCss));
check('Q3', 'aucune largeur/hauteur fixe introduite par la V3.4',
    blocGoal.length > 0 && !/\bwidth\s*:|\bheight\s*:|\bmin-width\s*:/.test(blocGoal));
check('Q4', 'le bloc mobile réduit déjà la taille des pilules (.subtext-pill héritée)',
    /\.hero-subtext\s*\{[^}]*font-size:\s*var\(--text-2xs\)/.test(srcCss));
check('Q5', 'persistance : le bonus est recalculé depuis le plan (aucun champ stocké)',
    /_recalculerStats/.test(srcState) || /Planning\.calculerStats/.test(srcState));
check('Q6', 'F5 : aucun toast au rechargement (_prevGoalReached = null au boot)',
    /let _prevGoalReached = null;/.test(srcView)
    && (srcView.match(/_prevGoalReached = /g) || []).length === 2,
    (srcView.match(/_prevGoalReached = /g) || []).length);


// Cache-busting (convention V3.1a) : pages référençant un fichier touché
const pages = {
    'components/dashboard/dashboard.html': ['planning.js?v=7', 'state.js?v=7', 'dashboard-view.js?v=7', 'dashboard.css?v=7'],
    'components/wizard/wizard.html': ['planning.js?v=7', 'state.js?v=7'],
    'history/index.html': ['state.js?v=7'],
    'landing/index.html': ['state.js?v=7']
};
const pagesKo = [];
for (const [rel, attendus] of Object.entries(pages)) {
    const contenu = fs.readFileSync(path.join(RACINE, rel), 'utf8');
    for (const marqueur of attendus) {
        if (!contenu.includes(marqueur)) pagesKo.push(`${rel} → ${marqueur}`);
    }
}
check('Q7', 'cache-busting ?v=7 sur les fichiers modifiés par la V3.4',
    pagesKo.length === 0, pagesKo);


// ─────────────────────────────────────────────
// RÉSULTAT
// ─────────────────────────────────────────────
const total = ok + ko;
console.log('\n==============================================');
if (ko === 0) {
    console.log(`  ${total}/${total} PASS \u2014 V3.4 conforme \u2705`);
} else {
    console.log(`  ${ok}/${total} PASS \u2014 ${ko} échec(s) : ${echecs.join(', ')}`);
}
console.log('==============================================');
process.exitCode = ko === 0 ? 0 : 1;

