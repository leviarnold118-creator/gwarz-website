// ---- Edit these values as your server details change ----
const CONFIG = {
  serverName: "GWARZ REVENGE | HIGH LOOT | PVP | NAMALSK | 6 MAN | NEW SERVER",
  map: "Namalsk",
  ip: "172.93.100.11",
  port: "2402",       // game connect port, shown to players
  queryPort: "2403",  // Steam QUERY port
  discordUrl: "https://discord.gg/8kvpTD9wdA",
  cashAppUrl: "https://cash.app/$leviarnold21",
  paypalUrl: "https://paypal.me/chinachik",
  dzsaDownloadUrl: "https://dayzsalauncher.com/",
};
// -----------------------------------------------------------

// Official DZSA Launcher join link (generated the same way as the "Join Server"
// tool on dayzsalauncher.com). If DZSA is installed, the OS hands this link to
// the launcher and it opens straight to the server. If it's not installed, the
// link just opens dayzsalauncher.com's join page in a new tab — which is why we
// always show the "Download DZSA Launcher" link next to it too.
function connectUrl() {
  if (CONFIG.ip === "TBA" || CONFIG.queryPort === "TBA") return "#";
  return `https://join.dayzsalauncher.com/${CONFIG.ip}:${CONFIG.queryPort}`;
}

function ipPortText() {
  if (CONFIG.ip === "TBA" || CONFIG.port === "TBA") return "TBA";
  return `${CONFIG.ip}:${CONFIG.port}`;
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-discord-link]").forEach(el => el.href = CONFIG.discordUrl);
  document.querySelectorAll("[data-cashapp-link]").forEach(el => el.href = CONFIG.cashAppUrl);
  document.querySelectorAll("[data-paypal-link]").forEach(el => el.href = CONFIG.paypalUrl);
  document.querySelectorAll("[data-connect-link]").forEach(el => el.href = connectUrl());
  document.querySelectorAll("[data-dzsa-download-link]").forEach(el => el.href = CONFIG.dzsaDownloadUrl);

  document.querySelectorAll("[data-server-name]").forEach(el => el.textContent = CONFIG.serverName);
  document.querySelectorAll("[data-server-map]").forEach(el => el.textContent = CONFIG.map);
  document.querySelectorAll("[data-server-ip]").forEach(el => el.textContent = ipPortText());

  const yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const copyBtn = document.querySelector("[data-copy-btn]");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(ipPortText());
        const original = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = original), 1500);
      } catch (err) {
        // Clipboard API unavailable — silently ignore.
      }
    });
  }

  // Intro video mute toggle — talks to the YouTube embed via its postMessage API
  // (enablejsapi=1 on the iframe src is what allows this).
  const introVideo = document.getElementById("gwarz-intro-video");
  const muteToggle = document.getElementById("video-mute-toggle");
  if (introVideo && muteToggle) {
    let muted = true;
    muteToggle.addEventListener("click", () => {
      muted = !muted;
      introVideo.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: muted ? "mute" : "unMute", args: [] }),
        "https://www.youtube.com"
      );
      muteToggle.textContent = muted ? "🔇" : "🔊";
    });
  }
});
