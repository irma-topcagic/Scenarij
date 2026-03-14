const express = require('express');
const path = require('path');
const { Op } = require('sequelize');
const { sequelize, Scenario, Line, Delta, Checkpoint } = require('./db.js');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'writing.html'));
});

//MEMORIJSKO ZAKLJUČAVANJE 
let lineLocks = []; // userId, scenarioId, lineId 
let charLocks = []; // userId, scenarioId, characterName 


function nowTs() {
  return Math.floor(Date.now() / 1000);
}

async function scenarioExists(scenarioId) {
  return !!(await Scenario.findByPk(scenarioId));
}

async function lineExists(scenarioId, lineId) {
  return !!(await Line.findOne({ where: { scenarioId, lineId } }));
}

async function logDeltaToDB(delta) {
  await Delta.create(delta);
}

async function getScenarioResponse(scenarioId) {
  const scenario = await Scenario.findByPk(scenarioId);
  if (!scenario) return null;

  const lines = await Line.findAll({
    where: { scenarioId },
    attributes: ['lineId', 'nextLineId', 'text'],
    order: [['lineId', 'ASC']]
  });

  return {
    id: scenario.id,
    title: scenario.title,
    content: lines.map(l => ({
      lineId: l.lineId,
      nextLineId: l.nextLineId,
      text: l.text
    }))
  };
}


// RUTA 1: Kreiranje scenarija 
app.post('/api/scenarios', async (req, res) => {
  try {
    const title = req.body.title || "Neimenovani scenarij";

    const newScenario = await Scenario.create({ title });

    const initialLine = await Line.create({
      scenarioId: newScenario.id,
      lineId: 1,
      nextLineId: null,
      text: ""
    });

    return res.status(200).json({
      id: newScenario.id,
      title: newScenario.title,
      content: [{
        lineId: initialLine.lineId,
        nextLineId: initialLine.nextLineId,
        text: initialLine.text
      }]
    });
  } catch (err) {
    return res.status(500).json({ message: "Greška", error: err.message });
  }
});


// RUTA 2: Zaključavanje linije 
app.post('/api/scenarios/:scenarioId/lines/:lineId/lock', async (req, res) => {
  const scenarioId = parseInt(req.params.scenarioId);
  const lineId = parseInt(req.params.lineId);
  const userId = parseInt(req.body.userId);

  // provjera scenarija + linije 
  const sc = await Scenario.findByPk(scenarioId);
  if (!sc) return res.status(404).json({ message: "Scenario ne postoji!" });

  const line = await Line.findOne({ where: { scenarioId, lineId } });
  if (!line) return res.status(404).json({ message: "Linija ne postoji!" });

  const existingLock = lineLocks.find(l => l.scenarioId === scenarioId && l.lineId === lineId);
  if (existingLock && existingLock.userId !== userId) {
    return res.status(409).json({ message: "Linija je vec zakljucana!" });
  }

  // global lock po useru 
  lineLocks = lineLocks.filter(l => l.userId !== userId);
  lineLocks.push({ userId, scenarioId, lineId });

  return res.status(200).json({ message: "Linija je uspjesno zakljucana!" });
});


// RUTA 3: Ažuriranje linije 

