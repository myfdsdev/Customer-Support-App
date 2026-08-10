'use strict';

const env = require('../../config/env');
const logger = require('../../utils/logger');

/**
 * Lazy singleton around @google/genai.
 *
 * The whole app must keep working with no API key configured (keyword RAG +
 * extractive answers), so nothing here throws at require-time.
 */
let client = null;
let loadError = null;

function getClient() {
  if (client) return client;
  if (!env.gemini.apiKey) return null;
  if (loadError) return null;

  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    const { GoogleGenAI } = require('@google/genai');
    client = new GoogleGenAI({ apiKey: env.gemini.apiKey });
    logger.info(`Gemini client ready (model: ${env.gemini.model})`);
    return client;
  } catch (err) {
    loadError = err;
    logger.error('Gemini SDK could not be initialised:', err.message);
    return null;
  }
}

const isEnabled = () => Boolean(getClient());

/** Extracts plain text from a generateContent response across SDK shapes. */
function responseText(res) {
  if (!res) return '';
  if (typeof res.text === 'string') return res.text;
  if (typeof res.text === 'function') return res.text();
  const parts = res?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('').trim();
}

/**
 * Single entry point for text generation. Returns null on any failure so
 * callers fall back to deterministic behaviour instead of surfacing an error
 * to the customer.
 */
async function generate({ prompt, systemInstruction, json = false, temperature = 0.2, maxOutputTokens = 1400 }) {
  const ai = getClient();
  if (!ai) return null;

  const config = {
    temperature,
    maxOutputTokens,
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(json ? { responseMimeType: 'application/json' } : {}),
  };

  try {
    const res = await ai.models.generateContent({
      model: env.gemini.model,
      contents: prompt,
      config,
    });
    return responseText(res);
  } catch (err) {
    logger.error('Gemini generate failed:', err.message);
    return null;
  }
}

/** Tolerant JSON parse — models occasionally wrap JSON in prose or fences. */
function parseJson(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

module.exports = { getClient, isEnabled, generate, parseJson, responseText, model: () => env.gemini.model };
