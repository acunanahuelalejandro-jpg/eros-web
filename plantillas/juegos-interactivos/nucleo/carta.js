/* Carta reutilizable: los textos se crean siempre con textContent. */
(() => {
  "use strict";
  const svgNS = "http://www.w3.org/2000/svg";
  const text = (value) => typeof value === "string" ? value.trim() : "";
  const safeFile = (value) => {
    const path = text(value).replace(/\\/g, "/");
    if (!path || path.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.split("/").includes("..")) return "";
    return path;
  };

  function crearPetalos() {
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "letter-petals reveal");
    svg.setAttribute("viewBox", "0 0 60 36");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const d = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";
    [[2,9,.62],[21,1,.72],[40,9,.62]].forEach(([x,y,scale]) => {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", d);
      path.setAttribute("transform", "translate(" + x + " " + y + ") scale(" + scale + ")");
      svg.appendChild(path);
    });
    return svg;
  }
  function crearDibujoCorazon() {
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "photo-heart-doodle");
    svg.setAttribute("viewBox", "0 0 88 82");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const shapes = [
      ["doodle-heart", "M44 70 C38 65 13 48 9 32 C5 17 17 9 29 12 C36 14 41 19 44 26 C48 17 57 10 68 12 C80 15 84 27 79 38 C74 53 55 66 44 70 Z"],
      ["doodle-echo", "M43 67 C31 58 15 45 13 32 C11 23 16 17 24 16"],
      ["doodle-vein", "M22 25 C28 19 35 22 39 29 M51 25 C57 19 64 20 68 26"],
      ["doodle-spark", "M7 43l-4 1 M11 54l-3 3 M80 47l4 1 M76 58l3 3"]
    ];
    shapes.forEach(([name, d]) => {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("class", name);
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }
  function abrirFoto(image) {
    const dialog = document.getElementById("photoDialog");
    const zoom = document.getElementById("lightboxImage");
    zoom.src = image.currentSrc || image.src;
    zoom.alt = image.alt;
    if (typeof dialog.showModal === "function") dialog.showModal();
  }
  function prepararLightbox() {
    const dialog = document.getElementById("photoDialog");
    const zoom = document.getElementById("lightboxImage");
    const close = () => { if (dialog.open) dialog.close(); };
    document.getElementById("closePhoto").addEventListener("click", close);
    zoom.addEventListener("click", close);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    dialog.addEventListener("close", () => { zoom.removeAttribute("src"); zoom.alt = ""; });
  }
  function agregarRevelados() {
    const items = document.querySelectorAll("#letterScreen .reveal");
    if (!("IntersectionObserver" in window)) { items.forEach((item) => item.classList.add("is-visible")); return; }
    const observer = new IntersectionObserver((entries, current) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); current.unobserve(entry.target); }
      });
    }, { threshold: .12, rootMargin: "0px 0px -20px 0px" });
    items.forEach((item) => observer.observe(item));
  }
  function mostrar(datos) {
    const persona = text(datos.para);
    const autor = text(datos.de);
    const carta = datos.carta && typeof datos.carta === "object" ? datos.carta : {};
    const blocks = Array.isArray(carta.bloques) ? carta.bloques : [];
    const titulo = text(carta.titulo) || (persona ? "Una carta para " + persona : "Una carta para vos");
    const heading = document.getElementById("letterTitle");
    const card = document.getElementById("letterCard");
    const blockRoot = document.getElementById("letterBlocks");
    const closing = document.getElementById("closingBlock");
    const signature = document.getElementById("signature");
    heading.textContent = titulo;
    document.title = titulo + " | Eros Web";
    card.setAttribute("aria-label", persona ? "Carta para " + persona : "Carta para vos");
    blockRoot.replaceChildren();
    let photoCount = 0;
    let textCount = 0;
    blocks.forEach((block) => {
      if (!block || typeof block !== "object") return;
      const paragraphText = text(block.texto);
      if (paragraphText) {
        if (textCount > 0) blockRoot.appendChild(crearPetalos());
        const p = document.createElement("p");
        p.className = "letter-text reveal";
        p.textContent = paragraphText;
        blockRoot.appendChild(p);
        textCount += 1;
        return;
      }
      const path = safeFile(block.foto);
      if (!path || photoCount >= 3) return;
      const figure = document.createElement("figure");
      figure.className = "photo-card reveal photo-" + (photoCount + 1) + " " + (photoCount % 2 === 0 ? "photo-left" : "photo-right");
      figure.style.setProperty("--tilt", ["-4deg", "3deg", "5deg"][photoCount]);
      const img = document.createElement("img");
      img.src = path;
      img.alt = text(block.alt) || (persona ? "Foto con " + persona : "Foto de un momento especial");
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", () => figure.remove(), { once: true });
      img.addEventListener("click", () => abrirFoto(img));
      figure.append(img, crearDibujoCorazon());
      blockRoot.appendChild(figure);
      photoCount += 1;
    });
    signature.textContent = text(datos.firma);
    closing.hidden = !text(datos.firma);
    document.getElementById("siteFooter").textContent = autor ? "Hecho con ♡ por " + autor + " · Eros Web" : "Eros Web";
    agregarRevelados();
    prepararLightbox();
  }
  window.NucleoCarta = { mostrar };
})();
