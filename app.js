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
  camp: ["# camp", "WorldTree first gathering camp."],
  central: ["# central", "Central command and decisions."],
  command: ["# command", "Orders and priorities."],
  hud: ["# hud", "Second Life HUD restore and chat HUD."],
  api: ["# api", "Supabase, Edge Function, Apps Script, security."],
  sl: ["# second-life", "In-world HUD, kiosk, object work."],
  qa: ["# qa", "Version audit, bugs, risks."],
  urgent: ["# urgent", "Only blockers and emergency commands."]
};

const seedMessages = [
  {
    id: "seed-1",
    channel: "camp",
    name: "Daejang",
    role: "Central",
    tag: "command",
    body: "WorldTree Camp is open. Gather first. Do not paste secrets.",
    createdAt: new Date().toISOString()
  }
];

let currentChannel = config.defaultChannel || "camp";
let realtimeChannel = null;

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
  clock: document.getElementById("clock")
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
    "role:",
    "",
    "done:",
    "",
    "candidate:",
    "",
    "risk:",
    "",
    "missing:",
    "",
    "next:",
    "",
    "note:",
    "- WorldTree only",
    "- no secrets"
  ].join("\n");
}

function render() {
  const [title, desc] = channels[currentChannel] || channels.camp;
  els.channelTitle.textContent = title;
  els.channelDesc.textContent = desc;

  document.querySelectorAll(".channel").forEach((button) => {
    button.classList.toggle("active", button.dataset.channel === currentChannel);
  });

  const messages = loadLocal().filter((message) => message.channel === currentChannel);
  els.messages.innerHTML = messages.map((message) => `
    <article class="message">
      <div class="messageHead">
        <span class="name">${escapeHtml(message.name)}</span>
        <span class="role">${escapeHtml(message.role)}</span>
        <span class="tag tag-${escapeHtml(message.tag)}">${escapeHtml(message.tag)}</span>
        <span class="time">${formatTime(message.createdAt)}</span>
      </div>
      <div class="body">${escapeHtml(message.body)}</div>
    </article>
  `).join("");
  els.messages.scrollTop = els.messages.scrollHeight;
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
  els.composer.requestSubmit();
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

render();
subscribeSupabase();
getMessages().catch(() => {
  els.backendState.textContent = "Backend error";
});
