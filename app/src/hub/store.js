'use strict';

const fs = require('node:fs');
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function readHubStore(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, devices: {} };
    throw new Error('Hub data file cannot be read; refusing to initialize an empty store.');
  }
  let store;
  try { store = JSON.parse(content); } catch (_) {
    throw new Error('Hub data file is invalid; original file was left unchanged. Restore a verified backup.');
  }
  if (!object(store) || !object(store.devices) || Object.values(store.devices).some(record => !object(record))
    || ['subscriptions', 'syncSettings', 'syncTitlePolicies'].some(key => store[key] !== undefined && !object(store[key]))) {
    throw new Error('Hub data file has an invalid structure; original file was left unchanged.');
  }
  return store;
}

module.exports = { readHubStore };
