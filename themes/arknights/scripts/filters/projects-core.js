'use strict'

const { unescapeHTML } = require('hexo-util')

const HTML_ESCAPE_PATTERN = /[&<>"']/g
const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

const PROJECT_MARKER_PATTERN = /^\[&\]PJ\|([^|]*)\|([^|]*)\|([^|]*)\|$/
const PROJECT_MARKER_LINE_PATTERN = /^([ \t]*)(\[(?:&|&amp;)\]PJ\|[^\r\n]*)(?=\r?$)/gm
const PROJECT_TOKEN_PREFIX = 'arknights-project-marker:'
const PROJECT_TOKEN_PATTERN = /^arknights-project-marker:([A-Za-z0-9_-]+)$/
const PARAGRAPH_PATTERN = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi
const SINGLE_PARAGRAPH_PATTERN = /^<p\b([^>]*)>([\s\S]*?)<\/p>$/i
const LINE_BREAK_PATTERN = /<br\s*\/?>(?:[ \t]*\r?\n)?|\r?\n/gi
const PROTECTED_SEGMENT = /(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<a\b[\s\S]*?<\/a>|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<[^>]*>)/g

const escapeHtml = (value) => value.replace(HTML_ESCAPE_PATTERN, (character) => HTML_ESCAPES[character])

const hasProjectSyntax = (value) =>
  value.includes('[&]') || value.includes('[&amp;]') || value.includes(PROJECT_TOKEN_PREFIX)

const encodeProjectMarker = (marker) =>
  `${PROJECT_TOKEN_PREFIX}${Buffer.from(marker, 'utf8').toString('base64url')}`

const protectProjectMarkup = (content) => {
  if (typeof content !== 'string' || !hasProjectSyntax(content)) return content

  return content.replace(
    PROJECT_MARKER_LINE_PATTERN,
    (_match, indentation, marker) => `${indentation}${encodeProjectMarker(marker)}`
  )
}

const parseProjectMarker = (line) => {
  if (typeof line !== 'string') return null

  const match = PROJECT_MARKER_PATTERN.exec(unescapeHTML(line.trim()))
  if (!match) return null

  const project = {
    name: match[1].trim(),
    link: match[2].trim(),
    image: match[3].trim()
  }
  if (!project.name || !project.link || !project.image) return null
  return project
}

const decodeProtectedMarker = (line) => {
  if (typeof line !== 'string') return null
  const match = PROJECT_TOKEN_PATTERN.exec(line.trim())
  if (!match) return null
  return Buffer.from(match[1], 'base64url').toString('utf8')
}

const parseProjectLine = (line) => {
  const protectedMarker = decodeProtectedMarker(line)
  const marker = protectedMarker === null ? line : protectedMarker
  return {
    project: parseProjectMarker(marker),
    plainText: protectedMarker === null ? line : escapeHtml(protectedMarker)
  }
}

const renderCard = ({ name, link, image }) => {
  const safeName = escapeHtml(name)
  const safeLink = escapeHtml(link)
  const safeImage = escapeHtml(image)
  const attributes = [
    `href="${safeLink}"`,
    'target="_blank"',
    'rel="noopener"',
    `style="--card-img: url('${safeImage}')"`
  ].join(' ')

  return `<a class="project-card" ${attributes}>\n` +
    `  <img src="${safeImage}" alt="${safeName}" loading="lazy">\n` +
    `  <div class="project-name">${safeName}</div>\n` +
    '</a>'
}

const renderGrid = (projects) =>
  `<div class="projects-grid">\n${projects.map(renderCard).join('\n')}\n</div>`

const transformLineEntries = (entries, renderPlainEntries) => {
  let output = ''
  let plainEntries = []
  let projects = []

  const flushPlainEntries = (trimTrailingSeparator = false) => {
    if (plainEntries.length === 0) return
    const entriesToRender = trimTrailingSeparator
      ? plainEntries.map((entry, index) =>
        index === plainEntries.length - 1 ? { ...entry, separator: '' } : entry
      )
      : plainEntries
    output += renderPlainEntries(entriesToRender)
    plainEntries = []
  }
  const flushProjects = () => {
    if (projects.length === 0) return
    output += renderGrid(projects)
    projects = []
  }

  for (const entry of entries) {
    if (entry.project) {
      flushPlainEntries(true)
      projects.push(entry.project)
      continue
    }
    flushProjects()
    plainEntries.push(entry)
  }
  flushPlainEntries()
  flushProjects()
  return output
}

const transformPlainLines = (text) => {
  const lines = text.split(/\r?\n/)
  const entries = lines.map((line, index) => ({
    ...parseProjectLine(line),
    separator: index < lines.length - 1 ? '\n' : ''
  }))
  return transformLineEntries(entries, (plainEntries) =>
    plainEntries.map(({ plainText, separator }) => plainText + separator).join('')
  )
}

const transformParagraph = (paragraph) => {
  const match = SINGLE_PARAGRAPH_PATTERN.exec(paragraph)
  if (!match) return paragraph

  const parts = match[2].split(LINE_BREAK_PATTERN)
  const separators = match[2].match(LINE_BREAK_PATTERN) || []
  const entries = parts.map((text, index) => ({
    ...parseProjectLine(text),
    separator: separators[index] || ''
  }))
  if (!entries.some(({ project }) => project)) return paragraph

  return transformLineEntries(entries, (plainEntries) => {
    const plainText = plainEntries.map(({ plainText: text, separator }) => text + separator).join('')
    return `<p${match[1]}>${plainText}</p>`
  })
}

const replaceUnwrappedLines = (html) =>
  html
    .split(PROTECTED_SEGMENT)
    .map((segment, index) => (index % 2 === 1 ? segment : transformPlainLines(segment)))
    .join('')

const replaceProjectMarkup = (html) => {
  if (typeof html !== 'string' || !hasProjectSyntax(html)) return html

  const transformedParagraphs = html.replace(PARAGRAPH_PATTERN, transformParagraph)
  return replaceUnwrappedLines(transformedParagraphs)
}

const isProjectsPage = (data) =>
  Boolean(data && data.type === 'projects' && !data.encrypt && !data.password)

const prepareProjectsPage = (data) => {
  if (!isProjectsPage(data)) return data
  data.content = protectProjectMarkup(data.content)
  return data
}

const transformProjectsPage = (data) => {
  if (!isProjectsPage(data)) return data
  data.content = replaceProjectMarkup(data.content)
  return data
}

module.exports = {
  prepareProjectsPage,
  protectProjectMarkup,
  replaceProjectMarkup,
  transformProjectsPage
}
