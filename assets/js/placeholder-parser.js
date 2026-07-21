/*
Placeholders:
  {{player_count}}   - Online player count
  {{max_players}}    - Max player slots
  {{server_name}}    - Server software brand (e.g. Paper 1.21.4)
  {{server_version}} - Game version (e.g. 1.21.4)
  {{motd}}           - Message of the Day (plain text)
  {{player_list}}    - Comma-separated list of online players
Data is fetched from the mcsrvstat.us public API
*/

const MC_SERVER = "play.vortixmc.xyz";
const CACHE_TTL_MS = 30_000;
const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

let _cache = null;
let _pendingFetch = null;

async function fetchServerStatus() {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS)
    return _cache.data;
  if (_pendingFetch) return _pendingFetch;

  _pendingFetch = (async () => {
    const url = `https://api.mcsrvstat.us/3/${encodeURIComponent(MC_SERVER)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`mcsrvstat.us returned ${res.status}`);
    const raw = await res.json();
    const status = normalise(raw);
    _cache = { data: status, fetchedAt: Date.now() };
    _pendingFetch = null;
    return status;
  })();

  return _pendingFetch;
}

function normalise(raw) {
  if (!raw.online) {
    return {
      online: false,
      player_count: 0,
      max_players: 0,
      server_name: "Offline",
      server_version: "Unknown",
      motd: "Server is offline",
      player_list: [],
    };
  }

  const software = raw.software ?? "Minecraft";
  const version = raw.version ?? "Unknown";

  return {
    online: true,
    player_count: raw.players?.online ?? 0,
    max_players: raw.players?.max ?? 0,
    server_name: `${software} ${version}`,
    server_version: version,
    motd: (raw.motd?.clean ?? []).join("\n"),
    player_list: (raw.players?.list ?? []).map((p) => p.name),
  };
}

export async function parsePlaceholders(text) {
  if (!text.includes("{{")) return text;
  const status = await fetchServerStatus();
  return replacePlaceholders(text, status);
}

export function parsePlaceholdersSync(text) {
  if (!text.includes("{{") || !_cache) return text;
  return replacePlaceholders(text, _cache.data);
}

export async function warmCache() {
  return fetchServerStatus();
}

export async function parsePagePlaceholders() {
  if (!document.body.textContent.includes("{{")) return;

  await warmCache();
  const status = _cache.data;

  // Update status indicator and visibility of player/version boxes
  updateStatusDisplay(status);

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) =>
        node.nodeValue.includes("{{")
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    },
  );

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    node.nodeValue = await parsePlaceholders(node.nodeValue);
  }
}

function updateStatusDisplay(status) {
  const statusIndicator = document.getElementById("status-indicator");
  const playersBox = document.querySelector(".status-players");
  const versionBox = document.querySelector(".status-version");

  if (statusIndicator) {
    if (status.online) {
      statusIndicator.innerHTML =
        '<small>Status</small><strong><span class="dot-green">●</span> Online</strong>';
      if (playersBox) playersBox.style.display = "block";
      if (versionBox) versionBox.style.display = "block";
    } else {
      statusIndicator.innerHTML =
        '<small>Status</small><strong><span class="dot-red">●</span> Offline</strong>';
      if (playersBox) playersBox.style.display = "none";
      if (versionBox) versionBox.style.display = "none";
    }
  }
}

function replacePlaceholders(text, status) {
  return text.replace(PLACEHOLDER_RE, (_match, key) => {
    switch (key) {
      case "player_count":
        return String(status.player_count);
      case "max_players":
        return String(status.max_players);
      case "server_name":
        return status.server_name;
      case "server_version":
        return status.server_version;
      case "motd":
        return status.motd;
      case "player_list":
        return status.player_list.join(", ") || "(none)";
      default:
        return _match;
    }
  });
}

export default {
  parsePlaceholders,
  parsePlaceholdersSync,
  parsePagePlaceholders,
  warmCache,
  getCache: () =>
    _cache
      ? { ..._cache.data, _fetchedAt: new Date(_cache.fetchedAt).toISOString() }
      : null,
};
