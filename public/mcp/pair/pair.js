// Keep the one-time challenge in the URL fragment. It must never become a
// server query, a referrer, an analytics event, or automatic approval.
(() => {
  const raw=location.hash.slice(1);
  const valid=!location.search && /^(?:id=[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}&code=[0-9a-f]{32}|code=[0-9a-f]{32}&id=[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.test(raw);
  if(!valid){document.getElementById('status').textContent='This pairing link is incomplete or invalid. Ask your agent for a new link.';return;}
  const params=new URLSearchParams(raw);
  const target=`/#/connect?id=${params.get('id')}&code=${params.get('code')}`;
  document.getElementById('continue').href=target;
  location.replace(target);
})();
