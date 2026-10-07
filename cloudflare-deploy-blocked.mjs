// Slop-only deployment boundary. No API calls or credential reads.
// A worker's name does not establish account ownership.
console.error('Cloudflare deployment is disabled: no verified personal Slop account is pinned. Never deploy to Parky or a work account. Review docs/CLOUDFLARE-ISOLATION.md and verify ownership of slop.game before replacing this guard.');
process.exitCode = 1;
