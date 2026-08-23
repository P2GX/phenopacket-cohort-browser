// Classic (non-module) script: runs even when the page is opened directly
// from disk (file://), where browsers block the module scripts and the
// WebAssembly Python engine. Shows friendly instructions instead of
// leaving the user on a dead "Python engine: starting…" screen.
(function () {
  if (location.protocol !== 'file:') return;
  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.createElement('div');
    banner.setAttribute('style',
      'position:fixed;top:0;left:0;right:0;z-index:9999;background:#0b5c6e;color:#fff;' +
      'padding:18px 24px;font-family:Calibri,Candara,sans-serif;font-size:15px;' +
      'line-height:1.55;box-shadow:0 2px 12px rgba(0,0,0,.25)');
    banner.innerHTML =
      '<strong style="font-size:16px">⚠️ Almost there — this file can’t run by double-clicking it.</strong><br>' +
      'Browsers block the built-in Python engine when a page is opened directly from disk.<br>' +
      '<b>To start the offline app:</b> double-click <b>START_MAC.command</b> (macOS; first time: ' +
      'approve it under System Settings → Privacy &amp; Security → “Open Anyway”) or ' +
      '<b>START_WINDOWS.bat</b> (Windows) in this folder — see README_OFFLINE.txt.<br>' +
      'Or simply use the online version — it also works offline after the first visit.';
    document.body.appendChild(banner);
    var status = document.getElementById('py-status');
    if (status) status.innerHTML = 'Python engine cannot start from a file:// page — see the banner above.';
  });
})();
