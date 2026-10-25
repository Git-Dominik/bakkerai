const themeToggle = document.getElementById("theme-toggle");
const root = document.documentElement;

function applyTheme(isDark) {
  root.classList.toggle("dark-theme", isDark);
  if (!themeToggle) return;

  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute(
    "aria-label",
    isDark ? "Schakel naar licht thema" : "Schakel naar donker thema",
  );
  themeToggle.title = isDark ? "Licht thema" : "Donker thema";
}

let savedTheme = root.classList.contains("dark-theme");
try {
  savedTheme = localStorage.getItem("bakkerbot-theme") === "dark";
} catch {}
applyTheme(savedTheme);

themeToggle?.addEventListener("click", () => {
  const isDark = !root.classList.contains("dark-theme");
  applyTheme(isDark);
  try {
    localStorage.setItem("bakkerbot-theme", isDark ? "dark" : "light");
  } catch {}
});
