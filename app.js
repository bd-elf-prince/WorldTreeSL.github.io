// WorldTree Camp Chat app.js
// Version: 20260704-link-send-v1
// Name: Gom / WorldTree Camp

const config = window.WT_CHAT_CONFIG || {};
const hasRealSupabaseConfig = Boolean(
  config.supabaseUrl &&
  config.supabaseAnonKey &&
  !config.supabaseUrl.includes("YOUR_PROJECT_REF") &&
  !config.supabaseAnonKey.includes("YOUR_SUPABASE_ANON_KEY") &&
  window.supabase
);
const supabaseClient = hasRealSupabaseConfig
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;
const supabaseTable = config.supabaseTable || "worldtree_chat_messages";
const localKey = "worldtree-camp-chat-local-v1";

const channels = {
  camp: ["# camp", "\uc6d4\ub4dc\ud2b8\ub9ac \uccab \uc9d1\uacb0\uc9c0."],
  central: ["# central", "\uc911\uc559 \ud310\ub2e8\uacfc \ucd5c\uc885 \uacb0\uc815."],
  command: ["# command", "\uba85\ub839, \uc6b0\uc120\uc21c\uc704, \uc9c0\uc2dc\ubb38."],
  hud: ["# hud", "\uc138\ucee8\ub4dc\ub77c\uc774\ud504 HUD \ubcf5\uad6c\uc640 \ucc44\ud305 HUD."],
  api: ["# api", "Supabase, Edge Function, Apps Script, \ubcf4\uc548."],
  sl: ["# second-life", "\uc778\uc6d4\ub4dc HUD, \ud0a4\uc624\uc2a4\ud06c, \uc624\ube0c\uc81d\ud2b8 \uc791\uc5c5."],
  qa: ["# qa", "\ubc84\uc804 \uac10\uc0ac, \ubc84\uadf8, \uc704\ud5d8 \ud655\uc778."],
  urgent: ["# urgent", "\ub9c9\ud78c \uac83\uacfc \uae34\uae09 \uba85\ub839\ub9cc."]
};

const tagLabels = {
  done: "\uc644\ub8cc",
  candidate: "\ud6c4\ubcf4",
  risk: "\uc704\ud5d8",
  missing: "\ub204\ub77d",
  command: "\uba85\ub839"
};

const seedMessages = [
  {
    id: "seed-1",
    channel: "camp",
    name: "Daejang",
    role: "Central",
    tag: "command",
    body: "\uc6d4\ub4dc\ud2b8\ub9ac \ucea0\ud504 \uac1c\ubc29. \uba3c\uc800 \ubaa8\uc778\ub2e4. \ube44\ubc00\ud0a4\ub294 \uc808\ub300 \ubd99\uc5ec\ub123\uc9c0 \uc54a\ub294\ub2e4.",
    createdAt: new Date().toISOString()
  }
];

let currentChannel = config.defaultChannel || "camp";
let realtimeChannel = null;
let pendingLinkSend = null;

const els = {
  messages: document.getElementById("messages"),
  channelTitle: document.getElementById("channelTitle"),
  channelDesc: document.getElementById("channelDesc"),
  operatorName: document.getElementById("operatorName"),
  operatorRole: document.getElementById("operatorRole"),
  composer: document.getElementById("composer"),
  messageInput: document.getElementById("messageInput"),
  insertTemplate: document.getElementById("insertTemplate"),
  refreshNow: document.getElementById("refreshNow"),
  exportLog: document.getElementById("exportLog"),
  backendState: document.getElementById("backendState"),
  clock: document.getElementById("clock"),
  onlineCount: document.getElementById("onlineCount"),
  onlineUsers: document.getElementById("onlineUsers")
};

function loadLocal() {
  const raw = localStorage.getItem(localKey);
  if (!raw) {
    localStorage.setItem(localKey, JSON.stringify(seedMessages));
    return [...seedMessages];
  }
  try {
    return JSON.parse(raw);
  } catch {
    return [...seedMessages];
  }
}

function saveLocal(messages) {
  localStorage.setItem(localKey, JSON.stringify(messages));
}

