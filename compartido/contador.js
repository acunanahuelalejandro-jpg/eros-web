/* Contador calendario reutilizable. La fecha se interpreta en hora argentina (-03:00). */
(() => {
  "use strict";

  const OFFSET_ARGENTINA_MS = 3 * 60 * 60 * 1000;
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
    return {
      year,
      month,
      day: Math.min(date.day, daysInMonth(year, month))
    };
  }

  function calendarDifference(start, today) {
    let years = today.year - start.year;
    let anchor = addMonthsClamped(start, years * 12);
    if (compareDates(anchor, today) > 0) years -= 1;

    anchor = addMonthsClamped(start, years * 12);
    let months = (today.year - anchor.year) * 12 + today.month - anchor.month;
    let monthAnchor = addMonthsClamped(anchor, months);
    if (compareDates(monthAnchor, today) > 0) months -= 1;

    monthAnchor = addMonthsClamped(anchor, months);
    const elapsedDays = Math.floor((dateAt(today.year, today.month, today.day) - dateAt(monthAnchor.year, monthAnchor.month, monthAnchor.day)) / 86400000);
    return { years, months, days: elapsedDays };
  }

  function compareDates(left, right) {
    return left.year - right.year || left.month - right.month || left.day - right.day;
  }

  function getArgentinaDate() {
    const date = new Date(Date.now() - OFFSET_ARGENTINA_MS);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
  }

  function makeUnit(row, value, unit) {
    const group = document.createElement("span");
    group.className = "counter-unit";
    group.setAttribute("aria-label", value + " " + unit);
    const number = document.createElement("span");
    number.className = "counter-value";
    number.textContent = String(value);
    const name = document.createElement("span");
    name.className = "counter-name";
    name.textContent = unit;
    group.append(number, name);
    row.appendChild(group);
  }

  function makeHeart(className, glyph) {
    const heart = document.createElement("span");
    heart.className = className;
    heart.setAttribute("aria-hidden", "true");
    heart.textContent = glyph;
    return heart;
  }

  function montar(root, settings) {
    if (!root) return null;
    const config = settings && typeof settings === "object" ? settings : {};
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(config.desde));
    root.replaceChildren();
    root.hidden = true;
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const parsed = dateAt(year, month, day);
    if (year < 1 || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month || parsed.getUTCDate() !== day) return null;
    const start = { year, month, day };

    const label = document.createElement("p");
    label.className = "counter-label";
    label.textContent = text(config.etiqueta).slice(0, 80) || "Juntos desde hace";
    const row = document.createElement("div");
    row.className = "counter-row";
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Tiempo juntos");
    root.append(
      makeHeart("counter-decoration", "♡"),
      makeHeart("counter-decoration", "♡"),
      makeHeart("counter-decoration", "♥"),
      label,
      row
    );

    let stopped = false;
    function update() {
      if (stopped) return false;
      const today = getArgentinaDate();
      if (compareDates(today, start) < 0) {
        root.hidden = true;
        return false;
      }

      const elapsed = calendarDifference(start, today);
      row.replaceChildren();
      const units = [];
      if (elapsed.years > 0) units.push([elapsed.years, elapsed.years === 1 ? "año" : "años"]);
      if (elapsed.months > 0) units.push([elapsed.months, elapsed.months === 1 ? "mes" : "meses"]);
      units.push([elapsed.days, elapsed.days === 1 ? "día" : "días"]);
      units.forEach(([value, unit], index) => {
        if (index) row.appendChild(makeHeart("counter-separator", "♥"));
        makeUnit(row, value, unit);
      });
      root.hidden = false;
      return true;
    }

    update();
    const timer = window.setInterval(update, 60000);
    return {
      detener() {
        stopped = true;
        window.clearInterval(timer);
      }
    };
  }

  window.ErosContador = Object.freeze({ montar });
})();
