import { createResultSignature } from "./result-signature.js";
import { parseGuiPrompts } from "./prompt-parser.js";
import { displayRunName } from "./run-title.js";
import { DEFAULT_LANGUAGE, normalizeLanguage, normalizeTheme, t } from "./i18n.js";
import { DEFAULT_THEME } from "./i18n.js";

const LANGUAGE_STORAGE_KEY = "image2studio.language";
const THEME_STORAGE_KEY = "image2studio.theme";
const USER_CONFIG_STORAGE_KEY = "image2studio.userConfig";
const USER_CONFIG_FIELDS = [
  "apiKey",
  "baseUrl",
  "endpointPath",
  "language",
  "theme",
  "model",
  "size",
  "count",
  "concurrency",
  "timeoutMinutes",
  "quality",
  "outputFormat",
  "responseFormat",
  "dryRun",
  "batchPrompts",
];

const state = {
  activeRunId: "",
  activePanel: "activity",
  authMode: "none",
  currentImages: [],
  historyEditMode: false,
  imageViewerIndex: -1,
  imageViewerZoom: 1,
  pendingDeleteImages: [],
  pollTimer: 0,
  runs: [],
  rightRailCollapsed: false,
  sidebarCollapsed: false,
  resultSignature: "",
  selectedImages: new Set(),
  selectedRunIds: new Set(),
  language: DEFAULT_LANGUAGE,
  theme: DEFAULT_THEME,
  userConfigFields: new Set(),
};

const elements = {
  appShell: document.querySelector(".app-shell"),
  authGate: document.querySelector("#auth-gate"),
  authForm: document.querySelector("#auth-form"),
  authTitle: document.querySelector("#auth-title"),
  authDescription: document.querySelector("#auth-description"),
  authPassword: document.querySelector("#auth-password"),
  authConfirmRow: document.querySelector("#auth-confirm-row"),
  authConfirmPassword: document.querySelector("#auth-confirm-password"),
  authSubmit: document.querySelector("#auth-submit"),
  authMessage: document.querySelector("#auth-message"),
  apiKey: document.querySelector("#api-key"),
  baseUrl: document.querySelector("#base-url"),
  endpointPath: document.querySelector("#endpoint-path"),
  language: document.querySelector("#language"),
  theme: document.querySelector("#theme"),
  model: document.querySelector("#model"),
  size: document.querySelector("#size"),
  count: document.querySelector("#count"),
  concurrency: document.querySelector("#concurrency"),
  timeoutMinutes: document.querySelector("#timeout-minutes"),
  quality: document.querySelector("#quality"),
  outputFormat: document.querySelector("#output-format"),
  responseFormat: document.querySelector("#response-format"),
  batchPrompts: document.querySelector("#batch-prompts"),
  dryRun: document.querySelector("#dry-run"),
  prompts: document.querySelector("#prompts"),
  generateButton: document.querySelector("#generate-button"),
  defaultsNote: document.querySelector("#defaults-note"),
  runTitle: document.querySelector("#run-title"),
  runSummary: document.querySelector("#run-summary"),
  progressBar: document.querySelector("#progress-bar"),
  runDir: document.querySelector("#run-dir"),
  resultToolbar: document.querySelector("#result-toolbar"),
  selectAllImages: document.querySelector("#result-select-all-images"),
  resultSelectionCount: document.querySelector("#result-selection-count"),
  downloadSelectedImages: document.querySelector("#download-selected-images"),
  deleteSelectedImages: document.querySelector("#delete-selected-images"),
  resultsGrid: document.querySelector("#results-grid"),
  runHistory: document.querySelector("#run-history"),
  jobList: document.querySelector("#job-list"),
  imageViewer: document.querySelector("#image-viewer"),
  viewerImage: document.querySelector("#viewer-image"),
  viewerCaption: document.querySelector("#viewer-caption"),
  viewerClose: document.querySelector("#viewer-close"),
  viewerPrev: document.querySelector("#viewer-prev"),
  viewerNext: document.querySelector("#viewer-next"),
  viewerZoomIn: document.querySelector("#viewer-zoom-in"),
  viewerZoomOut: document.querySelector("#viewer-zoom-out"),
  viewerReset: document.querySelector("#viewer-reset"),
  confirmDialog: document.querySelector("#confirm-dialog"),
  confirmMessage: document.querySelector("#confirm-message"),
  cancelDeleteImages: document.querySelector("#cancel-delete-images"),
  confirmDeleteImages: document.querySelector("#confirm-delete-images"),
  settingsToggle: document.querySelector("#settings-toggle"),
  settingsToggleLabel: document.querySelector("#settings-toggle-label"),
  rightRailToggle: document.querySelector("#right-rail-toggle"),
  rightRailToggleLabel: document.querySelector("#right-rail-toggle-label"),
  railButtons: Array.from(document.querySelectorAll(".rail-button[data-panel]")),
  railPanels: Array.from(document.querySelectorAll("[data-panel-content]")),
  deleteSelectedRuns: document.querySelector("#delete-selected-runs"),
  editHistoryButton: document.querySelector("#edit-history-button"),
  historyToolbar: document.querySelector(".history-toolbar"),
  historySelectionCount: document.querySelector("#history-selection-count"),
  newSessionButton: document.querySelector("#new-session-button"),
  selectAllRuns: document.querySelector("#select-all-runs"),
};