function mergeLocal(incoming) {
  const byId = new Map(loadLocal().map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  const merged = Array.from(byId.values())
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  saveLocal(merged);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", { hour12: false });
}

function reportTemplate() {
  return [
    "\ub2f4\ub2f9 \uc5ed\ud560:",
    "",
    "\uc644\ub8cc:",
    "",
    "\ud6c4\ubcf4:",
    "",
    "\uc704\ud5d8:",
    "",
    "\ub204\ub77d:",
    "",
    "\ub2e4\uc74c \uc791\uc5c5:",
    "",
    "\uc8fc\uc758\uc0ac\ud56d:",
    "- WorldTree\ub9cc \uc791\uc5c5",
    "- \ube44\ubc00\ud0a4 \uae08\uc9c0"
  ].join("\n");
}

function getOnlineUsers(messages) {
  const users = new Map();
  messages.forEach((message) => {
    const key = `${message.name || "unknown"}-${message.role || "unknown"}`;
    users.set(key, {
      name: message.name || "unknown",
      role: message.role || "unknown",
      tag: message.tag || "candidate",
      createdAt: message.createdAt || new Date(0).toISOString()
    });
  });

  const selfName = els.operatorName.value.trim() || "unknown";
  const selfRole = els.operatorRole.value || "unknown";
  users.set(`${selfName}-${selfRole}`, {
    name: selfName,
    role: selfRole,
    tag: "done",
    createdAt: new Date().toISOString()
  });

  return Array.from(users.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 18);
}

function renderOnlineUsers(messages) {
  if (!els.onlineUsers || !els.onlineCount) return;
  const users = getOnlineUsers(messages);
  els.onlineCount.textContent = String(users.length);
  els.onlineUsers.innerHTML = users.map((user) => `
    <div class="onlineUser">
      <span class="onlineDot tag-${escapeHtml(user.tag)}"></span>
      <span>
        <span class="onlineName">${escapeHtml(user.name)}</span>
        <span class="onlineRole">${escapeHtml(user.role)}</span>
      </span>
    </div>
  `).join("");
}

function render() {
  const [title, desc] = channels[currentChannel] || channels.camp;
  els.channelTitle.textContent = title;
  els.channelDesc.textContent = desc;

  document.querySelectorAll(".channel").forEach((button) => {
    button.classList.toggle("active", button.dataset.channel === currentChannel);
  });

  const allMessages = loadLocal();
  const messages = allMessages.filter((message) => message.channel === currentChannel);
  const shouldStickToBottom =
    els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 90;
  els.messages.innerHTML = messages.map((message) => `
    <article class="message">
      <div class="messageHead">
        <span class="name">${escapeHtml(message.name)}</span>
        <span class="role">${escapeHtml(message.role)}</span>
        <span class="tag tag-${escapeHtml(message.tag)}">${escapeHtml(tagLabels[message.tag] || message.tag)}</span>
        <span class="time">${formatTime(message.createdAt)}</span>
      </div>
      <div class="body">${escapeHtml(message.body)}</div>
    </article>
  `).join("");
  renderOnlineUsers(allMessages);
  if (shouldStickToBottom) {
    els.messages.scrollTop = els.messages.scrollHeight;
  }
}

function toSupabaseRow(message) {
  return {
    id: message.id,
    created_at: message.createdAt,
    channel: message.channel,
    name: message.name,
    role: message.role,
    tag: message.tag,
    body: message.body
  };
}

function fromSupabaseRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    channel: row.channel,
    name: row.name,
    role: row.role,
    tag: row.tag,
    body: row.body
  };
}

async function getMessages() {
  if (!supabaseClient) {
    els.backendState.textContent = "Config needed";
    render();
    return;
  }

  const { data, error } = await supabaseClient
    .from(supabaseTable)
    .select("id,created_at,channel,name,role,tag,body")
    .eq("channel", currentChannel)
    .order("created_at", { ascending: true })
    .limit(80);

  if (error) throw error;
  mergeLocal((data || []).map(fromSupabaseRow));
  els.backendState.textContent = "Supabase online";
  render();
}

async function sendMessage(message) {
  if (!supabaseClient) {
    mergeLocal([message]);
    els.backendState.textContent = "Local only";
    render();
    return;
  }

  const { error } = await supabaseClient
    .from(supabaseTable)
    .insert(toSupabaseRow(message));

  if (error) throw error;
  mergeLocal([message]);
  els.backendState.textContent = "Supabase online";
  render();
}

