const http = require('http');

async function run() {
  const listRaw = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:9222/json/list', r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    }).on('error', rej);
  });
  const page = JSON.parse(listRaw).find(p => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const callbacks = new Map();
  const consoleErrors = [];

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args);
    }
    if (msg.id && callbacks.has(msg.id)) {
      const cb = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      cb(msg);
    }
  };
  function send(method, params = {}) {
    return new Promise(r => {
      const cur = id++;
      callbacks.set(cur, r);
      ws.send(JSON.stringify({ id: cur, method, params }));
    });
  }
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');

  async function evaluate(code) {
    const res = await send('Runtime.evaluate', { expression: code, returnByValue: true });
    return res.result?.result?.value;
  }
  async function evaluateDetailed(code) {
    const res = await send('Runtime.evaluate', { expression: code, returnByValue: true });
    if (res.result?.exceptionDetails) {
      console.error('EVAL EXCEPTION:', res.result.exceptionDetails);
    }
    return res.result?.result?.value;
  }


  console.log('=== TEST SUITE V3.2 XP ===\n');

  // Initialisation propre d'un état de test
  const initRes = await evaluateDetailed(`(() => {
    try {
      State.reset();
      const today = Planning.toStr(new Date());
      State.update({
        config: { dateDebut: today, heuresSoir: 3, heuresWeekend: 6, dureeSession: 1, joursBlockes: [], joursLibres: [] },
        modules: [
          { id: 'm1', nom: 'Analyse V3', etoiles: 3, chapitres: 3, dateExam: '2026-10-15', sessionsValidees: 0, couleur: '#4F46E5' },
          { id: 'm2', nom: 'Physique V3', etoiles: 4, chapitres: 3, dateExam: '2026-10-20', sessionsValidees: 0, couleur: '#10B981' }
        ]
      });
      State.planifier();
      DashboardView.rendreAujourdHui(State.get());
      const s = State.get();
      const todayJour = s.plan.find(j => j.date === today);
      return {
        today,
        planLen: s.plan.length,
        todaySessions: todayJour ? todayJour.sessions.length : 0
      };
    } catch(e) {
      return { err: e.message, stack: e.stack };
    }
  })()`);
  console.log('INIT RESULT:', initRes);

  // --- Test A : Session sans bilan ---
  const resA = await evaluateDetailed(`(() => {
    const today = Planning.toStr(new Date());
    const s = State.get();
    const todayJour = s.plan.find(j => j.date === today);
    const sess1 = todayJour.sessions[0];
    State.validerSession(sess1.moduleId, today, sess1.id);
    DashboardView.rendreAujourdHui(State.get());
    const sApres = State.get();
    const pill = document.getElementById('stat-xp-pill');
    return {
      xpAujourdhui: sApres.stats.xpAujourdhui,
      xpTotal: sApres.stats.xpTotal,
      xpObjectifsQuotidiens: sApres.stats.xpObjectifsQuotidiens,
      pillText: pill?.textContent
    };
  })()`);
  // V3.4 : 1/3 session terminée → journée incomplète → aucun bonus d'objectif.
  console.log('Test A (Session 1/3 sans bilan : +10, pas de bonus jour) :',
    resA.xpAujourdhui === 10 && resA.xpTotal === 10 && resA.xpObjectifsQuotidiens === 0 ? '✅ PASS' : '❌ FAIL', resA);

  // --- Test B : Session + bilan moyen sans note (+10 + 15 = 25 -> 35 total) ---
  const resB = await evaluateDetailed(`(() => {
    const today = Planning.toStr(new Date());
    const s = State.get();
    const todayJour = s.plan.find(j => j.date === today);
    const sess2 = todayJour.sessions[1];
    State.validerSession(sess2.moduleId, today, sess2.id);
    State.enregistrerBilanSession(sess2.moduleId, today, sess2.id, { maitrise: 'moyen', note: '' });
    DashboardView.rendreAujourdHui(State.get());
    const sApres = State.get();
    const sess2Xp = Planning.calculerXPSession(sApres.plan.find(j => j.date === today).sessions[1]);
    return { sess2Xp, xpAujourdhui: sApres.stats.xpAujourdhui, xpTotal: sApres.stats.xpTotal };
  })()`);
  console.log('Test B (Session + bilan moyen +25) :', resB.sess2Xp === 25 && resB.xpAujourdhui === 35 ? '✅ PASS' : '❌ FAIL', resB);

  // --- Test C : Session + bilan facile + note (+10 + 15 + 5 = 30 -> 65 total) ---
  const resC = await evaluateDetailed(`(() => {
    const today = Planning.toStr(new Date());
    const s = State.get();
    const todayJour = s.plan.find(j => j.date === today);
    const sess3 = todayJour.sessions[2];
    State.validerSession(sess3.moduleId, today, sess3.id);
    State.enregistrerBilanSession(sess3.moduleId, today, sess3.id, { maitrise: 'facile', note: 'Je retiens la diff.' });
    DashboardView.rendreAujourdHui(State.get());
    const sApres = State.get();
    const sess3Xp = Planning.calculerXPSession(sApres.plan.find(j => j.date === today).sessions[2]);
    return { sess3Xp, xpAujourdhui: sApres.stats.xpAujourdhui, xpTotal: sApres.stats.xpTotal, xpObjectifsQuotidiens: sApres.stats.xpObjectifsQuotidiens };
  })()`);
  // V3.4 : 3/3 sessions terminées → journée complète → bonus d'objectif +25.
  // Barème V3.2 inchangé par session : 10 + 15 + 5 = 30 pour cette session.
  console.log('Test C (Session + bilan facile + note : +30, journée complète → +25 bonus) :',
    resC.sess3Xp === 30 && resC.xpAujourdhui === 90 && resC.xpObjectifsQuotidiens === 25 ? '✅ PASS' : '❌ FAIL', resC);

  // --- Test D : Modification du bilan (Moyen -> Facile) ---
  const resD = await evaluateDetailed(`(() => {
    const today = Planning.toStr(new Date());
    const s = State.get();
    const todayJour = s.plan.find(j => j.date === today);
    const sess2 = todayJour.sessions[1];
    const xpAvant = s.stats.xpAujourdhui;
    State.enregistrerBilanSession(sess2.moduleId, today, sess2.id, { maitrise: 'facile', note: '' });
    DashboardView.rendreAujourdHui(State.get());
    const sApres = State.get();
    return { xpAvant, xpApres: sApres.stats.xpAujourdhui, delta: sApres.stats.xpAujourdhui - xpAvant };
  })()`);
  console.log('Test D (Modification bilan Moyen -> Facile, delta=0) :', resD.delta === 0 ? '✅ PASS' : '❌ FAIL', resD);

  // --- Test E : Consultation "Voir le bilan" ---
  const resE = await evaluateDetailed(`(() => {
    const today = Planning.toStr(new Date());
    const s = State.get();
    const todayJour = s.plan.find(j => j.date === today);
    const sess2 = todayJour.sessions[1];
    const xpAvant = s.stats.xpAujourdhui;
    Dashboard.ouvrirBilanModal(today, sess2.moduleId, sess2.id, 'Physique V3', true);
    Dashboard.fermerBilanModal(false);
    const sApres = State.get();
    return { xpAvant, xpApres: sApres.stats.xpAujourdhui, delta: sApres.stats.xpAujourdhui - xpAvant };
  })()`);
  console.log('Test E (Consultation bilan, delta=0) :', resE.delta === 0 ? '✅ PASS' : '❌ FAIL', resE);

  // --- Test F : Persistance F5 ---
  const xpAvantF5 = (await evaluateDetailed(`State.get().stats.xpAujourdhui`));
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 1200));
  const resF = await evaluateDetailed(`(() => {
    const s = State.get();
    const pill = document.getElementById('stat-xp-pill');
    return { xpApresF5: s.stats.xpAujourdhui, pillText: pill?.textContent };
  })()`);
  console.log('Test F (Persistance après F5) :', resF.xpApresF5 === xpAvantF5 ? '✅ PASS' : '❌ FAIL', { xpAvantF5, resF });

  // --- Test G : Dark Mode & Light Mode contrast check ---
  const resG = await evaluateDetailed(`(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    DashboardView.rendreAujourdHui(State.get());
    const pill = document.getElementById('stat-xp-pill');
    const compD = window.getComputedStyle(pill);
    const darkRes = { color: compD.color, bg: compD.backgroundColor, fontSize: compD.fontSize, visible: compD.display !== 'none' };

    document.documentElement.setAttribute('data-theme', 'light');
    DashboardView.rendreAujourdHui(State.get());
    const compL = window.getComputedStyle(pill);
    const lightRes = { color: compL.color, bg: compL.backgroundColor, fontSize: compL.fontSize, visible: compL.display !== 'none' };

    return { darkRes, lightRes };
  })()`);
  console.log('Test G (Dark & Light theme inspection) :', resG);

  // --- Test H : Responsive & Overflow ---
  const viewports = [1280, 768, 390, 320];
  const overflows = [];
  for (const w of viewports) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: (w < 768) });
    await new Promise(r => setTimeout(r, 150));
    const ov = await evaluateDetailed(`(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const pill = document.getElementById('stat-xp-pill');
      const rect = pill.getBoundingClientRect();
      return { width: winW, scrollW: docW, hasOverflow: docW > winW, pillVisible: rect.width > 0 && rect.height > 0 };
    })()`);
    overflows.push(ov);
  }
  const allNoOverflow = overflows.every(o => !o.hasOverflow && o.pillVisible);
  console.log('Test H (Responsive 1280, 768, 390, 320px) :', allNoOverflow ? '✅ PASS' : '❌ FAIL', overflows);

  // --- Test I : Planning intouché ---
  const resI = await evaluateDetailed(`(() => {
    const s = State.get();
    const modules = s.modules;
    const scores = modules.map(m => Planning.calculerScore(m));
    return { modulesCount: modules.length, scores };
  })()`);
  console.log('Test I (Planning & priorité inchangés) :', resI.modulesCount === 2 && resI.scores.every(sc => sc > 0) ? '✅ PASS' : '❌ FAIL', resI);

  // --- Test J : Console & Exceptions CDP ---
  console.log('Test J (0 exception CDP, 0 erreur console) :', consoleErrors.length === 0 ? '✅ PASS' : '❌ FAIL', consoleErrors);

  ws.close();
}

run().catch(console.error);
