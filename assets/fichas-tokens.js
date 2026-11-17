// Componente: fichas de tokens.
// Uso: <div class="tokens" data-tokens='[[65717,"Hola"],[27429," mundo"]]'></div>
// Cada par es [id, pieza]. Una pieza que empieza por "0x" se muestra como bytes sueltos
// (trozo de un carácter UTF-8 que no es texto válido por sí solo).
// Opcional: data-especiales="248045,248046" marca esos IDs como tokens especiales.
(function () {
  function visible(p) {
    return p.replace(/ /g, "·").replace(/\n/g, "↵").replace(/\t/g, "→");
  }
  document.querySelectorAll(".tokens[data-tokens]").forEach(function (cont) {
    var datos = JSON.parse(cont.dataset.tokens);
    var especiales = (cont.dataset.especiales || "").split(",").filter(Boolean).map(Number);
    datos.forEach(function (par, i) {
      var id = par[0], pieza = par[1];
      var f = document.createElement("span");
      f.className = "ficha c" + (i % 4);
      if (especiales.indexOf(id) !== -1) f.className += " especial";
      var esBytes = pieza.indexOf("0x") === 0;
      if (esBytes) f.className += " bytes";
      var p = document.createElement("span");
      p.className = "pieza";
      p.textContent = esBytes ? pieza : visible(pieza);
      var n = document.createElement("span");
      n.className = "id";
      n.textContent = id;
      f.appendChild(p); f.appendChild(n);
      f.title = "id " + id + " → " + JSON.stringify(pieza);
      cont.appendChild(f);
    });
    var t = document.createElement("span");
    t.className = "total";
    t.textContent = datos.length + (datos.length === 1 ? " token" : " tokens");
    cont.appendChild(t);
  });
})();
