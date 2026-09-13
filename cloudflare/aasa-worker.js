// Serves /.well-known/apple-app-site-association with Content-Type: application/json
// while the rest of slop.game stays on GitHub Pages.
//
// Deploy (after slop.game is a Cloudflare zone):
//   npx wrangler deploy
//
// Keep body in sync with docs/apple-app-site-association

const AASA = `{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "6S8Z64V9JP.game.slop.slop",
        "paths": ["/play/*", "/r/*", "/g/*", "/invite/*", "/mcp/pair"]
      }
    ]
  }
}`;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/.well-known/apple-app-site-association'
      && url.pathname !== '/apple-app-site-association') {
      return fetch(request);
    }
    return new Response(AASA, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  },
};
