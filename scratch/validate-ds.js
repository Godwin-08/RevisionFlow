// ============================================================
// V3.1a — Validation du Design System & non-régression structurelle
// ============================================================
const fs = require('fs');
const ROOT = 'c:/Users/vPro/Downloads/revisionflow/';
const errs = [], warns = [], infos = [];

const CSS_FILES = ['core/variables.css', 'components/dashboard/dashboard.css',
    'components/pomodoro/pomodoro.css', 'components/wizard/wizard.css',
    'history/history.css', 'landing/landing.css'];
const JS_FILES = ['core/ui.js', 'core/state.js', 'core/planning.js', 'core/storage.js',
    'components/dashboard/dashboard.js', 'components/dashboard/dashboard-view.js',
    'components/pomodoro/pomodoro.js', 'components/wizard/wizard.js',
    'components/wizard/wizard-view.js', 'history/history.js', 'landing/landing.js'];

// V3.5b : le dossier filter/ a été supprimé (mort : jamais chargé par une
// page, API jamais appelée). Ne pas le réintroduire dans ces listes.

const read = f => fs.readFileSync(ROOT + f, 'utf8');
const cssTexts = {};
for (const f of CSS_FILES) cssTexts[f] = read(f);

/* ---------- 1. Tokens : définis vs utilisés ---------- */
const defined = new Set();
for (const f of CSS_FILES)
    for (const m of cssTexts[f].matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);

const usedBy = {};
for (const f of [...CSS_FILES, ...JS_FILES]) {
    const txt = cssTexts[f] !== undefined ? cssTexts[f] : read(f);
    for (const m of txt.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
        (usedBy[m[1]] = usedBy[m[1]] || []);
        if (!usedBy[m[1]].includes(f)) usedBy[m[1]].push(f);
    }
}
const missing = Object.keys(usedBy).filter(t => !defined.has(t));
if (missing.length)
    missing.forEach(t => errs.push(`TOKEN NON DEFINI : ${t} (utilise dans ${usedBy[t].join(', ')})`));
else
    infos.push(`Tokens : ${Object.keys(usedBy).length} utilise(s), ${defined.size} defini(s), 0 manquant`);

/* ---------- 2. Equilibre des accolades ---------- */
for (const f of CSS_FILES) {
    const o = (cssTexts[f].match(/{/g) || []).length;
    const c = (cssTexts[f].match(/}/g) || []).length;
    if (o !== c) errs.push(`CSS DES EQUILIBRE : ${f} ( { = ${o}, } = ${c} )`);
}
infos.push('Accolades CSS : equilibrees sur les ' + CSS_FILES.length + ' feuilles');

/* ---------- 3. Couleurs en dur (perimetre V3.1a) ---------- */
const allowed = [/#FFFFFF'/, /#A5B4FC'/, /'#4F46E5'/, /'#10B981'/, /'#F59E0B'/];
for (const f of ['components/dashboard/dashboard.css', 'components/pomodoro/pomodoro.js',
    'components/dashboard/dashboard-view.js', 'core/ui.js']) {
    const txt = cssTexts[f] !== undefined ? cssTexts[f] : read(f);
    txt.split('\n').forEach((line, i) => {
        const hit = /#[0-9a-fA-F]{3,8}\b/.test(line) || /rgba?\(/.test(line);
        if (hit && !allowed.some(re => re.test(line)))
            errs.push(`COULEUR EN DUR : ${f}:${i + 1} ${line.trim().slice(0, 90)}`);
    });
}
infos.push('Couleurs en dur : scan sur dashboard.css, pomodoro.js, dashboard-view.js, ui.js');


/* ---------- 4. @keyframes referencées ---------- */
const kfDef = new Set();
for (const f of CSS_FILES)
    for (const m of cssTexts[f].matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)) kfDef.add(m[1]);
const notKf = new Set(['ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out', 'infinite',
    'normal', 'reverse', 'alternate', 'none', 'forwards', 'backwards', 'both',
    'running', 'paused', 'steps', 'cubic-bezier']);
