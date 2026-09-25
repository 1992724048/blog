'use strict';

const crypto = require('crypto');
const { stripHTML } = require('hexo-util');
const { projectText } = require('../../markers/pipeline');
const { replaceTerms, buildTermsList } = require('../../filters/terms-core');
const { inspectSearchEncryption } = require('../../filters/encryption-policy');

const SNAPSHOT_KEY = '__arknightsSearchSnapshot';
const SNAPSHOT_SCHEMA = 'arknights-search-snapshot';
const SNAPSHOT_VERSION = 1;
const SNAPSHOT_FIELDS = Object.freeze([
  'schema',
  'version',
  'documentId',
  'documentSource',
  'path',
  'sourceHash',
  'renderedHash',
  'termsHash',
  'encrypted',
  'searchText',
  'snapshotHash'
]);
const INTERNAL_SEARCH_PATTERN =
  /data-arknights-carrier|arknights-marker-v1:|arknights-(?:pj-card|grid-(?:open|close))-|\u0000/u;

function hashText(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function getTermList(hexo) {
  const themeConfig = hexo.config.theme_config;
  const terms = themeConfig && themeConfig.terms;
  const termList = terms && terms.list;
  return Array.isArray(termList) ? termList : [];
}

function getTermsHash(hexo) {
  const canonicalTerms = getTermList(hexo).map(term => [term.term, term.url]);
  return hashText(JSON.stringify(canonicalTerms));
}

function getDocumentIdentity(document) {
  const documentId = document._id;
  const documentSource = document.source;
  const documentPath = document.path;
  if (
    (typeof documentId !== 'string' && typeof documentId !== 'number') ||
    typeof documentSource !== 'string' ||
    typeof documentPath !== 'string' ||
    documentPath.length === 0
  ) {
    return null;
  }
  return { documentId, documentSource, path: documentPath };
}

function getSnapshot(document) {
  const descriptor = Object.getOwnPropertyDescriptor(document, SNAPSHOT_KEY);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
  return descriptor.value;
}

function getSnapshotPayload(snapshot) {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const fields = Object.keys(snapshot);
  if (
    fields.length !== SNAPSHOT_FIELDS.length ||
    fields.some(field => !SNAPSHOT_FIELDS.includes(field))
  ) {
    return null;
  }

  const payload = {
    schema: snapshot.schema,
    version: snapshot.version,
    documentId: snapshot.documentId,
    documentSource: snapshot.documentSource,
    path: snapshot.path,
    sourceHash: snapshot.sourceHash,
    renderedHash: snapshot.renderedHash,
    termsHash: snapshot.termsHash,
    encrypted: snapshot.encrypted,
    searchText: snapshot.searchText
  };
  if (
    payload.schema !== SNAPSHOT_SCHEMA ||
    payload.version !== SNAPSHOT_VERSION ||
    (typeof payload.documentId !== 'string' && typeof payload.documentId !== 'number') ||
    typeof payload.documentSource !== 'string' ||
    typeof payload.path !== 'string' ||
    typeof payload.termsHash !== 'string' ||
    typeof payload.encrypted !== 'boolean' ||
    typeof payload.searchText !== 'string' ||
    (payload.encrypted && (payload.searchText !== '' || payload.sourceHash !== null || payload.renderedHash !== null)) ||
    (!payload.encrypted && (typeof payload.sourceHash !== 'string' || typeof payload.renderedHash !== 'string'))
  ) {
    return null;
  }
  return payload;
}

function getSnapshotIntegrity(payload) {
  return hashText(JSON.stringify(payload));
}

function buildSnapshot(payload) {
  return Object.freeze({
    ...payload,
    snapshotHash: getSnapshotIntegrity(payload)
  });
}

function validateSnapshotIntegrity(snapshot, payload) {
  return typeof snapshot.snapshotHash === 'string' &&
    snapshot.snapshotHash === getSnapshotIntegrity(payload)
}

function projectSearchText(projection, termList) {
  if (INTERNAL_SEARCH_PATTERN.test(projection)) return null;
  const matched = new Map();
  let projected = replaceTerms(projection, termList, matched);
  const termsSection = buildTermsList(matched);
  if (termsSection) projected += termsSection;
  let searchText = stripHTML(projected.replace(/<td class="gutter">.*?<\/td>/g, ''));
  if (INTERNAL_SEARCH_PATTERN.test(searchText)) return null;
  return searchText;
}

function captureSearchSnapshot(hexo, document) {
  try {
    const searchConfig = getSearchConfig(hexo);
    if (searchConfig.enable === false || searchConfig.content === false) return false;
    const identity = getDocumentIdentity(document);
    if (identity === null) return false;
    const termsHash = getTermsHash(hexo);
    const encryption = inspectSearchEncryption(document, hexo.config.encrypt);
    let payload

    if (encryption.state !== 'public') {
      payload = {
        schema: SNAPSHOT_SCHEMA,
        version: SNAPSHOT_VERSION,
        ...identity,
        sourceHash: null,
        renderedHash: null,
        termsHash,
        encrypted: true,
        searchText: ''
      };
    } else {
      const source = document._content;
      const rendered = document.content;
      const projection = projectText(document, 'content');
      if (
        typeof source !== 'string' ||
        typeof rendered !== 'string' ||
        typeof projection !== 'string'
      ) {
        return false;
      }
      const searchText = projectSearchText(projection, getTermList(hexo));
      if (typeof searchText !== 'string') return false;
      payload = {
        schema: SNAPSHOT_SCHEMA,
        version: SNAPSHOT_VERSION,
        ...identity,
        sourceHash: hashText(source),
        renderedHash: hashText(rendered),
        termsHash,
        encrypted: false,
        searchText
      };
    }

    document[SNAPSHOT_KEY] = buildSnapshot(payload);
    return true;
  } catch {
    return false;
  }
}

function hasCurrentSnapshot(document, hexo, encryptionState = null) {
  try {
    const state = encryptionState ?? inspectSearchEncryption(document, hexo.config.encrypt).state;
    if (state !== 'public') return false;
    const identity = getDocumentIdentity(document);
    const termsHash = getTermsHash(hexo);
    const snapshot = getSnapshot(document);
    const payload = getSnapshotPayload(snapshot);
    if (identity === null || payload === null || !validateSnapshotIntegrity(snapshot, payload)) return false;
    if (
      payload.documentId !== identity.documentId ||
      payload.documentSource !== identity.documentSource ||
      payload.path !== identity.path ||
      payload.termsHash !== termsHash ||
      payload.encrypted !== false
    ) {
      return false;
    }
    const source = document._content;
    const rendered = document.content;
    return typeof source === 'string' &&
      typeof rendered === 'string' &&
      payload.sourceHash === hashText(source) &&
      payload.renderedHash === hashText(rendered);
  } catch {
    return false;
  }
}

function hasCurrentEncryptedSnapshot(document, hexo, encryptionState) {
  try {
    const identity = getDocumentIdentity(document);
    const termsHash = getTermsHash(hexo);
    const snapshot = getSnapshot(document);
    const payload = getSnapshotPayload(snapshot);
    return encryptionState !== 'public' &&
      identity !== null &&
      payload !== null &&
      validateSnapshotIntegrity(snapshot, payload) &&
      payload.documentId === identity.documentId &&
      payload.documentSource === identity.documentSource &&
      payload.path === identity.path &&
      payload.termsHash === termsHash &&
      payload.encrypted === true;
  } catch {
    return false;
  }
}

function consumeSearchText(document, hexo) {
  try {
    const encryption = inspectSearchEncryption(document, hexo.config.encrypt);
    if (encryption.state !== 'public') return '';
    if (!hasCurrentSnapshot(document, hexo, encryption.state)) return '';
    return getSnapshotPayload(getSnapshot(document)).searchText;
  } catch {
    return '';
  }
}

function getSearchConfig(hexo) {
  const search = hexo.theme && hexo.theme.config && hexo.theme.config.search;
  return search && typeof search === 'object' ? search : {};
}

function getModelNames(searchConfig) {
  if (searchConfig.field === 'page') return ['Page'];
  if (searchConfig.field === 'all') return ['Post', 'Page'];
  return ['Post'];
}

async function repairSearchSnapshots(hexo) {
  const searchConfig = getSearchConfig(hexo);
  if (searchConfig.enable === false || searchConfig.content === false) return 0;
  let renderCount = 0;

  for (const modelName of getModelNames(searchConfig)) {
    const documents = hexo.model(modelName).toArray();
    for (const document of documents) {
      const encryption = inspectSearchEncryption(document, hexo.config.encrypt);
      const current = encryption.state === 'public'
        ? hasCurrentSnapshot(document, hexo, encryption.state)
        : hasCurrentEncryptedSnapshot(document, hexo, encryption.state);
      if (current) continue;
      const source = document._content;
      if (typeof source !== 'string') continue;
      document.content = source;
      await hexo.post.render(document.full_source, document);
      await document.save();
      renderCount += 1;
    }
  }
  return renderCount;
}

module.exports = {
  SNAPSHOT_KEY,
  captureSearchSnapshot,
  consumeSearchText,
  hasCurrentSnapshot,
  repairSearchSnapshots
};
