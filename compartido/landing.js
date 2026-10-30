(() => {
  'use strict';
  const aliases = new Set(['#pedido', '#armar', '#armador']);
  if (aliases.has(location.hash.toLowerCase())) {
    const destination = new URL('armador/', document.baseURI);
    destination.search = location.search;
    location.replace(destination.href);
    return;
  }
  const prices = window.ErosPrecios?.tabla;
  if (prices) {
    const amount = value => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
    document.querySelectorAll('[data-model-start]').forEach(el => {
      const model = prices.models[el.dataset.modelStart];
      if (model) el.textContent = 'Desde ' + amount(Math.min(...Object.values(model.prices)));
    });
    document.querySelectorAll('[data-model-prices]').forEach(el => {
      const model = prices.models[el.dataset.modelPrices];
      if (!model) return;
      el.replaceChildren();
      Object.entries(prices.durations).forEach(([key, label]) => {
        const line = document.createElement('span');
        line.textContent = label + ' ' + amount(model.prices[key]);
        el.append(line);
      });
    });
    document.querySelectorAll('[data-extra-inline], [data-extra-price]').forEach(el => {
      const key = el.dataset.extraInline || el.dataset.extraPrice;
      if (prices.extras[key]) el.textContent = (el.hasAttribute('data-extra-price') ? '+' : '') + amount(prices.extras[key]);
    });
  }
  document.querySelectorAll('.whatsapp-link').forEach(link => {
    link.href = 'https://wa.me/5491161360254?text=' + encodeURIComponent(link.dataset.message || 'Hola, tengo una consulta sobre Eros Web.');
  });
  const year = document.getElementById('current-year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
