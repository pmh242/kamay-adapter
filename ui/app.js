const form = document.querySelector("#config-form");
const saveMessage = document.querySelector("#save-message");

loadState();

async function loadState() {
  const response = await fetch("/api/state");
  const state = await response.json();
  renderState(state);
}

function renderState(state) {
  document.querySelector("#overall-status").textContent = overallStatus(state);
  document.querySelector("#repo-root").textContent = state.project.repoRoot;
  document.querySelector("#config-path").textContent = state.config.path;

  for (const [key, value] of Object.entries(state.config.values)) {
    const input = form.elements.namedItem(key);
    if (input) {
      input.value = value;
    }
  }

  renderBoundaries(state.boundaries);
  renderArtifacts(state.artifacts);
  renderCommands(state.commands);
}

function overallStatus(state) {
  const statuses = Object.values(state.artifacts).map((item) => item.status);
  if (statuses.includes("invalid") || statuses.includes("blocked")) {
    return "Needs Review";
  }
  if (statuses.includes("available")) {
    return "Ready";
  }
  return "Local";
}

function renderBoundaries(boundaries) {
  const list = document.querySelector("#boundaries");
  list.replaceChildren();
  const labels = {
    storesSecrets: "Does not store secrets",
    readsEnvLocal: "Does not read .env.local",
    executesCommands: "Does not execute commands",
    mintsTokens: "Does not mint URLs",
    mutatesCloudflare: "Does not mutate Cloudflare"
  };
  for (const [key, value] of Object.entries(boundaries)) {
    const item = document.createElement("li");
    item.textContent = value === false ? labels[key] : `${key}: ${value}`;
    list.append(item);
  }
}

function renderArtifacts(artifacts) {
  const cards = document.querySelector("#artifact-cards");
  cards.replaceChildren();
  for (const artifact of Object.values(artifacts)) {
    const card = document.createElement("article");
    card.className = "card";
    const title = document.createElement("h3");
    title.textContent = titleCase(artifact.kind);
    const badge = document.createElement("span");
    badge.className = `badge ${artifact.status}`;
    badge.textContent = artifact.status;
    const summary = document.createElement("div");
    summary.className = "summary";
    summary.append(row("Path", artifact.path));
    if (artifact.summary) {
      for (const [key, value] of Object.entries(artifact.summary)) {
        summary.append(row(titleCase(key), value ?? "-"));
      }
    }
    card.append(title, badge, summary);
    cards.append(card);
  }
}

function renderCommands(commands) {
  const container = document.querySelector("#commands");
  container.replaceChildren();
  for (const [name, command] of Object.entries(commands)) {
    const rowElement = document.createElement("div");
    rowElement.className = "command";
    const code = document.createElement("code");
    code.textContent = command;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Copy ${name}`;
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(command);
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = `Copy ${name}`;
      }, 1200);
    });
    rowElement.append(code, button);
    container.append(rowElement);
  }
}

function row(label, value) {
  const line = document.createElement("div");
  line.textContent = `${label}: ${value}`;
  return line;
}

function titleCase(value) {
  return String(value)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveMessage.textContent = "Saving...";
  const payload = Object.fromEntries(new FormData(form).entries());
  const response = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) {
    saveMessage.textContent = result.error ?? "Unable to save";
    return;
  }
  saveMessage.textContent = "Saved locally";
  await loadState();
});