loadPreferences();
applyTheme();
applyLanguage();
bindEvents();
await initializeAuth();

function bindEvents() {
  elements.language.addEventListener("change", () => {
    state.language = normalizeLanguage(elements.language.value);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, state.language);
    applyLanguage();
    rerenderCurrentUi();
  });
  elements.theme.addEventListener("change", () => {
    state.theme = normalizeTheme(elements.theme.value);
    localStorage.setItem(THEME_STORAGE_KEY, state.theme);
    applyTheme();
  });
  elements.authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitAuthForm();
  });
  elements.generateButton.addEventListener("click", () => {
    void startGeneration();
  });
  elements.settingsToggle.addEventListener("click", () => {
    setSidebarCollapsed(!state.sidebarCollapsed);
  });
  elements.rightRailToggle.addEventListener("click", () => {
    setRightRailCollapsed(!state.rightRailCollapsed);
  });
  elements.deleteSelectedRuns.addEventListener("click", () => {
    void deleteRuns(Array.from(state.selectedRunIds));
  });
  elements.editHistoryButton.addEventListener("click", () => {
    setHistoryEditMode(!state.historyEditMode);
  });
  elements.newSessionButton.addEventListener("click", () => {
    prepareNewSession();
  });
  elements.selectAllRuns.addEventListener("change", () => {
    toggleSelectAllRuns(elements.selectAllRuns.checked);
  });
  elements.selectAllImages.addEventListener("change", () => {
    toggleSelectAllImages(elements.selectAllImages.checked);
  });
  elements.downloadSelectedImages.addEventListener("click", () => {
    downloadSelectedImages();
  });
  elements.deleteSelectedImages.addEventListener("click", () => {
    requestDeleteSelectedImages();
  });
  elements.cancelDeleteImages.addEventListener("click", () => {
    closeConfirmDialog();
  });
  elements.confirmDeleteImages.addEventListener("click", () => {
    void confirmDeleteSelectedImages();
  });
  elements.viewerClose.addEventListener("click", () => {
    closeImageViewer();
  });
  elements.viewerPrev.addEventListener("click", () => {
    moveImageViewer(-1);
  });
  elements.viewerNext.addEventListener("click", () => {
    moveImageViewer(1);
  });
  elements.viewerZoomIn.addEventListener("click", () => {
    zoomImageViewer(0.25);
  });
  elements.viewerZoomOut.addEventListener("click", () => {
    zoomImageViewer(-0.25);
  });
  elements.viewerReset.addEventListener("click", () => {
    setImageViewerZoom(1);
  });
  document.addEventListener("keydown", handleGlobalKeydown);
  for (const button of elements.railButtons) {
    button.addEventListener("click", () => {
      if (state.rightRailCollapsed) {
        setRightRailCollapsed(false);
      }
      showPanel(button.dataset.panel);
    });
  }
  bindUserConfigPersistence();
}

async function initializeAuth() {
  let authStatus;
  try {
    authStatus = await requestJson("/api/auth/status");
  } catch {
    await enterApplication();
    return;
  }
  if (!authStatus.authRequired || authStatus.authenticated) {
    await enterApplication();
    return;
  }
  state.authMode = authStatus.initialized ? "login" : "setup";
  renderAuthGate();
}

function renderAuthGate() {
  elements.authGate.hidden = false;
  elements.appShell.hidden = true;
  const isSetup = state.authMode !== "login";
  elements.authTitle.textContent = translate(isSetup ? "authSetupTitle" : "authLoginTitle");
  elements.authDescription.textContent = translate(isSetup ? "authSetupDescription" : "authLoginDescription");
  elements.authConfirmRow.hidden = !isSetup;
  elements.authPassword.autocomplete = isSetup ? "new-password" : "current-password";
  elements.authSubmit.textContent = translate(isSetup ? "authSetupButton" : "authLoginButton");
  elements.authMessage.textContent = "";
  elements.authPassword.focus();
}

