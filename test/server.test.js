import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSafe } from './e2e/server.mjs';

test('resolveSafe serves files inside the root', () => {
  assert.equal(resolveSafe('/srv/site', '/'), '/srv/site/index.html');
  assert.equal(resolveSafe('/srv/site', '/js/main.js'), '/srv/site/js/main.js');
});

test('resolveSafe refuses traversal, including into sibling folders sharing the prefix', () => {
  assert.equal(resolveSafe('/srv/site', '/../etc/passwd'), null);
  assert.equal(resolveSafe('/srv/site', decodeURIComponent('/..%2fsite-secrets%2fkey.txt')), null);
  assert.equal(resolveSafe('/srv/site', '/.git/config'), null);
});