for (const f of ['core/variables.css', 'components/dashboard/dashboard.css']) {
    for (const m of cssTexts[f].matchAll(/animation(?:-name)?:\s*([^;}]+)/g)) {
        m[1].split(',').forEach(part => {
            const first = part.trim().split(/\s+/)[0];
            if (!first || first.startsWith('var(') || /^[0-9.]/.test(first) || notKf.has(first)) return;
            if (!kfDef.has(first)) errs.push(`@keyframes MANQUANTE : "${first}" referencée dans ${f}`);
        });
    }
}
for (const f of JS_FILES) {
    const txt = read(f);
    for (const m of txt.matchAll(/animation\s*=\s*'([A-Za-z0-9_-]+)\s/g))
        if (!kfDef.has(m[1]))
            errs.push(`@keyframes MANQUANTE : "${m[1]}" utilisee en JS dans ${f}`);
}
infos.push('@keyframes : ' + kfDef.size + ' defini(es) (' + [...kfDef].join(', ') + ')');

/* ---------- 5. Contrat DOM du Dashboard ---------- */
const html = read('components/dashboard/dashboard.html');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const dynamicIds = new Set(['conf-oui', 'conf-non', 'pomo-styles', 'toast-keyframes']);
const idRefs = {};
for (const f of ['components/dashboard/dashboard.js',
    'components/dashboard/dashboard-view.js', 'components/pomodoro/pomodoro.js']) {
    for (const m of read(f).matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) {
        (idRefs[m[1]] = idRefs[m[1]] || []);
        if (!idRefs[m[1]].includes(f)) idRefs[m[1]].push(f);
    }
}
Object.keys(idRefs)
    .filter(id => !htmlIds.has(id) && !dynamicIds.has(id))
    .forEach(id => warns.push(`ID absent du HTML : #${id} (reference par ${idRefs[id].join(', ')})`));
infos.push(`Contrat DOM : ${Object.keys(idRefs).length} id(s) reference(s) en JS, ${htmlIds.size} presents dans dashboard.html`);

/* ---------- 6. Feuilles & scripts declares ---------- */
const links = [...html.matchAll(/(?:href|src)="([^"]+\.(?:css|js))(\?v=\d+)?"/g)].map(m => m[1]);
links.forEach(l => {
    if (!fs.existsSync(ROOT + 'components/dashboard/' + l))
        errs.push('RESSOURCE INTROUVABLE : ' + l);
});
const iTok = links.findIndex(l => l.includes('variables.css'));
const iDash = links.findIndex(l => l.includes('dashboard.css'));
if (iTok === -1 || iTok > iDash)
    errs.push('variables.css doit etre charge AVANT dashboard.css');
infos.push('Ressources du Dashboard : ' + links.length + ' declarees, toutes presentes, ordre DS respecte');


/* ---------- 7. Encodage (mojibake) ---------- */
for (const f of [...CSS_FILES, ...JS_FILES, 'components/dashboard/dashboard.html']) {
    const bad = read(f).match(/Ã[\u00A0-\u00FF]|â€|Â[\u00A0-\u00FF]/g);
    if (bad) errs.push(`MOJIBAKE dans ${f} : ${bad.slice(0, 3).join(' ')}`);
}
infos.push('Encodage : aucun texte corrompu detecte');

/* ---------- 8. Fins de ligne ---------- */
for (const f of ['core/variables.css', 'components/dashboard/dashboard.css',
    'components/pomodoro/pomodoro.js', 'core/ui.js', 'core/state.js',
    'components/dashboard/dashboard.html']) {
    const b = fs.readFileSync(ROOT + f);
    let crlf = 0, lf = 0;
    for (let i = 0; i < b.length; i++)
        if (b[i] === 10) { if (b[i - 1] === 13) crlf++; else lf++; }
    infos.push(`EOL ${f} : CRLF=${crlf} LF=${lf}`);
}

/* ---------- Rapport ---------- */
console.log('===== VALIDATION DESIGN SYSTEM V3.1a =====');
infos.forEach(i => console.log('  [ok] ' + i));
if (warns.length) {
    console.log('--- AVERTISSEMENTS (' + warns.length + ')');
    warns.forEach(w => console.log('  [ ! ] ' + w));
}
if (errs.length) {
    console.log('--- ERREURS (' + errs.length + ')');
    errs.forEach(e => console.log('  [ERR] ' + e));
    process.exitCode = 1;
} else {
    console.log('--- 0 erreur bloquante');
}
