/* Loaded only when GA_MEASUREMENT_ID is set on the server.
   Visitors who send a Global Privacy Control or Do Not Track signal are not measured. */
(function () {
  'use strict';
  var tag = document.currentScript;
  var id = tag && tag.getAttribute('data-ga');
  if (!id || !/^G-[A-Z0-9]+$/.test(id)) return;
  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id);
  var loader = document.createElement('script');
  loader.async = true;
  loader.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(loader);
})();