async function submitAuthForm() {
  const password = elements.authPassword.value;
  const confirmPassword = elements.authConfirmPassword.value;
  if (password.length < 8 || password.length > 20) {
    elements.authMessage.textContent = translate("authPasswordLength");
    return;
  }
  if (state.authMode !== "login" && password !== confirmPassword) {
    elements.authSubmit.disabled = true;
    try {
      await tryLoginFromSetupMode(password);
      return;
    } catch (error) {
      if (!isPasswordNotConfiguredError(error)) {
        state.authMode = "login";
        renderAuthGate();
        elements.authMessage.textContent = error instanceof Error ? error.message : String(error);
        return;
      }
    } finally {
      elements.authSubmit.disabled = false;
    }
    elements.authMessage.textContent = translate("authConfirmMismatch");
    return;
  }
  elements.authSubmit.disabled = true;
  try {
    await requestJson(state.authMode === "login" ? "/api/auth/login" : "/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    elements.authPassword.value = "";
    elements.authConfirmPassword.value = "";
    await refreshAuthSession();
    await enterApplication();
  } catch (error) {
    if (state.authMode !== "login" && isPasswordAlreadyConfiguredError(error)) {
      state.authMode = "login";
      renderAuthGate();
      elements.authMessage.textContent = translate("authPasswordAlreadyConfigured");
      return;
    }
    elements.authMessage.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    elements.authSubmit.disabled = false;
  }
}

async function tryLoginFromSetupMode(password) {
  await completeAuthRequest("/api/auth/login", password);
}

async function completeAuthRequest(pathname, password) {
  await requestJson(pathname, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  elements.authPassword.value = "";
  elements.authConfirmPassword.value = "";
  await refreshAuthSession();
  await enterApplication();
}

function isPasswordAlreadyConfiguredError(error) {
  return error instanceof Error && error.message.toLowerCase().includes("password has already been configured");
}

function isPasswordNotConfiguredError(error) {
  return error instanceof Error && error.message.toLowerCase().includes("password has not been configured");
}

async function refreshAuthSession() {
  const authStatus = await requestJson("/api/auth/status");
  if (authStatus.authRequired && !authStatus.authenticated) {
    state.authMode = authStatus.initialized ? "login" : "setup";
    renderAuthGate();
    throw new Error(translate("authSessionNotReady"));
  }
}

function showApplication() {
  state.authMode = "none";
  elements.authGate.hidden = true;
  elements.appShell.hidden = false;
}

async function enterApplication() {
  await loadDefaults();
  await loadLatestRun();
  showApplication();
}

function loadPreferences() {
  const userConfig = loadUserConfig();
  applyUserConfig(userConfig);
  state.userConfigFields = new Set(Object.keys(userConfig));
  state.language = normalizeLanguage(
    Object.prototype.hasOwnProperty.call(userConfig, "language") ? elements.language.value : localStorage.getItem(LANGUAGE_STORAGE_KEY),
  );
  state.theme = normalizeTheme(
    Object.prototype.hasOwnProperty.call(userConfig, "theme") ? elements.theme.value : localStorage.getItem(THEME_STORAGE_KEY),
  );
  elements.language.value = state.language;
  elements.theme.value = state.theme;
}

function loadUserConfig() {
  const rawConfig = localStorage.getItem(USER_CONFIG_STORAGE_KEY);
  if (!rawConfig) {
    return {};
  }
  try {
    const parsed = JSON.parse(rawConfig);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function applyUserConfig(config) {
  for (const field of USER_CONFIG_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(config, field)) {
      setUserConfigField(field, config[field]);
    }
  }
}

function bindUserConfigPersistence() {
  for (const field of USER_CONFIG_FIELDS) {
    const element = elements[field];
    if (!element) {
      continue;
    }
    const eventName = element.type === "checkbox" || element.tagName === "SELECT" ? "change" : "input";
    element.addEventListener(eventName, saveUserConfig);
  }
}

function saveUserConfig() {
  const snapshot = {};
  for (const field of USER_CONFIG_FIELDS) {
    const element = elements[field];
    if (!element) {
      continue;
    }
    snapshot[field] = element.type === "checkbox" ? element.checked : element.value;
  }
  state.userConfigFields = new Set(Object.keys(snapshot));
  localStorage.setItem(USER_CONFIG_STORAGE_KEY, JSON.stringify(snapshot));
}

function setUserConfigField(field, value) {
  const element = elements[field];
  if (!element) {
    return;
  }
  if (element.type === "checkbox") {
    element.checked = value === true;
    return;
  }
  element.value = String(value ?? "");
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  elements.theme.value = state.theme;
}

function applyLanguage() {
  document.documentElement.lang = state.language === "zh" ? "zh-CN" : "en";
  elements.language.value = state.language;
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = translate(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
    element.setAttribute("placeholder", translate(element.dataset.i18nPlaceholder));
  }
  for (const element of document.querySelectorAll("[data-i18n-title]")) {
    element.setAttribute("title", translate(element.dataset.i18nTitle));
  }
  for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", translate(element.dataset.i18nAriaLabel));
  }
  setSidebarCollapsed(state.sidebarCollapsed);
  setRightRailCollapsed(state.rightRailCollapsed);
  updateSelectionControls();
  updateResultToolbar();
  setGenerateRunning(elements.generateButton.disabled);
}

function translate(key, params) {
  return t(state.language, key, params);
}

function rerenderCurrentUi() {
  renderRunHistory(state.runs);
  if (state.activeRunId) {
    void refreshActiveRun();
    return;
  }
  renderEmptyRun();
}

async function loadDefaults() {
  const defaults = await requestJson("/api/defaults");
  applyDefaultConfigField("endpointPath", defaults.endpointPath);
  applyDefaultConfigField("model", defaults.model);
  applyDefaultConfigField("size", defaults.size);
  applyDefaultConfigField("timeoutMinutes", msToRoundedMinutes(defaults.timeoutMs));
  applyDefaultConfigField("quality", defaults.quality || "");
  applyDefaultConfigField("outputFormat", defaults.outputFormat || "");
  applyDefaultConfigField("responseFormat", defaults.responseFormat || "");
  elements.defaultsNote.textContent = defaultStatusText(defaults);
}

function applyDefaultConfigField(field, value) {
  if (state.userConfigFields.has(field)) {
    return;
  }
  setUserConfigField(field, value);
}

function defaultStatusText(defaults) {
  if (defaults.apiKeyConfigured && defaults.baseUrlConfigured) {
    return translate("baseUrlConfigured");
  }
  if (defaults.apiKeyConfigured) {
    return translate("apiKeyConfigured");
  }
  if (defaults.baseUrlConfigured) {
    return translate("baseUrlConfigured");
  }
  return translate("pasteApiKey");
}

async function loadLatestRun() {
  const { runs } = await requestJson("/api/runs");
  state.runs = Array.isArray(runs) ? runs : [];
  renderRunHistory(state.runs);
  if (state.runs.length === 0) {
    renderEmptyRun();
    return;
  }
  const latestRun = state.runs[0];
  state.activeRunId = latestRun.id;
  renderRun(latestRun);
  if (latestRun.status === "running") {
    setGenerateRunning(true);
    startPolling();
  }
}

async function startGeneration() {
  const prompts = parseGuiPrompts(elements.prompts.value, { batchMode: elements.batchPrompts.checked });
  if (prompts.length === 0) {
    setInlineMessage(translate("addPrompt"));
    return;
  }
  saveUserConfig();
  setGenerateRunning(true);
  try {
    const run = await requestJson("/api/generate", {
      method: "POST",
      body: JSON.stringify({
        apiKey: elements.apiKey.value,
        baseUrl: elements.baseUrl.value,
        endpointPath: elements.endpointPath.value,
        model: elements.model.value,
        size: elements.size.value,
        count: Number.parseInt(elements.count.value, 10),
        concurrency: Number.parseInt(elements.concurrency.value, 10),
        timeoutMs: timeoutMinutesToMs(elements.timeoutMinutes.value),
        quality: elements.quality.value,
        outputFormat: elements.outputFormat.value,
        responseFormat: elements.responseFormat.value,
        prompts,
        dryRun: elements.dryRun.checked,
      }),
    });
    state.activeRunId = run.id;
    await refreshRunHistory(run);
    renderRun(run);
    showPanel("activity");
    startPolling();
  } catch (error) {
    setInlineMessage(error instanceof Error ? error.message : String(error));
    setGenerateRunning(false);
  }
}

function startPolling() {
  window.clearInterval(state.pollTimer);
  state.pollTimer = window.setInterval(async () => {
    if (!state.activeRunId) {
      return;
    }
    try {
      const run = await requestJson(`/api/runs/${encodeURIComponent(state.activeRunId)}`);
      renderRun(run);
      await refreshRunHistory(run);
      if (run.status !== "running") {
        window.clearInterval(state.pollTimer);
        setGenerateRunning(false);
      }
    } catch (error) {
      window.clearInterval(state.pollTimer);
      setInlineMessage(error instanceof Error ? error.message : String(error));
      setGenerateRunning(false);
    }
  }, 900);
}

async function refreshRunHistory(activeRun) {
  const { runs } = await requestJson("/api/runs");
  state.runs = Array.isArray(runs) ? runs : [];
  if (activeRun && !state.runs.some((run) => run.id === activeRun.id)) {
    state.runs = [activeRun, ...state.runs];
  }
  pruneSelectedRunIds();
  renderRunHistory(state.runs);
}

function renderRunHistory(runs) {
  updateSelectionControls();
  if (runs.length === 0) {
    elements.runHistory.replaceChildren(createEmptyState(translate("noSavedRuns")));
    return;
  }
  elements.runHistory.replaceChildren(...runs.map((run) => createRunHistoryItem(run)));
}

function createRunHistoryItem(run) {
  const item = document.createElement("article");
  item.className = run.id === state.activeRunId ? "run-history-item is-active" : "run-history-item";
  item.classList.toggle("is-editing", state.historyEditMode);

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "run-history-item__open";
  const title = document.createElement("span");
  title.className = "run-history-item__title";
  title.textContent = displayRunName(run);
  const meta = document.createElement("small");
  meta.className = "run-history-item__meta";
  meta.textContent = translatedHistoryMeta(run);
  openButton.append(title, meta);
  openButton.addEventListener("click", () => {
    void selectRun(run.id);
  });

    if (state.historyEditMode) {
    const selectLabel = document.createElement("label");
    selectLabel.className = "run-history-item__select";
    const selectBox = document.createElement("input");
    selectBox.type = "checkbox";
    selectBox.value = run.id;
    selectBox.checked = state.selectedRunIds.has(run.id);
    selectBox.setAttribute("aria-label", translate("selectRun", { name: displayRunName(run) }));
    selectBox.addEventListener("change", () => {
      if (selectBox.checked) {
        state.selectedRunIds.add(run.id);
      } else {
        state.selectedRunIds.delete(run.id);
      }
      updateSelectionControls();
    });
    selectLabel.append(selectBox);

    const deleteButton = createIconButton(translate("deleteRun"), "trash");
    deleteButton.classList.add("icon-button--danger", "run-history-item__delete");
    deleteButton.addEventListener("click", () => {
      void deleteRuns([run.id]);
    });

    const renameForm = document.createElement("form");
    renameForm.className = "run-history-item__rename";
    const renameInput = document.createElement("input");
    renameInput.type = "text";
    renameInput.value = displayRunName(run);
    renameInput.autocomplete = "off";
    renameInput.setAttribute("aria-label", translate("renameRun", { name: displayRunName(run) }));
    renameInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        renameInput.value = displayRunName(run);
        renameInput.blur();
      }
    });
    const renameButton = createIconButton(translate("saveName"), "check");
    renameButton.type = "submit";
    renameForm.append(renameInput, renameButton);
    renameForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void renameRun(run.id, renameInput.value);
    });

    item.append(selectLabel, openButton, deleteButton, renameForm);
    return item;
  }
  item.append(openButton);
  return item;
}

