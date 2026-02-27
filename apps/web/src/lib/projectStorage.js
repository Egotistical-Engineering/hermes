const REGISTRY_KEY = 'hermes-projects';
const LEGACY_PAGES_KEY = 'hermes-focus-pages';
const LEGACY_CHAT_KEY = 'hermes-chat-messages';

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

function createProjectEntry(name) {
  const now = Date.now();
  return { id: generateId(), name, createdAt: now, updatedAt: now };
}

// --- localStorage helpers ---

function loadRegistryFromLocal() {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.projects)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveRegistryToLocal(registry) {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    // localStorage unavailable
  }
}

// --- Migration ---

function migrateIfNeeded(registry) {
  if (registry) return registry;

  // Check for legacy content to migrate
  const newProject = createProjectEntry('My First Project');
  const newRegistry = {
    activeProjectId: newProject.id,
    projects: [newProject],
  };

  try {
    const legacyPages = localStorage.getItem(LEGACY_PAGES_KEY);
    if (legacyPages) {
      localStorage.setItem(
        `hermes-project-${newProject.id}-pages`,
        legacyPages
      );
      localStorage.removeItem(LEGACY_PAGES_KEY);
    }

    const legacyChat = localStorage.getItem(LEGACY_CHAT_KEY);
    if (legacyChat) {
      localStorage.setItem(
        `hermes-project-${newProject.id}-chat`,
        legacyChat
      );
      localStorage.removeItem(LEGACY_CHAT_KEY);
    }
  } catch {
    // localStorage unavailable
  }

  saveRegistryToLocal(newRegistry);
  return newRegistry;
}

// --- Public API ---

export function loadProjectRegistry() {
  const raw = loadRegistryFromLocal();
  const registry = migrateIfNeeded(raw);

  // Ensure at least one project exists
  if (registry.projects.length === 0) {
    const project = createProjectEntry('Untitled');
    registry.projects.push(project);
    registry.activeProjectId = project.id;
    saveRegistryToLocal(registry);
  }

  // Ensure activeProjectId points to a valid project
  if (!registry.projects.some((p) => p.id === registry.activeProjectId)) {
    registry.activeProjectId = registry.projects[0].id;
    saveRegistryToLocal(registry);
  }

  return registry;
}

export function saveProjectRegistry(registry) {
  saveRegistryToLocal(registry);
}

export function loadProjectPages(projectId) {
  try {
    const raw = localStorage.getItem(`hermes-project-${projectId}-pages`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProjectPages(projectId, pages) {
  try {
    localStorage.setItem(
      `hermes-project-${projectId}-pages`,
      JSON.stringify(pages)
    );
  } catch {
    // localStorage unavailable
  }
}

export function loadProjectChat(projectId) {
  try {
    const raw = localStorage.getItem(`hermes-project-${projectId}-chat`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProjectChat(projectId, messages) {
  try {
    localStorage.setItem(
      `hermes-project-${projectId}-chat`,
      JSON.stringify(messages)
    );
  } catch {
    // localStorage unavailable
  }
}

export function createProject(name) {
  const registry = loadProjectRegistry();
  const project = createProjectEntry(name);
  registry.projects.push(project);
  registry.activeProjectId = project.id;
  saveRegistryToLocal(registry);
  return { registry, project };
}

export function renameProject(projectId, newName) {
  const registry = loadProjectRegistry();
  const project = registry.projects.find((p) => p.id === projectId);
  if (project) {
    project.name = newName;
    project.updatedAt = Date.now();
    saveRegistryToLocal(registry);
  }
  return registry;
}

export function deleteProject(projectId) {
  const registry = loadProjectRegistry();
  registry.projects = registry.projects.filter((p) => p.id !== projectId);

  // Clean up storage
  try {
    localStorage.removeItem(`hermes-project-${projectId}-pages`);
    localStorage.removeItem(`hermes-project-${projectId}-chat`);
  } catch {
    // localStorage unavailable
  }

  // Ensure at least one project exists
  if (registry.projects.length === 0) {
    const project = createProjectEntry('Untitled');
    registry.projects.push(project);
    registry.activeProjectId = project.id;
  } else if (registry.activeProjectId === projectId) {
    registry.activeProjectId = registry.projects[0].id;
  }

  saveRegistryToLocal(registry);
  return registry;
}

export function reconcileWorkspaceProjects(folderNames) {
  const registry = loadProjectRegistry();
  const existingNames = new Set(registry.projects.map((p) => p.name));
  let added = false;

  for (const name of folderNames) {
    if (!existingNames.has(name)) {
      registry.projects.push(createProjectEntry(name));
      added = true;
    }
  }

  if (added) {
    saveRegistryToLocal(registry);
  }
  return registry;
}

export function setActiveProject(projectId) {
  const registry = loadProjectRegistry();
  if (registry.projects.some((p) => p.id === projectId)) {
    registry.activeProjectId = projectId;
    saveRegistryToLocal(registry);
  }
  return registry;
}
