const Project = require('../models/Project');
const { generateApiKey, hashApiKey } = require('../utils/apiKey');

/**
 * Creates a new project owned by the given user. Returns the raw API
 * key alongside the created project — this is the only point in the
 * system where the raw key exists; it's hashed before persistence and
 * never stored or retrievable again. The caller (controller) is
 * responsible for returning it to the user exactly once.
 */
async function createProject({ ownerId, name, githubRepo }) {
  const rawApiKey = generateApiKey();
  const apiKeyHash = hashApiKey(rawApiKey);

  const project = await Project.create({
    ownerId,
    name,
    apiKeyHash,
    githubRepo: githubRepo || null,
  });

  return {
    project: {
      id: project._id,
      name: project.name,
      githubRepo: project.githubRepo,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    apiKey: rawApiKey,
  };
}

/**
 * Fetches a single project, scoped to its owner. Returns null if the
 * project doesn't exist OR belongs to a different user — the caller
 * can't distinguish these cases, deliberately (see DECISIONS.md).
 */
async function getProject({ ownerId, projectId }) {
  const project = await Project.findOne({ _id: projectId, ownerId });
  if (!project) return null;

  return {
    id: project._id,
    name: project.name,
    githubRepo: project.githubRepo,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/**
 * Updates a project's mutable fields (name, githubRepo), scoped to
 * its owner. Returns null under the same not-found-or-not-yours
 * ambiguity as getProject. Does NOT touch apiKeyHash — key rotation
 * is a separate concern, not part of this update path.
 */
async function updateProject({ ownerId, projectId, name, githubRepo }) {
  const update = {};
  if (name !== undefined) update.name = name;
  if (githubRepo !== undefined) update.githubRepo = githubRepo || null;

  const project = await Project.findOneAndUpdate(
    { _id: projectId, ownerId },
    update,
    { new: true, runValidators: true }
  );
  if (!project) return null;

  return {
    id: project._id,
    name: project.name,
    githubRepo: project.githubRepo,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/**
 * Deletes a project, scoped to its owner. Returns true if a document
 * was deleted, false under the same not-found-or-not-yours ambiguity.
 */
async function deleteProject({ ownerId, projectId }) {
  const result = await Project.deleteOne({ _id: projectId, ownerId });
  return result.deletedCount > 0;
}

module.exports = {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
};

/**
 * Lists all projects owned by the given user, most recent first.
 * apiKeyHash is never included in the shaped output.
 */
async function listProjects(ownerId) {
  const projects = await Project.find({ ownerId }).sort({ createdAt: -1 });

  return projects.map((project) => ({
    id: project._id,
    name: project.name,
    githubRepo: project.githubRepo,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }));
}

