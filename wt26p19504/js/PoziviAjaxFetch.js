
const PoziviAjaxFetch = (function () {
  function request(method, url, body, callback) {
    const options = { method, headers: {} };
    if (body !== null && body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    fetch(url, options)
  .then(async (res) => {
    let obj;
    try {
      obj = await res.json();          
    } catch (e) {
      obj = { message: "Neispravan JSON odgovor." };
    }
    callback(res.status, obj);
  })
  .catch((err) => callback(0, { message: err?.message || String(err) }));
  }

  return {
    postScenario: function (title, callback) {
      request("POST", "/api/scenarios", { title }, callback);
    },

    getScenario: function (scenarioId, callback) {
      request("GET", `/api/scenarios/${scenarioId}`, null, callback);
    },

    lockLine: function (scenarioId, lineId, userId, callback) {
      request("POST", `/api/scenarios/${scenarioId}/lines/${lineId}/lock`, { userId }, callback);
    },

    updateLine: function (scenarioId, lineId, userId, newText, callback) {
     
      request("PUT", `/api/scenarios/${scenarioId}/lines/${lineId}`, { userId, newText }, callback);
    },

    lockCharacter: function (scenarioId, characterName, userId, callback) {
      request("POST", `/api/scenarios/${scenarioId}/characters/lock`, { userId, characterName }, callback);
    },

    updateCharacter: function (scenarioId, userId, oldName, newName, callback) {
      request("POST", `/api/scenarios/${scenarioId}/characters/update`, { userId, oldName, newName }, callback);
    },

    getDeltas: function (scenarioId, since, callback) {
      request("GET", `/api/scenarios/${scenarioId}/deltas?since=${encodeURIComponent(since || 0)}`, null, callback);
    }
  };
})();
