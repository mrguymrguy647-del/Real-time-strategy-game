// Runs the bundled modules inside a plain page (tools/bundle-single.mjs, ARCHITECTURE T-18).
// Every module is a function (exports, require, module); require() resolves "./x.js" paths against
// the id of the module that asks. Nothing here touches the network, so the page works from a file.
(function () {
  'use strict';
  var defs = /*__MODULES__*/;
  var loaded = {};

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
