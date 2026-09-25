import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const readPublic = name => readFile(new URL('../public/' + name, import.meta.url), 'utf8');

test('terms aliases retain age protections without a US-residency eligibility restriction', async () => {
  const pages = await Promise.all(['terms.html', 'terms/index.html', 'tos/index.html'].map(readPublic));
  for (const page of pages) {
    assert.equal(page, pages[0]);
    assert.match(page, /You must be at least 13/);
    assert.match(page, /If you are under 18, you confirm that a parent or guardian permits your use/);
    assert.match(page, /Residency information is optional and is not an account-eligibility requirement/);
    assert.doesNotMatch(page, /offered only to residents of the United States/);
  }
});

test('privacy aliases describe residency as optional demographic information', async () => {
  const pages = await Promise.all(['privacy.html', 'privacy/index.html'].map(readPublic));
  for (const page of pages) {
    assert.equal(page, pages[0]);
    assert.match(page, /not directed to children under 13/);
    assert.match(page, /Residency information is optional demographic information and is not used to decide whether someone may create an account/);
    assert.doesNotMatch(page, /offered only to residents of the United States/);
  }
});
