/* Contador compartido. Las fechas de calendario se interpretan en hora argentina (-03:00). */
(() => {
  "use strict";

  const OFFSET_ARGENTINA_MS = 3 * 60 * 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;
  const text = (value) => typeof value === "string" ? value.trim() : "";

  function dateAt(year, month, day) {
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month, day);
    return date;
  }

  function daysInMonth(year, month) {
    return dateAt(year, month + 1, 0).getUTCDate();
  }

  function addMonthsClamped(date, amount) {
    const index = date.year * 12 + date.month + amount;
    const year = Math.floor(index / 12);
    const month = ((index % 12) + 12) % 12;
    return { year, month, day:Math.min(date.day, daysInMonth(year, month)) };
  }

  function compareDates(left, right) {
    return left.year - right.year || left.month - right.month || left.day - right.day;
  }

  function argentinaNow(now = Date.now()) {
    const date = new Date(now - OFFSET_ARGENTINA_MS);
    return { year:date.getUTCFullYear(), month:date.getUTCMonth(), day:date.getUTCDate() };
  }

  function calendarDifference(start, today) {
    let years = today.year - start.year;
    let anchor = addMonthsClamped(start, years * 12);
    if (compareDates(anchor, today) > 0) years -= 1;

    anchor = addMonthsClamped(start, years * 12);
    let months = (today.year - anchor.year) * 12 + today.month - anchor.month;
    if (compareDates(addMonthsClamped(anchor, months), today) > 0) months -= 1;

    const monthAnchor = addMonthsClamped(anchor, months);
    const days = Math.floor((dateAt(today.year, today.month, today.day) - dateAt(monthAnchor.year, monthAnchor.month, monthAnchor.day)) / 86400000);
    return { years, months, days };
  }

  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const utcDate = dateAt(year, month, day);
    if (year < 1 || utcDate.getUTCFullYear() !== year || utcDate.getUTCMonth() !== month || utcDate.getUTCDate() !== day) return null;
    return {
      parts:{ year, month, day },
      instant:new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00-03:00`).getTime()
    };
  }

  function previewExampleDate(now) {
    const today = argentinaNow(now);
    const lastYear = addMonthsClamped(today, -12);
    return {
      parts:lastYear,
      instant:new Date(`${String(lastYear.year).padStart(4, "0")}-${String(lastYear.month + 1).padStart(2, "0")}-${String(lastYear.day).padStart(2, "0")}T00:00:00-03:00`).getTime()
    };
  }

  function makeHeart(className, glyph) {
    const heart = document.createElement("span");
    heart.className = className;
    heart.setAttribute("aria-hidden", "true");
    heart.textContent = glyph;
    return heart;
  }

  function makeUnit(row, name) {
    const group = document.createElement("span");
    group.className = "counter-unit";
    const number = document.createElement("span");
    number.className = "counter-value";
    number.textContent = "0";
    number.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "counter-name";
    label.textContent = name;
    group.append(number, label);
    row.append(group);
    return { group, number };
  }

  function animateValue(node, value) {
    const next = String(value);
    if (node.textContent === next) return;
    node.textContent = next;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    node.classList.remove("is-changing");
    void node.offsetWidth;
    node.classList.add("is-changing");
  }

  function formatHours(value) {
    return new Intl.NumberFormat("es-AR", { maximumFractionDigits:0 }).format(value);
  }

  function plural(value, singular, pluralForm) {
    return `${value} ${value === 1 ? singular : pluralForm}`;
  }

  function calendarText(elapsed) {
    const parts = [];
    if (elapsed.years > 0) parts.push(plural(elapsed.years, "año", "años"));
    if (elapsed.months > 0) parts.push(plural(elapsed.months, "mes", "meses"));
    parts.push(plural(elapsed.days, "día", "días"));
    return parts.join(", ");
  }

  function montar(root, settings) {
    if (!root) return null;
    const config = settings && typeof settings === "object" ? settings : {};
    const previewMode = new URLSearchParams(location.search).get("preview") === "1";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const labelText = text(config.etiqueta).slice(0, 80) || "Juntos desde hace";
    const rawDate = text(config.desde);
    let parsed = parseDate(rawDate);
    let isExample = false;

    root.replaceChildren();
    root.hidden = true;
    root.classList.remove("is-preview-example");
    if (!parsed && !rawDate && previewMode && config.activo === true) {
      parsed = previewExampleDate(Date.now());
      isExample = true;
    }
    if (!parsed) return null;

    const now = Date.now();
    if (parsed.instant > now) return null;

    const label = document.createElement("p");
    label.className = "counter-label";
    label.textContent = labelText;

    const note = document.createElement("p");
    note.className = "counter-note";
    note.textContent = "Tu fecha acá";
    note.hidden = !isExample;

    const row = document.createElement("div");
    row.className = "counter-row";
    row.setAttribute("role", "timer");
    row.setAttribute("aria-live", "off");

    const hours = makeUnit(row, "horas");
    row.append(makeHeart("counter-separator", "♥"));
    const minutes = makeUnit(row, "minutos");
    row.append(makeHeart("counter-separator", "♥"));
    const seconds = makeUnit(row, "segundos");

    const calendar = document.createElement("p");
    calendar.className = "counter-calendar";

    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Tiempo juntos");
    root.classList.toggle("is-preview-example", isExample);
    root.append(
      makeHeart("counter-decoration counter-decoration-one", "♡"),
      makeHeart("counter-decoration counter-decoration-two", "♡"),
      makeHeart("counter-decoration counter-decoration-three", "♥"),
      label,
      note,
      row,
      calendar
    );

    let stopped = false;
    function update() {
      if (stopped) return false;
      const currentTime = Date.now();
      const elapsedMs = currentTime - parsed.instant;
      if (elapsedMs < 0) {
        root.hidden = true;
        return false;
      }

      const totalSeconds = Math.floor(elapsedMs / 1000);
      const elapsedHours = Math.floor(elapsedMs / HOUR_MS);
      const elapsedMinutes = Math.floor(totalSeconds / 60) % 60;
      const elapsedSeconds = totalSeconds % 60;
      const formattedHours = formatHours(elapsedHours);
      const paddedMinutes = String(elapsedMinutes).padStart(2, "0");
      const paddedSeconds = String(elapsedSeconds).padStart(2, "0");
      animateValue(hours.number, formattedHours);
      animateValue(minutes.number, paddedMinutes);
      animateValue(seconds.number, paddedSeconds);
      hours.group.setAttribute("aria-label", plural(elapsedHours, "hora", "horas"));
      minutes.group.setAttribute("aria-label", plural(elapsedMinutes, "minuto", "minutos"));
      seconds.group.setAttribute("aria-label", plural(elapsedSeconds, "segundo", "segundos"));
      calendar.textContent = calendarText(calendarDifference(parsed.parts, argentinaNow(currentTime)));
      row.setAttribute("aria-label", `${formattedHours} horas, ${paddedMinutes} minutos y ${paddedSeconds} segundos`);
      root.hidden = false;
      return true;
    }

    update();
    const timer = window.setInterval(() => {
      if (!update()) {
        window.clearInterval(timer);
        stopped = true;
      }
    }, 1000);

    return {
      detener() {
        stopped = true;
        window.clearInterval(timer);
      }
    };
  }

  window.ErosContador = Object.freeze({ montar });
})();
