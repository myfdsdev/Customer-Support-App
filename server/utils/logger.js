'use strict';

/* Tiny leveled logger. Keeps output readable without pulling in winston. */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const current = LEVELS[process.env.LOG_LEVEL] || (process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug);

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function emit(level, args) {
  if (LEVELS[level] < current) return;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${stamp()}] ${level.toUpperCase().padEnd(5)}`, ...args);
}

module.exports = {
  debug: (...a) => emit('debug', a),
  info: (...a) => emit('info', a),
  warn: (...a) => emit('warn', a),
  error: (...a) => emit('error', a),
};
