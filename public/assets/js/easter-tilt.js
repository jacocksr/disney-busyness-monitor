/* Park Pulse: device tilt and shake input for the Pulse Easter egg (consumed by easter.js).
   Exposes window.ParkPulseTilt. Tilt comes from deviceorientation, shake from devicemotion.
   iOS Safari requires permission requested from a user gesture; other browsers just deliver events.
   Output gravity is in screen coordinates: x is right, y is down, each in -1..1 (upright phone = 0, 1). */
(function () {
  'use strict';
  var SMOOTH = 0.18, SHAKE_MIN = 12, SHAKE_MAX = 30, SHAKE_GAP = 350, NODATA_MS = 1500, DEG = Math.PI / 180;
  var gx = 0, gy = 1, active = false, handlers = null, gotData = false, lastShake = 0, nodataTimer = 0;

  function hasOrientation() { return typeof window.DeviceOrientationEvent !== 'undefined'; }
  function hasMotion() { return typeof window.DeviceMotionEvent !== 'undefined'; }
  function supported() { return window.isSecureContext !== false && hasOrientation(); }
  function needsPermission() {
    return hasOrientation() && typeof window.DeviceOrientationEvent.requestPermission === 'function';
  }
  function ask(api) {
    if (!api || typeof api.requestPermission !== 'function') return Promise.resolve('granted');
    try {
      return Promise.resolve(api.requestPermission()).catch(function () { return 'denied'; });
    } catch (err) {
      return Promise.resolve('denied');
    }
  }
  /* Call from a click handler. Both requests are issued synchronously so the gesture still counts. */
  function request() {
    if (!supported()) return Promise.resolve({ tilt: 'unsupported', shake: 'unsupported' });
    var o = ask(window.DeviceOrientationEvent);
    var m = hasMotion() ? ask(window.DeviceMotionEvent) : Promise.resolve('unsupported');
    return Promise.all([o, m]).then(function (r) { return { tilt: r[0], shake: r[1] }; });
  }
  function screenAngle() {
    var a = window.screen && screen.orientation && typeof screen.orientation.angle === 'number'
      ? screen.orientation.angle
      : (typeof window.orientation === 'number' ? window.orientation : 0);
    return (a || 0) * DEG;
  }
  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    gotData = true;
    var b = e.beta * DEG, g = e.gamma * DEG;
    /* Gravity in device axes (x right, y up the screen) from the W3C beta/gamma rotation. */
    var dx = Math.cos(b) * Math.sin(g), dy = -Math.sin(b);
    var a = screenAngle(), ca = Math.cos(a), sa = Math.sin(a);
    var tx = dx * ca + dy * sa, ty = -dy * ca - dx * sa;
    gx += (tx - gx) * SMOOTH;
    gy += (ty - gy) * SMOOTH;
    if (handlers && handlers.onTilt) handlers.onTilt(gx, gy);
  }
  function onMotion(e) {
    var a = e.acceleration, m, h;
    if (a && a.x != null && a.y != null && a.z != null) {
      m = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    } else {
      h = e.accelerationIncludingGravity;
      if (!h || h.x == null || h.y == null || h.z == null) return;
      m = Math.abs(Math.sqrt(h.x * h.x + h.y * h.y + h.z * h.z) - 9.81);
    }
    var now = Date.now();
    if (m < SHAKE_MIN || now - lastShake < SHAKE_GAP) return;
    lastShake = now;
    if (handlers && handlers.onShake) handlers.onShake(Math.min(1, (m - SHAKE_MIN) / (SHAKE_MAX - SHAKE_MIN)));
  }
  function stop() {
    window.removeEventListener('deviceorientation', onOrientation);
    window.removeEventListener('devicemotion', onMotion);
    clearTimeout(nodataTimer);
    active = false;
    handlers = null;
  }
  /* handlers: { onTilt(gx, gy), onShake(strength 0..1), onStatus('unsupported' | 'nodata') } */
  function start(h) {
    if (active) stop();
    if (!supported()) {
      if (h && h.onStatus) h.onStatus('unsupported');
      return false;
    }
    handlers = h || {};
    active = true;
    gotData = false;
    gx = 0;
    gy = 1;
    window.addEventListener('deviceorientation', onOrientation);
    if (hasMotion()) window.addEventListener('devicemotion', onMotion);
    nodataTimer = setTimeout(function () {
      if (active && !gotData && handlers && handlers.onStatus) handlers.onStatus('nodata');
    }, NODATA_MS);
    return true;
  }

  window.ParkPulseTilt = { supported: supported, needsPermission: needsPermission, request: request, start: start, stop: stop };
})();
