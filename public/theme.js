// Runs before first paint so a saved look never flashes the wrong colors.
// Skin: "terminal" (default) or "pro". Theme (pro only): "light" or "dark", else the OS setting.
(function () {
  var root = document.documentElement;
  var skin = "terminal";
  try {
    var theme = localStorage.getItem("catchup.theme");
    if (theme === "light" || theme === "dark") root.dataset.theme = theme;
    if (localStorage.getItem("catchup.skin") === "pro") skin = "pro";
  } catch (e) { /* storage blocked: use the defaults */ }
  root.dataset.skin = skin;
})();
