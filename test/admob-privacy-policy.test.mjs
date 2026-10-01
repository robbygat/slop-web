import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const policies = () => Promise.all(
  ['privacy.html', 'privacy/index.html'].map(path =>
    readFile(new URL('../public/' + path, import.meta.url), 'utf8')),
);

test('privacy aliases publish the same October 1 policy with retained public controls', async () => {
  const [mirror, canonical] = await policies();
  assert.equal(mirror, canonical);
  assert.match(canonical, /Updated October 1, 2026/);
  assert.match(canonical, /privacy policy, updated October 1, 2026/);
  assert.match(canonical, /href="\/delete-account\/"/);
  assert.match(canonical, /not directed to children under 13/);
  assert.match(canonical, /aria-current="page" href="\/privacy"/);
  assert.equal((canonical.match(/<h2>Advertising and privacy choices<\/h2>/g) || []).length, 1);
});

test('AdMob disclosure stays conditional on the public release and account eligibility', async () => {
  for (const policy of await policies()) {
    assert.match(policy, /Third-party advertising is not enabled in the current public release/);
    assert.match(policy, /In ad-enabled mobile-app releases/);
    assert.match(policy, /signed-in accounts without an active Slop Pro subscription/);
    assert.match(policy, /native ads between feed games/);
    assert.match(policy, /full-screen ads between completed runs/);
    assert.match(policy, /Ads do not appear as banners over gameplay/);
    assert.match(policy, /Unknown account, age, subscription, or permission state prevents an ad request/);
    assert.match(policy, /ages 13–17 with the required guardian attestation/);
    assert.match(policy, /teen and under-age-of-consent treatment/);
  }
});

test('optional adult Apple choice is separate from UMP and does not turn on personalization', async () => {
  for (const policy of await policies()) {
    assert.match(policy, /currently requests non-personalized ads, including when you permit tracking on iOS/);
    assert.match(policy, /eligible adults on iOS may separately be asked/);
    assert.match(policy, /You can decline and keep using Slop/);
    assert.match(policy, /Apple's tracking choice and Google's regional privacy choices are separate/);
    assert.match(policy, /one does not override the other/);
    assert.match(policy, /change Apple's choice in device Settings/);
    assert.match(policy, /User Messaging Platform \(UMP\)/);
  }
});

test('Google categories, identifiers, retention and reachable choices are disclosed without blanket guarantees', async () => {
  for (const policy of await policies()) {
    assert.match(policy, /IP address and approximate location derived from it/);
    assert.match(policy, /identifiers permitted by your device and privacy settings/);
    assert.match(policy, /taps and video interactions, crash information, performance data, and privacy-choice signals/);
    assert.match(policy, /Non-personalized ads can still use identifiers for repetition limits and aggregate reporting/);
    assert.match(policy, /ad requests do not attach your Slop email address, profile name, private messages, prompts, or game source/);
    assert.match(policy, /“Ad privacy choices” in Profile/);
    assert.match(policy, /href="https:\/\/policies.google.com\/privacy"/);
    assert.match(policy, /href="https:\/\/policies.google.com\/technologies\/partner-sites"/);
    assert.match(policy, /diagnostic-retention periods do not set Google's retention periods/);
    assert.doesNotMatch(policy, /We do not sell personal information|no identifiers|processes no data/);
    assert.doesNotMatch(policy, /does not[^<]*request tracking permission|publication[^<]*pending/);
  }
});
