'use strict';

/**
 * The only module controllers should import for AI behaviour.
 * Keeping every Gemini call behind this boundary is what makes the provider
 * swappable and the API key impossible to leak into a route handler.
 */
const client = require('./client');

module.exports = {
  isEnabled: client.isEnabled,
  modelName: client.model,
  ...require('./answer'),
  ...require('./intent'),
  ...require('./summarize'),
  ...require('./suggest'),
  embeddings: require('./embeddings'),
};