app.put('/api/scenarios/:scenarioId/lines/:lineId', async (req, res) => {
  const scenarioId = parseInt(req.params.scenarioId);
  const lineId = parseInt(req.params.lineId);
  const userId = parseInt(req.body.userId);
  const { newText } = req.body;

  if (!newText || !Array.isArray(newText) || newText.length === 0) {
    return res.status(400).json({ message: "Niz new_text ne smije biti prazan!" });
  }

  const sc = await Scenario.findByPk(scenarioId);
  if (!sc) return res.status(404).json({ message: "Scenario ne postoji!" });

  const currentLine = await Line.findOne({ where: { scenarioId, lineId } });
  if (!currentLine) return res.status(404).json({ message: "Linija ne postoji!" });

  const hasLock = lineLocks.some(l => l.userId === userId && l.scenarioId === scenarioId && l.lineId === lineId);
  if (!hasLock) {
    const isLockedAtAll = lineLocks.some(l => l.scenarioId === scenarioId && l.lineId === lineId);
    if (isLockedAtAll) return res.status(409).json({ message: "Linija je vec zakljucana!" });
    return res.status(409).json({ message: "Linija nije zakljucana!" });
  }

  const originalNextLineId = currentLine.nextLineId;

  // split na max 20 riječi po liniji 
  let processedLinesTexts = [];
  newText.forEach(segment => {
    let words = String(segment).trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) {
      processedLinesTexts.push("");
    } else {
      for (let i = 0; i < words.length; i += 20) {
        processedLinesTexts.push(words.slice(i, i + 20).join(" "));
      }
    }
  });
  if (processedLinesTexts.length === 0) processedLinesTexts.push("");

  // max lineId u bazi za taj scenario
  const maxLineObj = await Line.findOne({
    where: { scenarioId },
    order: [['lineId', 'DESC']]
  });
  let maxId = maxLineObj ? maxLineObj.lineId : 0;

  const timestamp = nowTs();

  // 1) update postojeće linije 
  const newFirstNext = processedLinesTexts.length > 1 ? (maxId + 1) : originalNextLineId;

  await currentLine.update({
    text: processedLinesTexts[0],
    nextLineId: newFirstNext
  });

  await logDeltaToDB({
    scenarioId,
    type: "line_update",
    lineId: lineId,
    nextLineId: newFirstNext,
    content: processedLinesTexts[0],
    timestamp
  });

  // 2) kreiraj nove linije za ostatak (ako ima)
  for (let i = 1; i < processedLinesTexts.length; i++) {
    maxId++;
    const nextId = (i === processedLinesTexts.length - 1) ? originalNextLineId : (maxId + 1);

    await Line.create({
      scenarioId,
      lineId: maxId,
      nextLineId: nextId,
      text: processedLinesTexts[i]
    });

    await logDeltaToDB({
      scenarioId,
      type: "line_update",
      lineId: maxId,
      nextLineId: nextId,
      content: processedLinesTexts[i],
      timestamp
    });
  }

  // unlock nakon uspješnog update-a
  lineLocks = lineLocks.filter(l => !(l.userId === userId && l.scenarioId === scenarioId && l.lineId === lineId));

  return res.status(200).json({ message: "Linija je uspjesno azurirana!" });
});


// RUTA 4: Zaključavanje lika 
app.post('/api/scenarios/:scenarioId/characters/lock', async (req, res) => {
  const scenarioId = parseInt(req.params.scenarioId);
  const userId = parseInt(req.body.userId);
  const { characterName } = req.body;

  const sc = await Scenario.findByPk(scenarioId);
  if (!sc) return res.status(404).json({ message: "Scenario ne postoji!" });

  const existingLock = charLocks.find(c => c.scenarioId === scenarioId && c.characterName === characterName);
  if (existingLock && existingLock.userId !== userId) {
    return res.status(409).json({ message: "Konflikt! Ime lika je vec zakljucano!" });
  }

  if (!existingLock) charLocks.push({ userId, scenarioId, characterName });

  return res.status(200).json({ message: "Ime lika je uspjesno zakljucano!" });
});


// RUTA 5: Ažuriranje imena lika (case-sensitive)