function makeMessage(body, tag) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    channel: currentChannel,
    name: els.operatorName.value.trim() || "unknown",
    role: els.operatorRole.value,
    tag,
    body,
    createdAt: new Date().toISOString()
  };
}

function applyLinkParams() {
  const params = new URLSearchParams(window.location.search);
  const channel = params.get("channel");
  const name = params.get("name");
  const role = params.get("role");
  const tag = params.get("tag");
  const msg = params.get("msg");
  const shouldSend = params.get("send") === "1";

  if (channel && channels[channel]) {
    currentChannel = channel;
  }
  if (name) {
    els.operatorName.value = name.slice(0, 24);
  }
  if (role && Array.from(els.operatorRole.options).some((option) => option.value === role)) {
    els.operatorRole.value = role;
  }
  if (tag) {
    const safeTag = window.CSS && CSS.escape ? CSS.escape(tag) : tag.replace(/"/g, "");
    const tagInput = els.composer.querySelector(`input[name="tag"][value="${safeTag}"]`);
    if (tagInput) tagInput.checked = true;
  }
  if (msg) {
    els.messageInput.value = msg.slice(0, 1200);
    pendingLinkSend = shouldSend ? msg.slice(0, 1200) : null;
  }
}

async function sendPendingLinkMessage() {
  if (!pendingLinkSend) return;
  const params = new URLSearchParams(window.location.search);
  const marker = [
    params.get("channel") || currentChannel,
    params.get("name") || els.operatorName.value,
    params.get("role") || els.operatorRole.value,
    params.get("tag") || new FormData(els.composer).get("tag") || "candidate",
    pendingLinkSend
  ].join("|");
  const markerKey = `worldtree-link-send-${btoa(unescape(encodeURIComponent(marker))).slice(0, 80)}`;
  if (sessionStorage.getItem(markerKey)) return;
  sessionStorage.setItem(markerKey, "1");

  const body = pendingLinkSend.trim();
  if (!body) return;
  const tag = new FormData(els.composer).get("tag") || "candidate";
  els.messageInput.value = "";
  try {
    await sendMessage(makeMessage(body, tag));
  } catch {
    const failed = makeMessage(`[link send failed]\n${body}`, "risk");
    mergeLocal([failed]);
    els.backendState.textContent = "Backend error";
    render();
  }
}

function subscribeSupabase() {
  if (!supabaseClient) return;
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }
  realtimeChannel = supabaseClient
    .channel(`worldtree-camp-${currentChannel}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: supabaseTable, filter: `channel=eq.${currentChannel}` },
      (payload) => {
        mergeLocal([fromSupabaseRow(payload.new)]);
        els.backendState.textContent = "Supabase online";
        render();
      }
    )
    .subscribe();
}

document.querySelectorAll(".channel").forEach((button) => {
  button.addEventListener("click", async () => {
    currentChannel = button.dataset.channel;
    render();
    subscribeSupabase();
    try {
      await getMessages();
    } catch {
      els.backendState.textContent = "Backend error";
    }
  });
});

els.composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = els.messageInput.value.trim();
  if (!body) return;
  const tag = new FormData(els.composer).get("tag") || "candidate";
  els.messageInput.value = "";
  try {
    await sendMessage(makeMessage(body, tag));
  } catch {
    const failed = makeMessage(`[send failed]\n${body}`, "risk");
    mergeLocal([failed]);
    els.backendState.textContent = "Backend error";
    render();
  }
});

els.messageInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  els.composer.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
});

els.insertTemplate.addEventListener("click", () => {
  els.messageInput.value = reportTemplate();
  els.messageInput.focus();
});

els.refreshNow.addEventListener("click", () => {
  getMessages().catch(() => {
    els.backendState.textContent = "Backend error";
  });
});

els.exportLog.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(loadLocal(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `worldtree-camp-log-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

setInterval(() => {
  els.clock.textContent = new Date().toLocaleTimeString("ko-KR", { hour12: false });
}, 1000);

applyLinkParams();
render();
subscribeSupabase();
getMessages()
  .then(sendPendingLinkMessage)
  .catch(() => {
    els.backendState.textContent = "Backend error";
  });

// End of WorldTree Camp Chat app.js
