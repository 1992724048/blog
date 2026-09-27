'use strict'

function readFields(input, handlerName) {
  if (input === null || typeof input !== 'object' || input.fields === null ||
      typeof input.fields !== 'object') {
    throw new TypeError(`${handlerName} input fields must be an object`)
  }
  return input.fields
}

module.exports = { readFields }