app.post('/api/scenarios/:scenarioId/characters/update', async (req, res) => {
  const scenarioId = parseInt(req.params.scenarioId);
  const userId = parseInt(req.body.userId);
  const { oldName, newName } = req.body;

  const sc = await Scenario.findByPk(scenarioId);
  if (!sc) return res.status(404).json({ message: "Scenario ne postoji!" });

  const charLock = charLocks.find(c => c.scenarioId === scenarioId && c.characterName === oldName);
  if (!charLock) {
  return res.status(409).json({ message: "Konflikt! Ime lika nije zakljucano!" });}
  if (charLock && charLock.userId !== userId) {
    return res.status(409).json({ message: "Ime lika je zaključano od drugog korisnika!" });
  }

  
  const linesWithChar = await Line.findAll({
    where: { scenarioId, text: { [Op.like]: `%${oldName}%` } }
  });

  // Provjera da nijedna od tih linija nije zaključana od drugog usera
  for (const line of linesWithChar) {
    const lineLock = lineLocks.find(l => l.scenarioId === scenarioId && l.lineId === line.lineId);
    if (lineLock && lineLock.userId !== userId) {
      return res.status(409).json({
        message: "Greška: Jedna od linija koja sadrži to ime je zaključana od strane drugog korisnika!"
      });
    }
  }

  
  for (const line of linesWithChar) {
    const updatedText = String(line.text || "").split(oldName).join(newName);
    await line.update({ text: updatedText });
  }

  await logDeltaToDB({
    scenarioId,
    type: "char_rename",
    oldName,
    newName,
    timestamp: nowTs()
  });

  // Ukloni lock
  const lockIndex = charLocks.findIndex(c => c.scenarioId === scenarioId && c.characterName === oldName);
  if (lockIndex !== -1) charLocks.splice(lockIndex, 1);

  return res.status(200).json({ message: "Ime lika je uspjesno promijenjeno!" });
});


// RUTA 6: Dohvatanje delti 
app.get('/api/scenarios/:scenarioId/deltas', async (req, res) => {
  const scenarioId = parseInt(req.params.scenarioId);
  const since = parseInt(req.query.since) || 0;

  const sc = await Scenario.findByPk(scenarioId);
  if (!sc) return res.status(404).json({ message: "Scenario ne postoji!" });

  const deltas = await Delta.findAll({
    where: { scenarioId, timestamp: { [Op.gt]: since } },
    order: [['timestamp', 'ASC'], ['id', 'ASC']],
    attributes: { exclude: ['id', 'scenarioId'] } 
  });

  return res.status(200).json({ deltas });
});


// GET scenario 
app.get('/api/scenarios/:scenarioId', async (req, res) => {
  const scenarioId = parseInt(req.params.scenarioId);

  const response = await getScenarioResponse(scenarioId);
  if (!response) return res.status(404).json({ message: "Scenario ne postoji!" });

  return res.status(200).json(response);
});


// CHECKPOINT RUTE

app.post('/api/scenarios/:scenarioId/checkpoint', async (req, res) => {
  const scenarioId = parseInt(req.params.scenarioId);

  const sc = await Scenario.findByPk(scenarioId);
  if (!sc) return res.status(404).json({ message: "Scenario ne postoji!" });

  await Checkpoint.create({ scenarioId, timestamp: nowTs() });
  return res.status(200).json({ message: "Checkpoint je uspjesno kreiran!" });
});

app.get('/api/scenarios/:scenarioId/checkpoints', async (req, res) => {
  const scenarioId = parseInt(req.params.scenarioId);

  const sc = await Scenario.findByPk(scenarioId);
  if (!sc) return res.status(404).json({ message: "Scenario ne postoji!" });

  const checkpoints = await Checkpoint.findAll({
    where: { scenarioId },
    attributes: ['id', 'timestamp'],
    order: [['timestamp', 'ASC'], ['id', 'ASC']]
  });

  return res.status(200).json(checkpoints.map(c => ({ id: c.id, timestamp: c.timestamp })));
});

