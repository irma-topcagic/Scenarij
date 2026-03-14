document.addEventListener('DOMContentLoaded', function () {
  const div = document.getElementById('divEditor');
  const poruke = document.getElementById('poruke');
  

  let editor;
  try {
    editor = EditorTeksta(div);
  } catch (e) {
    poruke.style.display = "block";
    poruke.innerText = 'Greška pri inicijalizaciji modula: ' + (e.message || e);
    return;
  }

 
  function ispisi(msg) {
    poruke.style.display = "block";
    poruke.innerText = (typeof msg === 'string') ? msg : JSON.stringify(msg, null, 2);
  }

  const warn = document.getElementById("upozorenje");

function prikaziUpozorenje(text) {
  if (!warn) return;
  warn.style.display = "block";
  warn.innerText = "⚠️ " + text;
}

function sakrijUpozorenje() {
  if (!warn) return;
  warn.style.display = "none";
  warn.innerText = "";
}



  function setNaslov(title, id) {
    const el = document.getElementById('naslovProjekta');
    const t = title || (id ? `Scenarij ${id}` : 'ScenarijPro');
    if (el) el.textContent = t;
    document.title = t;
  }

  function getScenarioIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = parseInt(params.get('id'), 10);
    return Number.isFinite(id) ? id : null;
  }

  function linearizeContent(content) {
    if (!Array.isArray(content) || content.length === 0) return "";

    const byId = new Map(content.map(l => [l.lineId, l]));
    const nextSet = new Set(content.filter(l => l.nextLineId != null).map(l => l.nextLineId));

    let head = content.find(l => !nextSet.has(l.lineId)) || content[0];

    const out = [];
    const visited = new Set();
    let cur = head;
    while (cur && !visited.has(cur.lineId)) {
      visited.add(cur.lineId);
      out.push(cur.text ?? "");
      cur = (cur.nextLineId != null) ? byId.get(cur.nextLineId) : null;
    }
    return out.join("\n");
  }

  // trenutno aktivan scenarij
  let activeScenarioId = null;

 
  let lastSince = 0;

  function getUserId() {
    const x = parseInt(document.getElementById('inpUserId').value, 10);
    return Number.isFinite(x) ? x : 1;
  }

  function renderScenario(scenario) {
    activeScenarioId = scenario.id;

    
    const inpScenarioId = document.getElementById('inpScenarioId');
    if (inpScenarioId) inpScenarioId.value = scenario.id;

    
    setNaslov(scenario.title, scenario.id);

    // tekst u editor
    div.innerText = linearizeContent(scenario.content);

    
  }

  function loadScenarioById(id) {
    if (!id) return ispisi("Unesi validan Scenario ID.");

    PoziviAjaxFetch.getScenario(id, (status, data) => {
      if (status !== 200) return ispisi(data?.message || "Ne mogu učitati scenarij.");

      renderScenario(data);

      
      const url = new URL(window.location.href);
      url.searchParams.set('id', id);
      window.history.replaceState({}, "", url.toString());
    });
  }

 
  const inputUloga = document.getElementById('inputUloga');

  document.getElementById('btnBrojRijeci').addEventListener('click', function () {
    ispisi(editor.dajBrojRijeci());
  });

  document.getElementById('btnDajUloge').addEventListener('click', function () {
    ispisi(editor.dajUloge());
  });

  document.getElementById('btnPogresneUloge').addEventListener('click', function () {
    ispisi(editor.pogresnaUloga());
  });

  document.getElementById('btnGrupisi').addEventListener('click', function () {
    ispisi(editor.grupisiUloge());
  });

  document.getElementById('btnBrojLinija').addEventListener('click', function () {
    const u = inputUloga.value.trim();
    if (!u) { ispisi('Unesite ime uloge u polje.'); return; }
    ispisi(editor.brojLinijaTeksta(u));
  });

  document.getElementById('btnScenarijUloge').addEventListener('click', function () {
    const u = inputUloga.value.trim();
    if (!u) { ispisi('Unesite ime uloge u polje.'); return; }
    ispisi(editor.scenarijUloge(u));
  });

  document.getElementById('btnBold').addEventListener('click', function () {
    const ok = editor.formatirajTekst('bold');
    ispisi(ok ? 'Formatirano: bold.' : 'Nije formatirano. Selektujte tekst unutar editora.');
  });

  document.getElementById('btnItalic').addEventListener('click', function () {
    const ok = editor.formatirajTekst('italic');
    ispisi(ok ? 'Formatirano: italic.' : 'Nije formatirano. Selektujte tekst unutar editora.');
  });

  document.getElementById('btnUnderline').addEventListener('click', function () {
    const ok = editor.formatirajTekst('underline');
    ispisi(ok ? 'Formatirano: underline.' : 'Nije formatirano. Selektujte tekst unutar editora.');
  });

  // ---- backend dugmad ----

  document.getElementById('btnUcitajScenarij').addEventListener('click', function () {
    const id = parseInt(document.getElementById('inpScenarioId').value, 10);
    loadScenarioById(Number.isFinite(id) ? id : null);
  });

  document.getElementById('btnKreirajNovi').addEventListener('click', function () {
    const title = document.getElementById('inpNoviNaslov').value.trim() || "Neimenovani scenarij";
    PoziviAjaxFetch.postScenario(title, (status, data) => {
      if (status !== 200) return ispisi(data?.message || "Ne mogu kreirati scenarij.");
      renderScenario(data);
      ispisi(`Kreiran scenarij #${data.id}.`);
    });
  });

  document.getElementById('btnZakljucajLiniju').addEventListener('click', function () {
    const userId = getUserId();
    const scenarioId = activeScenarioId || parseInt(document.getElementById('inpScenarioId').value, 10);
    const lineId = parseInt(document.getElementById('inpLineLockId').value, 10);

    if (!scenarioId || !lineId) return ispisi("Unesi Scenario ID i Line ID.");
    PoziviAjaxFetch.lockLine(scenarioId, lineId, userId, (status, data) => {
      if (status !== 200) return ispisi(data?.message || "Ne mogu zaključati liniju.");
      ispisi(data);
    });
  });

document.getElementById('btnAzurirajLiniju').addEventListener('click', function () {
  const userId = getUserId();
  const scenarioId = activeScenarioId || parseInt(document.getElementById('inpScenarioId').value, 10);
  const lineId = parseInt(document.getElementById('inpLineUpdateId').value, 10);

  const raw = document.getElementById('inpNoviTekstLinije').value;

  
  if (!raw || raw.trim() === "") {
    return ispisi("Tekst linije ne smije biti prazan.");
  }

  const newText = raw
    .split(/\r?\n/)
    .map(s => s.trimEnd())
    .filter(s => s !== "");

  if (newText.length === 0) {
    return ispisi("Tekst linije ne smije biti prazan.");
  }

  PoziviAjaxFetch.updateLine(scenarioId, lineId, userId, newText, (status, data) => {
    if (status !== 200) return ispisi(data?.message || "Ne mogu ažurirati liniju.");
    ispisi(data);

    PoziviAjaxFetch.getScenario(scenarioId, (s2, sc) => {
      if (s2 === 200) renderScenario(sc);
    });
  });
});


  document.getElementById('btnZakljucajIme').addEventListener('click', function () {
    
    const userId = getUserId();
    const scenarioId = activeScenarioId || parseInt(document.getElementById('inpScenarioId').value, 10);
    const characterName = document.getElementById('inpLockChar').value.trim();

    if (!scenarioId || !characterName) return ispisi("Unesi Scenario ID i ime lika.");
    
    PoziviAjaxFetch.lockCharacter(scenarioId, characterName, userId, (status, data) => {
      if (status !== 200) return ispisi(data?.message || "Ne mogu zaključati ime lika.");
      ispisi(data);
    });
  });

  document.getElementById('btnPromijeniIme').addEventListener('click', function () {
     
     const userId = getUserId();
    const scenarioId = activeScenarioId || parseInt(document.getElementById('inpScenarioId').value, 10);
    const oldName = document.getElementById('inpOldName').value.trim();
    const newName = document.getElementById('inpNewName').value.trim();

    if (!scenarioId || !oldName || !newName) return ispisi("Unesi Scenario ID, staro i novo ime.");
    
  PoziviAjaxFetch.updateCharacter(scenarioId, userId, oldName, newName, (status, data) => {
      if (status !== 200) return ispisi(data?.message || "Ne mogu promijeniti ime.");
      ispisi(data);

      
      PoziviAjaxFetch.getScenario(scenarioId, (s2, sc) => {
        if (s2 === 200) renderScenario(sc);
      });
    });
  });

  document.getElementById('btnUcitajPromjene').addEventListener('click', function () {
    const scenarioId = activeScenarioId || parseInt(document.getElementById('inpScenarioId').value, 10);
    if (!scenarioId) return ispisi("Unesi Scenario ID.");

    const sinceInput = parseInt(document.getElementById('inpSince').value, 10);
    const since = Number.isFinite(sinceInput) ? sinceInput : lastSince;

    PoziviAjaxFetch.getDeltas(scenarioId, since, (status, data) => {
      if (status !== 200) return ispisi(data?.message || "Ne mogu učitati delte.");

      const deltas = data?.deltas || [];
      

     
      if (deltas.length > 0) {
        const lastTs = deltas[deltas.length - 1].timestamp;
        lastSince = lastTs;
        document.getElementById('inpSince').value = String(lastTs);
      }

      ispisi({ count: deltas.length, deltas });

    });
  });

 
  document.getElementById('btnSpasi').addEventListener('click', function () {
    const userId = getUserId();
    const scenarioId = activeScenarioId || parseInt(document.getElementById('inpScenarioId').value, 10);
    if (!scenarioId) return ispisi("Nije izabran scenarij.");

    const fullText = div.innerText || "";

    PoziviAjaxFetch.lockLine(scenarioId, 1, userId, (s1, r1) => {
      if (s1 !== 200) return ispisi(r1?.message || "Ne mogu zaključati liniju 1.");

      PoziviAjaxFetch.updateLine(scenarioId, 1, userId, [fullText], (s2, r2) => {
        if (s2 !== 200) return ispisi(r2?.message || "Ne mogu sačuvati.");
        ispisi(r2);

        
        PoziviAjaxFetch.getScenario(scenarioId, (s3, sc) => {
          if (s3 === 200) renderScenario(sc);
        });
      });
    });
  });

 
  const urlId = getScenarioIdFromUrl();
  if (urlId) {
    loadScenarioById(urlId);
  } else {
    setNaslov("ScenarijPro", null);
  }
});
