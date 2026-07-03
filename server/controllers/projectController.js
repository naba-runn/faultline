const projectService = require('../services/projectService');

async function createProject(req, res) {
  try {
    const { name, githubRepo } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'name is required',
      });
    }

    const { project, apiKey } = await projectService.createProject({
      ownerId: req.user._id,
      name,
      githubRepo,
    });

    res.status(201).json({
      success: true,
      data: { project, apiKey },
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: Object.values(err.errors)
          .map((e) => e.message)
          .join(', '),
      });
    }
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Internal Server Error',
    });
  }
}

async function listProjects(req, res) {
  try {
    const projects = await projectService.listProjects(req.user._id);

    res.status(200).json({
      success: true,
      data: { projects },
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Internal Server Error',
    });
  }
}

module.exports = { createProject, listProjects };