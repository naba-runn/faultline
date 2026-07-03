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

module.exports = { createProject, listProjects };