'use strict';

/**
 * Splits knowledge content into retrieval-sized passages.
 *
 * Paragraph-first, because support docs are written as headed sections and
 * cutting mid-procedure is the fastest way to make an answer wrong. Every
 * chunk is prefixed with the article title so a passage retrieved in isolation
 * still carries its context into the prompt.
 */

const TARGET = 900; // characters
const MAX = 1400;
const OVERLAP = 150;

function splitParagraphs(text) {
  return String(text)
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function hardSplit(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + MAX, text.length);
    if (end < text.length) {
      const dot = text.lastIndexOf('. ', end);
      const nl = text.lastIndexOf('\n', end);
      const cut = Math.max(dot, nl);
      if (cut > i + TARGET / 2) end = cut + 1;
    }
    out.push(text.slice(i, end).trim());
    i = end - OVERLAP > i ? end - OVERLAP : end;
  }
  return out.filter(Boolean);
}

function chunkContent(content, { title = '' } = {}) {
  const paragraphs = splitParagraphs(content);
  const chunks = [];
  let buffer = '';

  const flush = () => {
    const body = buffer.trim();
    if (body) chunks.push(body);
    buffer = '';
  };

  for (const para of paragraphs) {
    if (para.length > MAX) {
      flush();
      chunks.push(...hardSplit(para));
      continue;
    }
    if ((buffer + '\n\n' + para).length > TARGET && buffer) flush();
    buffer = buffer ? `${buffer}\n\n${para}` : para;
  }
  flush();

  if (!chunks.length && String(content).trim()) chunks.push(String(content).trim());

  return chunks.map((body, index) => ({
    chunkIndex: index,
    content: title ? `${title}\n\n${body}` : body,
  }));
}

module.exports = { chunkContent, TARGET, MAX };
