// Runs before first paint so a saved theme never flashes the wrong colors.
try {
  const theme = localStorage.getItem("catchup.theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch { /* follows the OS setting */ }