async function selectRun(runId) {
  const run = await requestJson(`/api/runs/${encodeURIComponent(runId)}`);
  state.activeRunId = run.id;
  renderRun(run);
  renderRunHistory(state.runs);
  showPanel("activity");
  if (run.status === "running") {
    setGenerateRunning(true);
    startPolling();
    return;
  }
  window.clearInterval(state.pollTimer);
  setGenerateRunning(false);
}

async function refreshActiveRun() {
  if (!state.activeRunId) {
    renderEmptyRun();
    return;
  }
  try {
    const run = await requestJson(`/api/runs/${encodeURIComponent(state.activeRunId)}`);
    renderRun(run, { forceResults: true });
  } catch (error) {
    setInlineMessage(error instanceof Error ? error.message : String(error));
  }
}

async function renameRun(runId, name) {
  const trimmed = String(name ?? "").trim();
  if (trimmed === "") {
    setInlineMessage(translate("runNameEmpty"));
    return;
  }
  try {
    const renamed = await requestJson(`/api/runs/${encodeURIComponent(runId)}/rename`, {
      method: "POST",
      body: JSON.stringify({ name: trimmed }),
    });
    await refreshRunHistory(renamed);
    if (state.activeRunId === runId) {
      renderRun(renamed);
    }
    setInlineMessage(translate("runRenamed"));
  } catch (error) {
    setInlineMessage(error instanceof Error ? error.message : String(error));
  }
}

