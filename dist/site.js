const stories = {
  added: {
    status: "ADDED",
    package: "zod",
    before: "—",
    after: "^4.0.0",
    resolved: "4.1.5",
    commit: "68d9f4a1",
    evidence: "2 source files",
    files: ["src/api.ts", "src/schema.ts"],
    assessment: "Current source references were found at the head revision.",
    color: "var(--acid)",
  },
  changed: {
    status: "CHANGED",
    package: "vite",
    before: "^6.1.0",
    after: "^7.0.0",
    resolved: "7.1.4",
    commit: "3f210ee8",
    evidence: "1 config file",
    files: ["vite.config.ts"],
    assessment: "The declared range and resolved version changed together.",
    color: "var(--amber)",
  },
  removed: {
    status: "REMOVED",
    package: "request",
    before: "^2.88.2",
    after: "—",
    resolved: "not present",
    commit: "b87046ca",
    evidence: "1 source file",
    files: ["src/legacy-client.js"],
    assessment: "The declaration was removed, but a source reference remains.",
    color: "var(--rust)",
  },
};

const storyElements = {
  status: document.querySelector("#story-status"),
  package: document.querySelector("#story-package"),
  before: document.querySelector("#story-before"),
  after: document.querySelector("#story-after"),
  resolved: document.querySelector("#story-resolved"),
  commit: document.querySelector("#story-commit"),
  evidence: document.querySelector("#story-evidence"),
  files: document.querySelector("#story-files"),
  assessment: document.querySelector("#story-assessment"),
  dot: document.querySelector(".story-rail span"),
};

function selectStory(name) {
  const story = stories[name];
  if (!story) return;
  for (const [key, element] of Object.entries(storyElements)) {
    if (key === "files" || key === "dot") continue;
    element.textContent = story[key];
  }
  storyElements.files.replaceChildren(...story.files.map((file) => {
    const code = document.createElement("code");
    code.textContent = file;
    return code;
  }));
  storyElements.status.style.color = story.color;
  storyElements.status.style.borderColor = story.color;
  storyElements.dot.style.background = story.color;
  document.querySelector("#story-panel").setAttribute("aria-labelledby", `story-tab-${name}`);
  document.querySelectorAll("[data-story]").forEach((button) => {
    const selected = button.dataset.story === name;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
}

const storyTabs = [...document.querySelectorAll("[data-story]")];
storyTabs.forEach((button, index) => {
  button.addEventListener("click", () => selectStory(button.dataset.story));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? storyTabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + storyTabs.length) % storyTabs.length;
    const next = storyTabs[nextIndex];
    selectStory(next.dataset.story);
    next.focus();
  });
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select";
    }
    window.setTimeout(() => { button.textContent = original; }, 1600);
  });
});