app.get('/api/scenarios/:scenarioId/restore/:checkpointId', async (req, res) => {
  const scenarioId = parseInt(req.params.scenarioId);
  const checkpointId = parseInt(req.params.checkpointId);

  const sc = await Scenario.findByPk(scenarioId);
  if (!sc) return res.status(404).json({ message: "Scenario ne postoji!" });

  const checkpoint = await Checkpoint.findOne({ where: { id: checkpointId, scenarioId } });
  if (!checkpoint) return res.status(404).json({ message: "Checkpoint ne postoji!" });

  
  let restored = [{ lineId: 1, nextLineId: null, text: "" }];

  const deltas = await Delta.findAll({
    where: { scenarioId, timestamp: { [Op.lte]: checkpoint.timestamp } },
    order: [['timestamp', 'ASC'], ['id', 'ASC']]
  });

  for (const d of deltas) {
    if (d.type === "line_update") {
      const idx = restored.findIndex(l => l.lineId === d.lineId);
      if (idx !== -1) {
        restored[idx].text = d.content ?? "";
        restored[idx].nextLineId = d.nextLineId ?? null;
      } else {
        restored.push({
          lineId: d.lineId,
          nextLineId: d.nextLineId ?? null,
          text: d.content ?? ""
        });
      }
    } else if (d.type === "char_rename") {
      restored.forEach(line => {
        if ((line.text || "").includes(d.oldName)) {
          line.text = (line.text || "").split(d.oldName).join(d.newName);
        }
      });
    }
  }

  restored.sort((a, b) => a.lineId - b.lineId);

  return res.status(200).json({
    id: sc.id,
    title: sc.title,
    content: restored
  });
});


