import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StraleError, InvalidRequestError } from '../dist/index.js';

test('SDK preserves error message and exposes typed recovery properties', () => {
  const details = { retryable: false, next_step: "Correct the input.", fix: "Send 'email' as a non-empty string.", field: 'email' };
  const error = new InvalidRequestError('Email is required.', details);
  assert.equal(error.message, "Email is required.");
  assert.equal(error.fix, details.fix);
  assert.equal(error.retryable, false);
  assert.equal(error.nextStep, details.next_step);
  assert.equal(error.details, details);
  assert.equal(error.errorCode, 'invalid_request');
  assert.equal(error.statusCode, 400);
  assert.equal(new StraleError('execution_failed', 'Failed.', 500).message, 'Failed.');
});

test('SDK omits recovery properties when details have no values of the expected type', () => {
  const error = new StraleError('execution_failed', 'Failed.', 500, { fix: 1, retryable: 'yes', next_step: false });
  assert.equal(error.fix, undefined);
  assert.equal(error.retryable, undefined);
  assert.equal(error.nextStep, undefined);
});
