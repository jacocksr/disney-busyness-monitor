
(() => {
  function applyWeatherPills() {
    document.querySelectorAll('#parkGrid .park-card').forEach(card => {
      const secondary = card.querySelector('.pulse-secondary');
      if (secondary && !secondary.querySelector('.pulse-pill-label')) {
        const label = document.createElement('span');
        label.className = 'pulse-pill-label';
        label.textContent = secondary.textContent;
        secondary.title = secondary.textContent;
        secondary.replaceChildren(label);
      }
      const footer = card.querySelector('.pulse-footer');
      if (!footer || footer.classList.contains('pulse-weather-pill')) return;
      const weather = footer.querySelector('.pulse-weather');
      if (!weather) return;
      const key = card.dataset.parkKey;
      const parkName = parkData.parks[key]?.name || 'this park';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pulse-footer pulse-weather-pill';
      button.setAttribute('aria-label', 'View weather details for ' + parkName);
      button.setAttribute('aria-controls', 'weatherPanel');
      const reading = document.createElement('span');
      reading.className = 'pulse-weather';
      reading.dataset.parkKey = key;
      reading.innerHTML = weather.innerHTML;
      reading.title = weather.title;
      const detail = document.createElement('span');
      detail.className = 'pulse-weather-details';
      detail.textContent = 'Details ›';
      button.append(reading, detail);
      button.onclick = event => {
        event.stopPropagation();
        selectPark(key);
        const panel = document.getElementById('weatherPanel');
        if (!panel) return;
        panel.setAttribute('tabindex', '-1');
        panel.focus({ preventScroll: true });
        panel.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start'
        });
      };
      footer.replaceWith(button);
    });
  }
  const previousRenderCards = renderCards;
  renderCards = function(...args) {
    const result = previousRenderCards(...args);
    applyWeatherPills();
    return result;
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyWeatherPills);
  } else {
    applyWeatherPills();
  }
})();