//scenario1 + deltas (za inicijalizaciju baze)
const POPUNI_SCENARIO_1 = {
  "id": 1,
  "title": "Potraga za izgubljenim ključem",
  "content": [
    { "lineId": 1, "nextLineId": 2, "text": "NARATOR: Sunce je polako zalazilo nad starim gradom." },
    { "lineId": 2, "nextLineId": 3, "text": "ALICIA: Jesi li siguran da je ključ ostao u biblioteci?" },
    { "lineId": 3, "nextLineId": 15, "text": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ" },
    { "lineId": 15, "nextLineId": 16, "text": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ" },
    { "lineId": 16, "nextLineId": 13, "text": "riječ riječ riječ riječ riječ" },
    { "lineId": 13, "nextLineId": 14, "text": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ" },
    { "lineId": 14, "nextLineId": 11, "text": "riječ riječ riječ riječ riječ" },
    { "lineId": 11, "nextLineId": 12, "text": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ" },
    { "lineId": 12, "nextLineId": 9, "text": "riječ riječ riječ riječ riječ" },
    { "lineId": 9, "nextLineId": 10, "text": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ" },
    { "lineId": 10, "nextLineId": 7, "text": "riječ riječ riječ riječ riječ" },
    { "lineId": 7, "nextLineId": 8, "text": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ" },
    { "lineId": 8, "nextLineId": 4, "text": "riječ riječ riječ riječ riječ" },
    { "lineId": 4, "nextLineId": 5, "text": "ALICIA: Moramo požuriti prije nego što čuvar zaključa glavna vrata." },
    { "lineId": 5, "nextLineId": 6, "text": "BOB: Čekaj, čuješ li taj zvuk iza polica?" },
    { "lineId": 6, "nextLineId": null, "text": "NARATOR: Iz sjene se polako pojavila nepoznata figura." }
  ]
};

const POPUNI_DELTAS = [
  { "scenarioId": 1, "type": "line_update", "lineId": 1, "nextLineId": 2, "content": "NARATOR: Sunce je polako zalazilo nad starim gradom.", "timestamp": 1736520000 },
  { "scenarioId": 1, "type": "line_update", "lineId": 2, "nextLineId": 3, "content": "ALICE: Jesi li siguran da je ključ ostao u biblioteci?", "timestamp": 1736520010 },
  { "scenarioId": 1, "type": "line_update", "lineId": 3, "nextLineId": 4, "content": "BOB: To je posljednje mjesto gdje sam ga vidio prije nego što je pala noć.", "timestamp": 1736520020 },
  { "scenarioId": 1, "type": "line_update", "lineId": 4, "nextLineId": 5, "content": "ALICE: Moramo požuriti prije nego što čuvar zaključa glavna vrata.", "timestamp": 1736520030 },
  { "scenarioId": 1, "type": "line_update", "lineId": 5, "nextLineId": 6, "content": "BOB: Čekaj, čuješ li taj zvuk iza polica?", "timestamp": 1736520040 },
  { "scenarioId": 1, "type": "line_update", "lineId": 6, "nextLineId": null, "content": "NARATOR: Iz sjene se polako pojavila nepoznata figura.", "timestamp": 1736520050 },
  { "scenarioId": 1, "type": "char_rename", "oldName": "BOB", "newName": "ROBERT", "timestamp": 1736520100 },

  { "scenarioId": 1, "type": "line_update", "lineId": 3, "nextLineId": 7, "content": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ", "timestamp": 1768133785 },
  { "scenarioId": 1, "type": "line_update", "lineId": 7, "nextLineId": 8, "content": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ", "timestamp": 1768133785 },
  { "scenarioId": 1, "type": "line_update", "lineId": 8, "nextLineId": 4, "content": "riječ riječ riječ riječ riječ", "timestamp": 1768133785 },
  { "scenarioId": 1, "type": "char_rename", "oldName": "ALICE", "newName": "ALICIA", "timestamp": 1768133785 },

  { "scenarioId": 1, "type": "line_update", "lineId": 3, "nextLineId": 9, "content": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ", "timestamp": 1768134746 },
  { "scenarioId": 1, "type": "line_update", "lineId": 9, "nextLineId": 10, "content": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ", "timestamp": 1768134746 },
  { "scenarioId": 1, "type": "line_update", "lineId": 10, "nextLineId": 7, "content": "riječ riječ riječ riječ riječ", "timestamp": 1768134746 },
  { "scenarioId": 1, "type": "char_rename", "oldName": "ALICE", "newName": "ALICIA", "timestamp": 1768134746 },

  { "scenarioId": 1, "type": "line_update", "lineId": 3, "nextLineId": 11, "content": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ", "timestamp": 1768134928 },
  { "scenarioId": 1, "type": "line_update", "lineId": 11, "nextLineId": 12, "content": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ", "timestamp": 1768134928 },
  { "scenarioId": 1, "type": "line_update", "lineId": 12, "nextLineId": 9, "content": "riječ riječ riječ riječ riječ", "timestamp": 1768134928 },
  { "scenarioId": 1, "type": "char_rename", "oldName": "ALICE", "newName": "ALICIA", "timestamp": 1768134928 },

  { "scenarioId": 1, "type": "line_update", "lineId": 3, "nextLineId": 13, "content": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ", "timestamp": 1768214513 },
  { "scenarioId": 1, "type": "line_update", "lineId": 13, "nextLineId": 14, "content": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ", "timestamp": 1768214513 },
  { "scenarioId": 1, "type": "line_update", "lineId": 14, "nextLineId": 11, "content": "riječ riječ riječ riječ riječ", "timestamp": 1768214513 },
  { "scenarioId": 1, "type": "char_rename", "oldName": "ALICE", "newName": "ALICIA", "timestamp": 1768214513 },

  { "scenarioId": 1, "type": "line_update", "lineId": 3, "nextLineId": 15, "content": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ", "timestamp": 1768216170 },
  { "scenarioId": 1, "type": "line_update", "lineId": 15, "nextLineId": 16, "content": "riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ riječ", "timestamp": 1768216170 },
  { "scenarioId": 1, "type": "line_update", "lineId": 16, "nextLineId": 13, "content": "riječ riječ riječ riječ riječ", "timestamp": 1768216170 },
  { "scenarioId": 1, "type": "char_rename", "oldName": "ALICE", "newName": "ALICIA", "timestamp": 1768216170 }
];

async function popuniDB() {
  // scenario 1
  await Scenario.create({ id: POPUNI_SCENARIO_1.id, title: POPUNI_SCENARIO_1.title });

  await Line.bulkCreate(
    POPUNI_SCENARIO_1.content.map(l => ({
      scenarioId: POPUNI_SCENARIO_1.id,
      lineId: l.lineId,
      nextLineId: l.nextLineId,
      text: l.text
    }))
  );

  await Delta.bulkCreate(POPUNI_DELTAS);
}

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });

    // napuni bazu 
    await popuniDB();

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Greška pri inicijalizaciji baze/servera:", err);
    process.exit(1);
  }
})();
