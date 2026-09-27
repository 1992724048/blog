'use strict'

function failure(code, reason) {
  return Object.freeze({ ok: false, code, reason })
}

module.exports = { failure }
