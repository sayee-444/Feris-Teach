// Componente: quiz de opción única y predicción numérica, con feedback inmediato.
//
// Quiz:
//   <div class="quiz">
//     <p class="q">Pregunta</p>
//     <div class="opciones"><button>A</button><button data-ok>B</button></div>
//     <p class="explica">Por qué B es la correcta.</p>
//   </div>
//
// Predicción (el alumno escribe un número antes de ver la respuesta):
//   <div class="prediccion" data-respuesta="3">
//     <p class="q">¿Cuántos tokens…?</p>
//     <p class="explica">Explicación que aparece al responder.</p>
//   </div>
//
// Si existe <span class="marcador"></span> muestra aciertos / total.
(function () {
  var aciertos = 0, respondidas = 0;
  var total = document.querySelectorAll(".quiz, .prediccion").length;
  var marcador = document.querySelector(".marcador");
  function actualizar(ok) {
    respondidas++; if (ok) aciertos++;
    if (marcador) marcador.textContent = aciertos + " / " + respondidas + " de " + total;
  }
  if (marcador) marcador.textContent = "0 / 0 de " + total;

  document.querySelectorAll(".quiz").forEach(function (q) {
    var botones = q.querySelectorAll(".opciones button");
    botones.forEach(function (b) {
      b.addEventListener("click", function () {
        if (q.classList.contains("respondida")) return;
        var ok = b.hasAttribute("data-ok");
        b.classList.add(ok ? "correcta" : "incorrecta");
        botones.forEach(function (o) {
          if (o.hasAttribute("data-ok")) o.classList.add("correcta");
          o.disabled = true;
        });
        q.classList.add("respondida");
        actualizar(ok);
      });
    });
  });

  document.querySelectorAll(".prediccion").forEach(function (p) {
    var resp = Number(p.dataset.respuesta);
    var explica = p.querySelector(".explica");
    var fila = document.createElement("div");
    var input = document.createElement("input");
    input.type = "number"; input.min = "0"; input.placeholder = "?";
    var btn = document.createElement("button");
    btn.textContent = "Comprobar";
    var ver = document.createElement("span");
    ver.className = "veredicto";
    fila.appendChild(input); fila.appendChild(document.createTextNode(" ")); fila.appendChild(btn); fila.appendChild(ver);
    p.insertBefore(fila, explica);
    function comprobar() {
      if (p.classList.contains("respondida") || input.value === "") return;
      var ok = Number(input.value) === resp;
      ver.textContent = ok ? "¡Exacto! " + resp : "Son " + resp;
      ver.className = "veredicto " + (ok ? "ok" : "mal");
      input.disabled = true; btn.disabled = true;
      p.classList.add("respondida");
      actualizar(ok);
    }
    btn.addEventListener("click", comprobar);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") comprobar(); });
  });
})();
