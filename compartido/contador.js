/* Contador calendario reutilizable. La fecha se interpreta en hora argentina (-03:00). */
(() => {
  "use strict";
  const style = document.createElement("style");
  style.id = "eros-counter-styles";
  style.textContent = "\n.together-counter{max-width:510px;margin:-9px auto 27px;text-align:center}\n.counter-label{margin:0 0 10px;color:var(--muted);font-size:.92rem;font-weight:600}\n.counter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}\n.counter-unit{min-width:0;padding:10px 4px 8px;border:1px solid var(--line);border-radius:15px;background:var(--paper);box-shadow:0 5px 15px rgba(35,30,35,.055)}\n.counter-value{display:block;color:var(--wine);font-size:clamp(1.15rem,5vw,1.65rem);font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}\n.counter-name{display:block;margin-top:4px;color:var(--muted);font-size:clamp(.66rem,2.8vw,.76rem);line-height:1.2}\n";
  document.head.appendChild(style);

  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function diasEnMes(year, month) { return new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); }
  function sumarMeses(date, amount) {
    const index = date.getUTCFullYear() * 12 + date.getUTCMonth() + amount;
    const year = Math.floor(index / 12);
    const month = ((index % 12) + 12) % 12;
    const day = Math.min(date.getUTCDate(), diasEnMes(year, month));
    return new Date(Date.UTC(year, month, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()));
  }
  function crearUnidad(grid, id, label) {
    const unit = document.createElement("div");
    unit.className = "counter-unit";
    const value = document.createElement("span");
    value.className = "counter-value";
    value.id = id;
    value.textContent = "0";
    const name = document.createElement("span");
    name.className = "counter-name";
    name.textContent = label;
    unit.append(value, name);
    grid.appendChild(unit);
    return value;
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
    const start = new Date(Date.UTC(year, month, day));
    if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month || start.getUTCDate() !== day) return null;

    const label = document.createElement("p");
    label.className = "counter-label";
    label.textContent = text(config.etiqueta) || "Juntos desde hace";
    const grid = document.createElement("div");
    grid.className = "counter-grid";
    grid.setAttribute("aria-live", "off");
    const fields = [
      crearUnidad(grid, "counterYears", "años"),
      crearUnidad(grid, "counterMonths", "meses"),
      crearUnidad(grid, "counterDays", "días"),
      crearUnidad(grid, "counterHours", "horas"),
      crearUnidad(grid, "counterMinutes", "minutos"),
      crearUnidad(grid, "counterSeconds", "segundos")
    ];
    root.setAttribute("aria-label", "Tiempo juntos");
    root.append(label, grid);

    function update() {
      const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
      if (now < start) {
        root.hidden = true;
        return false;
      }
      let years = now.getUTCFullYear() - start.getUTCFullYear();
      let cursor = sumarMeses(start, years * 12);
      if (cursor > now) { years -= 1; cursor = sumarMeses(start, years * 12); }
      let months = (now.getUTCFullYear() - cursor.getUTCFullYear()) * 12 + now.getUTCMonth() - cursor.getUTCMonth();
      let next = sumarMeses(cursor, months);
      if (next > now) { months -= 1; next = sumarMeses(cursor, months); }
      while (sumarMeses(cursor, months + 1) <= now) {
        months += 1;
        next = sumarMeses(cursor, months);
      }
      cursor = next;
      let remaining = now.getTime() - cursor.getTime();
      const dayMs = 86400000;
      const hourMs = 3600000;
      const minuteMs = 60000;
      const days = Math.floor(remaining / dayMs); remaining -= days * dayMs;
      const hours = Math.floor(remaining / hourMs); remaining -= hours * hourMs;
      const minutes = Math.floor(remaining / minuteMs); remaining -= minutes * minuteMs;
      const seconds = Math.floor(remaining / 1000);
      [years, months, days, hours, minutes, seconds].forEach((value, index) => {
        fields[index].textContent = String(value);
      });
      root.hidden = false;
      return true;
    }

    if (!update()) return null;
    const timer = window.setInterval(update, 1000);
    return { detener() { window.clearInterval(timer); } };
  }

  window.ErosContador = Object.freeze({ montar });
})();
