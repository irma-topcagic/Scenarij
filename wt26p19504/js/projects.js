document.addEventListener("DOMContentLoaded", () => {
  const grid = document.querySelector(".grid");
  const novaKartica = document.querySelector(".nova-kartica");
  const btnNovi = document.querySelector(".dugme-novi-projekat");

  if (!grid || !novaKartica || !btnNovi) {
    console.error("Nedostaje .grid ili .nova-kartica ili .dugme-novi-projekat u HTML-u.");
    return;
  }

  function addCard(title, id) {
    const el = document.createElement("article");
    el.className = "kartica";
    el.innerHTML = `
      <h3 class="naziv-scenarija">${title}</h3>
      <p class="opis-scenarija">Novo</p>
      <div class="detalji">
        <p><strong>ID:</strong> ${id}</p>
        <p><strong>Status:</strong> Kreiran</p>
      </div>
    `;

    el.addEventListener("click", () => {
      
      window.location.href = `writing.html?id=${id}`;
    });

    grid.insertBefore(el, novaKartica);
  }

  function createScenario() {
    const title = prompt("Unesite naziv scenarija:");
    if (!title || !title.trim()) return;

    if (typeof PoziviAjaxFetch === "undefined") {
      alert("PoziviAjaxFetch nije učitan. Provjeri da li je ../js/poziviAjaxFetch.js uključen prije projects.js.");
      return;
    }

    PoziviAjaxFetch.postScenario(title.trim(), (status, data) => {
      if (status !== 200) {
        alert(data?.message || "Ne mogu kreirati scenarij.");
        return;
      }

      
      addCard(data.title || title.trim(), data.id);

      
    });
  }

  btnNovi.addEventListener("click", createScenario);
  novaKartica.addEventListener("click", createScenario);
});
