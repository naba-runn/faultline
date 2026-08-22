const Project = require('../models/Project');
const ErrorGroup = require('../models/ErrorGroup');
const ErrorEvent = require('../models/ErrorEvent');
const SourceMap = require('../models/SourceMap');
const { generateApiKey, hashApiKey } = require('../utils/apiKey');
const projectApiKeyCache = require('../utils/projectApiKeyCache');

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
    // Task 28.1: included here (unlike listProjects' deliberately
    // trimmed shape) since the dashboard's single-project view is
    // where alert config is actually read/edited.
    alertConfig: project.alertConfig,
  };
}

/**
 * Reads a project's alert config only, scoped to its owner. Returns
 * null under the same not-found-or-not-yours ambiguity as getProject.
 * Kept separate from getProject rather than making callers pluck
 * .alertConfig off the full shape, since alertRoutes' GET is a
 * narrower concern than the full project read.
 */
async function getAlertConfig({ ownerId, projectId }) {
  const project = await Project.findOne({ _id: projectId, ownerId });
  if (!project) return null;

  return project.alertConfig;
}

/**
 * Updates a project's alert config, scoped to its owner. Each field is
 * independently optional — omitting a field leaves it unchanged, same
 * pattern as updateProject's name/githubRepo handling. Uses dotted
 * paths in the update doc (not a single alertConfig: {...} replace) so
 * a partial update (e.g. only { newGroup: true }) doesn't blow away
 * fields the caller didn't mention, like email or severityThreshold.
 */
async function updateAlertConfig({ ownerId, projectId, email, newGroup, severityThreshold, spikeDetection }) {
  const update = {};
  if (email !== undefined) update['alertConfig.email'] = email || null;
  if (newGroup !== undefined) update['alertConfig.newGroup'] = newGroup;
  if (severityThreshold !== undefined) {
    if (severityThreshold.enabled !== undefined) {
      update['alertConfig.severityThreshold.enabled'] = severityThreshold.enabled;
    }
    if (severityThreshold.minSeverity !== undefined) {
      update['alertConfig.severityThreshold.minSeverity'] = severityThreshold.minSeverity;
    }
  }
  if (spikeDetection !== undefined && spikeDetection.enabled !== undefined) {
    update['alertConfig.spikeDetection.enabled'] = spikeDetection.enabled;
  }

  const project = await Project.findOneAndUpdate(
    { _id: projectId, ownerId },
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!project) return null;

  return project.alertConfig;
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
 * Deletes a project, scoped to its owner, along with all associated
 * error groups, error events, and source maps. Returns true if a document
 * was deleted, false under the same not-found-or-not-yours ambiguity.
 *
 * findOneAndDelete, not deleteOne — deleteOne only reports a count, and
 * this needs the deleted document's own apiKeyHash to evict it from
 * utils/projectApiKeyCache.js immediately (see that module's header
 * comment): without this, a just-deleted project's API key would keep
 * authenticating ingestion requests for up to the cache's TTL instead
 * of failing right away.
 */
async function deleteProject({ ownerId, projectId }) {
  const project = await Project.findOneAndDelete({ _id: projectId, ownerId }).select('apiKeyHash');
  if (!project) {
    return false;
  }
  projectApiKeyCache.evict(project.apiKeyHash);

  const groupIds = await ErrorGroup.find({ projectId }).distinct('_id');
  if (groupIds.length > 0) {
    await ErrorEvent.deleteMany({ errorGroupId: { $in: groupIds } });
    await ErrorGroup.deleteMany({ projectId });
  }
  await SourceMap.deleteMany({ projectId });

  return true;
}

module.exports = {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  getAlertConfig,
  updateAlertConfig,
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