async function deleteRuns(ids) {
  const runIds = Array.from(new Set(ids.map((id) => String(id)).filter((id) => id !== "")));
  if (runIds.length === 0) {
    return;
  }
  try {
    const result = await requestJson("/api/runs/delete", {
      method: "POST",
      body: JSON.stringify({ ids: runIds }),
    });
    const deletedIds = Array.isArray(result.deletedIds) ? result.deletedIds : runIds;
    const deletedSet = new Set(deletedIds);
    for (const id of deletedIds) {
      state.selectedRunIds.delete(id);
    }
    const activeWasDeleted = deletedSet.has(state.activeRunId);
    await refreshRunHistory();
    if (activeWasDeleted) {
      const nextRun = state.runs[0];
      if (nextRun) {
        await selectRun(nextRun.id);
      } else {
        renderEmptyRun();
        showPanel("history");
      }
    }
    setInlineMessage(translate("deletedRuns", { count: deletedIds.length }));
  } catch (error) {
    setInlineMessage(error instanceof Error ? error.message : String(error));
  }
}

function showPanel(panelName) {
  const nextPanel = panelName === "history" ? "history" : "activity";
  state.activePanel = nextPanel;
  for (const button of elements.railButtons) {
    const isActive = button.dataset.panel === nextPanel;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
  for (const panel of elements.railPanels) {
    const isActive = panel.dataset.panelContent === nextPanel;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  }
  scrollActivePanelIntoView();
}

function scrollActivePanelIntoView() {
  if (!window.matchMedia("(max-width: 760px)").matches) {
    return;
  }
  const activePanel = elements.railPanels.find((panel) => panel.dataset.panelContent === state.activePanel);
  if (!activePanel) {
    return;
  }
  activePanel.scrollIntoView({ block: "start", behavior: "smooth" });
}

function setHistoryEditMode(isEditing) {
  state.historyEditMode = isEditing;
  if (!isEditing) {
    state.selectedRunIds.clear();
  }
  updateSelectionControls();
  renderRunHistory(state.runs);
}

function toggleSelectAllRuns(shouldSelectAll) {
  state.selectedRunIds.clear();
  if (shouldSelectAll) {
    for (const run of state.runs) {
      state.selectedRunIds.add(run.id);
    }
  }
  updateSelectionControls();
  renderRunHistory(state.runs);
}

function setSidebarCollapsed(isCollapsed) {
  state.sidebarCollapsed = isCollapsed;
  elements.appShell.classList.toggle("sidebar-collapsed", isCollapsed);
  elements.settingsToggle.setAttribute("aria-expanded", String(!isCollapsed));
  const label = isCollapsed ? translate("expandSettings") : translate("collapseSettings");
  elements.settingsToggle.title = label;
  elements.settingsToggleLabel.textContent = label;
}

function setRightRailCollapsed(isCollapsed) {
  state.rightRailCollapsed = isCollapsed;
  elements.appShell.classList.toggle("right-rail-collapsed", isCollapsed);
  elements.rightRailToggle.setAttribute("aria-expanded", String(!isCollapsed));
  const label = isCollapsed ? translate("expandRightRail") : translate("collapseRightRail");
  elements.rightRailToggle.title = label;
  elements.rightRailToggleLabel.textContent = label;
}

function prepareNewSession() {
  window.clearInterval(state.pollTimer);
  state.activeRunId = "";
  renderEmptyRun();
  renderRunHistory(state.runs);
  showPanel("activity");
  setGenerateRunning(false);
  setInlineMessage(translate("ready"));
}

function renderRun(run, options = {}) {
  state.activeRunId = run.id;
  const finished = run.summary.completed + run.summary.failed;
  const progress = run.summary.total === 0 ? 0 : Math.round((finished / run.summary.total) * 100);
  elements.runTitle.textContent = `${displayRunName(run)} - ${statusLabel(run.status)}`;
  elements.runSummary.textContent = `${finished} / ${run.summary.total}`;
  elements.progressBar.style.width = `${progress}%`;
  elements.runDir.textContent = run.runDir;
  renderJobs(run.jobs);
  renderResultsIfChanged(run, options);
}

function renderEmptyRun() {
  state.activeRunId = "";
  state.currentImages = [];
  state.resultSignature = "";
  state.selectedImages.clear();
  updateResultToolbar();
  elements.runTitle.textContent = translate("noActiveRun");
  elements.runSummary.textContent = "0 / 0";
  elements.progressBar.style.width = "0%";
  elements.runDir.textContent = translate("outputHint");
  elements.jobList.replaceChildren(createEmptyState(translate("noActiveActivity")));
  elements.resultsGrid.replaceChildren(createEmptyState(translate("noImages")));
}

function renderResultsIfChanged(run, options = {}) {
  const signature = createResultSignature(run);
  const visibleSignature = signature === "" ? `empty:${run.id}:${run.status}` : signature;
  if (!options.forceResults && visibleSignature === state.resultSignature) {
    return;
  }
  state.resultSignature = visibleSignature;
  renderResults(run);
}

function renderJobs(jobs) {
  if (jobs.length === 0) {
    elements.jobList.replaceChildren(createEmptyState(translate("noActiveActivity")));
    return;
  }
  elements.jobList.replaceChildren(
    ...jobs.map((job) => {
      const row = document.createElement("article");
      row.className = "job-row";
      const title = document.createElement("h3");
      title.textContent = `${job.id} - variant ${job.variant}`;
      const status = document.createElement("span");
      status.className = `status status-${job.status}`;
      status.textContent = statusLabel(job.status);
      const prompt = document.createElement("p");
      prompt.textContent = job.prompt;
      row.append(title, status, prompt);
      if (job.error) {
        const error = document.createElement("div");
        error.className = "error-text";
        error.textContent = job.error;
        row.append(error);
      }
      return row;
    }),
  );
}

function renderResults(run) {
  const resultImages = collectResultImages(run);
  state.currentImages = resultImages;
  pruneSelectedImages();
  updateResultToolbar();
  const tiles = [];
  for (let index = 0; index < resultImages.length; index += 1) {
      const result = resultImages[index];
      const imageKey = resultImageKey(result);
      const tile = document.createElement("article");
      tile.className = state.selectedImages.has(imageKey) ? "result-tile is-selected" : "result-tile";
      const selectLabel = document.createElement("label");
      selectLabel.className = "result-select";
      const selectBox = document.createElement("input");
      selectBox.type = "checkbox";
      selectBox.checked = state.selectedImages.has(imageKey);
      selectBox.dataset.imageKey = imageKey;
      selectBox.setAttribute("aria-label", translate("selectImage", { name: result.filename }));
      selectBox.addEventListener("change", () => {
        toggleResultSelection(result, selectBox.checked);
      });
      selectLabel.append(selectBox);
      const imageButton = document.createElement("button");
      imageButton.type = "button";
      imageButton.className = "result-preview";
      imageButton.addEventListener("click", () => {
        openImageViewer(index);
      });
      const img = document.createElement("img");
      img.alt = result.prompt;
      img.loading = "lazy";
      img.decoding = "async";
      img.src = result.url;
      imageButton.append(img);
      const meta = document.createElement("div");
      meta.className = "result-meta";
      const name = document.createElement("strong");
      name.textContent = result.filename;
      const details = document.createElement("details");
      details.className = "result-prompt";
      const summary = document.createElement("summary");
      summary.textContent = translate("showPrompt");
      const prompt = document.createElement("p");
      prompt.textContent = result.promptText;
      details.append(summary, prompt);
      meta.append(name, details);
      tile.append(selectLabel, imageButton, meta);
      tiles.push(tile);
  }
  if (tiles.length === 0) {
    const message = run.status === "running" ? translate("waitingForImage") : translate("noImages");
    elements.resultsGrid.replaceChildren(createEmptyState(message));
    return;
  }
  elements.resultsGrid.replaceChildren(...tiles);
}

function collectResultImages(run) {
  const images = [];
  for (const job of run.jobs) {
    for (const image of job.images) {
      const url = image.url || outputUrl(job.jobDir, image.filename);
      images.push({
        jobId: job.id,
        filename: image.filename,
        url,
        prompt: job.prompt,
        promptText: image.revisedPrompt || job.prompt,
      });
    }
  }
  return images;
}

function toggleResultSelection(result, shouldSelect) {
  const key = resultImageKey(result);
  if (shouldSelect) {
    state.selectedImages.add(key);
  } else {
    state.selectedImages.delete(key);
  }
  updateResultToolbar();
  renderSelectedResultTiles();
}

function toggleSelectAllImages(shouldSelectAll) {
  state.selectedImages.clear();
  if (shouldSelectAll) {
    for (const image of state.currentImages) {
      state.selectedImages.add(resultImageKey(image));
    }
  }
  updateResultToolbar();
  renderSelectedResultTiles();
}

function renderSelectedResultTiles() {
  for (const tile of elements.resultsGrid.querySelectorAll(".result-tile")) {
    const checkbox = tile.querySelector(".result-select input");
    if (!checkbox) {
      continue;
    }
    checkbox.checked = state.selectedImages.has(checkbox.dataset.imageKey);
    tile.classList.toggle("is-selected", checkbox.checked);
  }
}

function updateResultToolbar() {
  const selectedCount = state.selectedImages.size;
  const imageCount = state.currentImages.length;
  elements.resultToolbar.hidden = state.currentImages.length === 0;
  elements.selectAllImages.checked = imageCount > 0 && selectedCount === imageCount;
  elements.selectAllImages.indeterminate = selectedCount > 0 && selectedCount < imageCount;
  elements.selectAllImages.disabled = imageCount === 0;
  elements.resultSelectionCount.textContent =
    selectedCount === 0
      ? translate("imageCount", { count: imageCount })
      : translate("selectedCount", { count: selectedCount });
  elements.downloadSelectedImages.disabled = selectedCount === 0;
  elements.deleteSelectedImages.disabled = selectedCount === 0;
}

function pruneSelectedImages() {
  const available = new Set(state.currentImages.map((image) => resultImageKey(image)));
  for (const key of Array.from(state.selectedImages)) {
    if (!available.has(key)) {
      state.selectedImages.delete(key);
    }
  }
}

function selectedImageRecords() {
  return state.currentImages.filter((image) => state.selectedImages.has(resultImageKey(image)));
}

function downloadSelectedImages() {
  for (const image of selectedImageRecords()) {
    const link = document.createElement("a");
    link.href = image.url;
    link.download = image.filename;
    document.body.append(link);
    link.click();
    link.remove();
  }
}

function requestDeleteSelectedImages() {
  const images = selectedImageRecords();
  if (images.length === 0) {
    return;
  }
  state.pendingDeleteImages = images;
  elements.confirmMessage.textContent = translate("deleteSelectedImagesMessage", { count: images.length });
  elements.confirmDialog.hidden = false;
  elements.confirmDeleteImages.focus();
}

async function confirmDeleteSelectedImages() {
  const images = state.pendingDeleteImages.map((image) => ({ jobId: image.jobId, filename: image.filename }));
  if (images.length === 0 || !state.activeRunId) {
    closeConfirmDialog();
    return;
  }
  try {
    const result = await requestJson(`/api/runs/${encodeURIComponent(state.activeRunId)}/images/delete`, {
      method: "POST",
      body: JSON.stringify({ images }),
    });
    const deletedImages = Array.isArray(result.deletedImages) ? result.deletedImages : images;
    for (const image of deletedImages) {
      state.selectedImages.delete(resultImageKey(image));
    }
    closeConfirmDialog();
    const run = await requestJson(`/api/runs/${encodeURIComponent(state.activeRunId)}`);
    renderRun(run);
    await refreshRunHistory(run);
    setInlineMessage(translate("deletedImages", { count: deletedImages.length }));
  } catch (error) {
    setInlineMessage(error instanceof Error ? error.message : String(error));
  }
}

function closeConfirmDialog() {
  state.pendingDeleteImages = [];
  elements.confirmDialog.hidden = true;
}

function openImageViewer(index) {
  if (index < 0 || index >= state.currentImages.length) {
    return;
  }
  state.imageViewerIndex = index;
  state.imageViewerZoom = 1;
  elements.imageViewer.hidden = false;
  renderImageViewer();
  elements.viewerClose.focus();
}

function closeImageViewer() {
  state.imageViewerIndex = -1;
  elements.imageViewer.hidden = true;
}

function moveImageViewer(delta) {
  if (state.currentImages.length === 0 || state.imageViewerIndex < 0) {
    return;
  }
  state.imageViewerIndex = (state.imageViewerIndex + delta + state.currentImages.length) % state.currentImages.length;
  state.imageViewerZoom = 1;
  renderImageViewer();
}

function zoomImageViewer(delta) {
  setImageViewerZoom(state.imageViewerZoom + delta);
}

function setImageViewerZoom(zoom) {
  state.imageViewerZoom = Math.min(4, Math.max(0.5, zoom));
  renderImageViewer();
}

function renderImageViewer() {
  const image = state.currentImages[state.imageViewerIndex];
  if (!image) {
    closeImageViewer();
    return;
  }
  elements.viewerImage.src = image.url;
  elements.viewerImage.alt = image.prompt;
  elements.viewerImage.style.transform = `scale(${state.imageViewerZoom})`;
  elements.viewerCaption.textContent = `${image.filename} - ${Math.round(state.imageViewerZoom * 100)}%`;
  elements.viewerReset.textContent = `${Math.round(state.imageViewerZoom * 100)}%`;
}

function handleGlobalKeydown(event) {
  if (!elements.confirmDialog.hidden && event.key === "Escape") {
    closeConfirmDialog();
    return;
  }
  if (elements.imageViewer.hidden) {
    return;
  }
  if (event.key === "Escape") {
    closeImageViewer();
  } else if (event.key === "ArrowLeft") {
    moveImageViewer(-1);
  } else if (event.key === "ArrowRight") {
    moveImageViewer(1);
  }
}

function resultImageKey(image) {
  return `${image.jobId}/${image.filename}`;
}

function outputUrl(jobDir, filename) {
  const marker = `${normalizeSlashes("/outputs/")}`;
  const normalized = normalizeSlashes(jobDir);
  const index = normalized.indexOf(marker);
  if (index < 0) {
    return "";
  }
  const relative = normalized.slice(index + marker.length);
  return `/outputs/${relative}/${encodeURIComponent(filename)}`;
}

function normalizeSlashes(value) {
  return String(value).replaceAll("\\", "/");
}

function pruneSelectedRunIds() {
  const availableIds = new Set(state.runs.map((run) => run.id));
  for (const id of Array.from(state.selectedRunIds)) {
    if (!availableIds.has(id)) {
      state.selectedRunIds.delete(id);
    }
  }
}

function updateSelectionControls() {
  const selectedCount = state.selectedRunIds.size;
  const allSelected = state.runs.length > 0 && selectedCount === state.runs.length;
  elements.historyToolbar.hidden = !state.historyEditMode;
  elements.editHistoryButton.textContent = state.historyEditMode ? translate("done") : translate("edit");
  elements.editHistoryButton.setAttribute("aria-pressed", String(state.historyEditMode));
  elements.historySelectionCount.textContent = translate("selectedCount", { count: selectedCount });
  elements.selectAllRuns.checked = allSelected;
  elements.selectAllRuns.indeterminate = selectedCount > 0 && !allSelected;
  elements.selectAllRuns.disabled = state.runs.length === 0;
  elements.deleteSelectedRuns.disabled = selectedCount === 0;
  elements.deleteSelectedRuns.textContent =
    selectedCount === 0 ? translate("deleteSelected") : translate("deleteCount", { count: selectedCount });
}

function translatedHistoryMeta(run) {
  const completed = run?.summary?.completed ?? 0;
  const total = run?.summary?.total ?? 0;
  return `${statusLabel(run?.status)} - ${completed}/${total}`;
}

function statusLabel(status) {
  return translate(`status.${status || "unknown"}`);
}

function setGenerateRunning(isRunning) {
  elements.generateButton.disabled = isRunning;
  elements.generateButton.textContent = isRunning ? translate("running") : translate("generate");
}

function timeoutMinutesToMs(value) {
  const minutes = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60000) : 900000;
}

function msToRoundedMinutes(value) {
  const milliseconds = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(milliseconds) && milliseconds > 0 ? String(Math.round(milliseconds / 60000)) : "15";
}

function createIconButton(label, iconName) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(createSvgIcon(iconName));
  return button;
}

function createSvgIcon(iconName) {
  const paths = {
    check: "M5 13l4 4L19 7",
    trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", paths[iconName] ?? paths.check);
  svg.append(path);
  return svg;
}

function createEmptyState(message) {
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function setInlineMessage(message) {
  elements.defaultsNote.textContent = message;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `Request failed with HTTP ${response.status}`);
  }
  return body;
}
