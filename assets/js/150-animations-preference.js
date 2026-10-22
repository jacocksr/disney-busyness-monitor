/* Park Pulse decorative motion preference. Load early, after theme bootstrap. */
(() => {
  'use strict';
  if (window.ParkPulseMotion) return;

  const STORAGE_KEY = 'wdw_animations_enabled';
  const systemPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let storageAvailable = true;
  let preferredEnabled = readPreference();
  let lastEffective;
  let control = null;
  let stateText = null;
  let helpText = null;
  let controlLabel = null;

  function readPreference() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      storageAvailable = true;
      return saved !== 'false';
    } catch (error) {
      storageAvailable = false;
      return true;
    }
  }

  function enabled() {
    return preferredEnabled && !systemPreference.matches;
  }

  function syncControl() {
    if (!control) return;
    control.checked = enabled();
    control.disabled = systemPreference.matches;
    stateText.textContent = enabled() ? 'On' : 'Off';
    controlLabel.classList.toggle('is-system-reduced', systemPreference.matches);
    let help = systemPreference.matches
      ? 'Off to respect your device’s Reduced Motion setting.'
      : 'Controls fireworks, gauge motion, and park-icon effects.';
    if (!storageAvailable) help += ' This choice applies to this page; browser storage is unavailable.';
    helpText.textContent = help;
  }

  function clearDecorativeClasses() {
    document.querySelectorAll('.park-select-btn img.emoji-pulse').forEach(image => image.classList.remove('emoji-pulse'));
    document.querySelectorAll('#parkGrid .park-card.just-clicked').forEach(card => card.classList.remove('just-clicked'));
  }

  function applyPreference() {
    const effective = enabled();
    document.documentElement.dataset.ppAnimations = effective ? 'on' : 'off';
    if (!effective) clearDecorativeClasses();
    syncControl();
    if (lastEffective !== effective) {
      lastEffective = effective;
      window.dispatchEvent(new CustomEvent('parkpulse:motionchange', {
        detail: { enabled: effective, preferredEnabled, systemReduced: systemPreference.matches }
      }));
    }
  }

  function setEnabled(value) {
    if (typeof value !== 'boolean') return false;
    preferredEnabled = value;
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
      storageAvailable = true;
    } catch (error) {
      storageAvailable = false;
    }
    applyPreference();
    return enabled();
  }

  function wrapParkPulses() {
    if (typeof pulseIconsForKey === 'function') {
      const previous = pulseIconsForKey;
      pulseIconsForKey = function(...args) {
        if (!enabled()) return;
        return previous.apply(this, args);
      };
    }
    if (typeof pulseCardForKey === 'function') {
      const previous = pulseCardForKey;
      pulseCardForKey = function(...args) {
        if (!enabled()) return;
        return previous.apply(this, args);
      };
    }
  }

  function initializeFooter() {
    wrapParkPulses();
    const footer = document.querySelector('footer');
    if (!footer || document.getElementById('ppAnimationsSwitch')) return;
    const section = document.createElement('section');
    section.className = 'pp-motion-settings';
    section.setAttribute('aria-label', 'Display Preferences');
    section.innerHTML = '<label class="pp-motion-control" for="ppAnimationsSwitch">' +
      '<span class="pp-motion-label">Animations</span>' +
      '<input type="checkbox" role="switch" class="pp-motion-input" id="ppAnimationsSwitch" aria-describedby="ppAnimationsHelp">' +
      '<span class="pp-motion-track" aria-hidden="true"></span>' +
      '<span class="pp-motion-state" aria-hidden="true">On</span>' +
      '</label><p class="pp-motion-help" id="ppAnimationsHelp" aria-live="polite"></p>';
    footer.appendChild(section);
    control = section.querySelector('input');
    stateText = section.querySelector('.pp-motion-state');
    helpText = section.querySelector('.pp-motion-help');
    controlLabel = section.querySelector('label');
    control.addEventListener('change', () => setEnabled(control.checked));
    applyPreference();
  }

  window.ParkPulseMotion = Object.freeze({
    version: '1.0.0',
    get enabled() { return enabled(); },
    get preferredEnabled() { return preferredEnabled; },
    get systemReduced() { return systemPreference.matches; },
    setEnabled
  });
  applyPreference();
  if (systemPreference.addEventListener) systemPreference.addEventListener('change', applyPreference);
  else systemPreference.addListener(applyPreference);
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY || event.key === null) {
      preferredEnabled = readPreference();
      applyPreference();
    }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeFooter, { once: true });
  else initializeFooter();
})();
