// Tally tracker. Drop this on a page with:
//   <script defer src="https://your-tally/tracker.js" data-site="mysite"></script>
//
// It sends one pageview when the page loads and one on every SPA navigation.
// No cookies, no localStorage, nothing persisted on the visitor's machine.
(function () {
  "use strict";

  var script = document.currentScript;
  var site = script && script.getAttribute("data-site");
  // where to POST -- defaults to the host that served this script
  var endpoint =
    (script && script.getAttribute("data-endpoint")) ||
    (script ? new URL(script.src).origin : "") + "/api/collect";

  if (!site) {
    console.warn("[tally] missing data-site attribute, not tracking");
    return;
  }

  // bow out for bots and for anyone who asked not to be tracked
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
  if (/bot|crawl|spider|HeadlessChrome/i.test(navigator.userAgent)) return;

  function send(name) {
    var payload = JSON.stringify({
      site: site,
      name: name,
      path: location.pathname,
      referrer: document.referrer || null,
    });

    // sendBeacon survives the page unloading and doesn't block navigation.
    // Fall back to fetch where it's missing (older Safari).
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, payload);
    } else {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(function () {});
    }
  }

  function pageview() {
    send("pageview");
  }

  // Single-page apps swap the URL without a reload, so wrap the history API
  // and re-count on each route change. lastPath guards against duplicate fires.
  var lastPath = location.pathname;
  function onRouteChange() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    pageview();
  }

  ["pushState", "replaceState"].forEach(function (fn) {
    var original = history[fn];
    history[fn] = function () {
      var ret = original.apply(this, arguments);
      onRouteChange();
      return ret;
    };
  });
  window.addEventListener("popstate", onRouteChange);

  // initial hit -- wait for the document so document.referrer is populated
  if (document.readyState === "complete" || document.readyState === "interactive") {
    pageview();
  } else {
    document.addEventListener("DOMContentLoaded", pageview);
  }

  // let pages report custom events: window.tally('signup')
  window.tally = send;
})();
