// Runs the bundled modules inside a plain page (tools/bundle-single.mjs, ARCHITECTURE T-18).
// Every module is a function (exports, require, module); require() resolves "./x.js" paths against
// the id of the module that asks. Nothing here touches the network, so the page works from a file.
// Phaser travels inside the page as base64 text; it is turned into a module the first time the map
// needs it (a Blob URL can be imported even from a file or a locked-down frame).
(function () {
  'use strict';
  var defs = /*__MODULES__*/;
  var loaded = {};

  globalThis.__GS_LOAD_PHASER__ = function () {
    var holder = document.getElementById('gs-phaser');
    if (!holder) return Promise.reject(new Error('This copy of the game does not carry the map engine.'));
    var text = atob(holder.textContent.trim());
    var bytes = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
    return import(url).then(
      function (mod) {
        URL.revokeObjectURL(url);
        return mod;
      },
      function (err) {
        URL.revokeObjectURL(url);
        throw err;
      },
    );
  };

  function resolve(from, spec) {
    var parts = from.split('/');
    parts.pop();
    spec.split('/').forEach(function (part) {
      if (part === '..') parts.pop();
      else if (part !== '.' && part !== '') parts.push(part);
    });
    return parts.join('/');
  }

  function load(id) {
    if (loaded[id]) return loaded[id].exports;
    var define = defs[id];
    if (!define) throw new Error('The downloaded copy is missing the module ' + id);
    var module = { exports: {} };
    loaded[id] = module;
    define(
      module.exports,
      function (spec) {
        if (spec.charAt(0) !== '.') throw new Error('"' + spec + '" is not included in the downloaded copy.');
        return load(resolve(id, spec));
      },
      module,
    );
    return module.exports;
  }

  try {
    load('main.js');
  } catch (err) {
    // The page shell carries the text for this (filled from data/i18n/en.json at build time).
    var template = document.getElementById('boot-error');
    var root = document.getElementById('app');
    var splash = document.getElementById('splash');
    if (splash) splash.remove();
    if (template && root) {
      var view = template.content.cloneNode(true);
      var details = view.querySelector('[data-details]');
      if (details) details.textContent = String(err && err.message ? err.message : err);
      var retry = view.querySelector('[data-retry]');
      if (retry) retry.addEventListener('click', function () { location.reload(); });
      root.replaceChildren(view);
    }
    throw err;
  }
})();
