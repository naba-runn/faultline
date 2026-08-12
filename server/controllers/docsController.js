const fs = require('fs').promises;
const path = require('path');
const catchAsync = require('../utils/catchAsync');
const { sendSuccess } = require('../utils/httpResponse');

const API_MD_PATH = path.join(__dirname, '../../docs/API.md');

const getApiDocs = catchAsync(async (req, res) => {
  const content = await fs.readFile(API_MD_PATH, 'utf-8');
  const stat = await fs.stat(API_MD_PATH);

  return sendSuccess(res, 200, {
    markdown: content,
    updatedAt: stat.mtime.toISOString(),
  });
});

module.exports = {
  getApiDocs,
};
