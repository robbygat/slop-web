// Only the code can vary. No URL, account ID, or redirect target is accepted.
const params = new URLSearchParams(location.search);
const queryCode = location.pathname === '/invite/' && [...params.keys()].length === 1 && params.getAll('code').length === 1 && /^[a-f0-9]{8}$/i.test(params.get('code') || '') ? params.get('code') : null;
const match = queryCode ? [null, queryCode] : (!location.search ? /^\/invite\/([a-f0-9]{8})$/i.exec(location.pathname) : null);
const status = document.getElementById('status');
if (!match || location.hash) {
  status.textContent = 'This invite link is incomplete. Ask your friend to share it again.';
} else {
  const code = match[1].toUpperCase();
  const open = document.getElementById('open-app');
  open.href = 'io.slop.game://invite?code=' + encodeURIComponent(code);
  open.hidden = false;
  open.addEventListener('click', () => {
    status.textContent = 'If Slop didn’t open, get the latest app or copy this code into Settings → Invite friends.';
  });
  const copy = document.getElementById('copy-code');
  copy.hidden = false;
  copy.textContent = code + ' · Copy';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      status.textContent = 'Code copied. Use it in Slop → Settings → Invite friends.';
    } catch (_) {
      status.textContent = 'Your invite code is ' + code + '. Enter it in Slop → Settings → Invite friends.';
    }
  });

  const web = document.getElementById('web-invite');
  const accountStatus = document.getElementById('account-status');
  const rewardStatus = document.getElementById('reward-status');
  const signIn = document.getElementById('sign-in');
  const accept = document.getElementById('accept-code');
  let client, owner, generation = 0, busy = false, starting = false;
  function account(session) {
    generation++;
    owner = session?.user?.is_anonymous ? null : session?.user?.id;
    busy = false;
    rewardStatus.textContent = '';
    signIn.hidden = !!owner;
    accept.hidden = !owner;
    accept.disabled = false;
    accountStatus.textContent = owner ? 'Signed in as ' + (session.user.email || 'your Slop account') : 'Sign in to your Slop account. Your rewards are shared with the app.';
  }
  web.addEventListener('toggle', async () => {
    if (!web.open || client || starting) return;
    starting = true;
    try {
      // Reuse the website’s actual auth client and session. No Slop service
      // credential or duplicate authentication store is introduced here.
      const {getSupabase} = await import('/js/supabase.js');
      client = getSupabase();
      const {data, error} = await client.auth.getSession();
      if (error) throw error;
      account(data.session);
      client.auth.onAuthStateChange((_event, session) => account(session));
    } catch (_) {
      client = null;
      accountStatus.textContent = 'Couldn’t load sign-in. Close and reopen this section to retry, or use your code in the app.';
    } finally { starting = false; }
  });
  signIn.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!client || busy) return;
    busy = true;
    signIn.querySelector('button').disabled = true;
    const password = document.getElementById('password');
    try {
      const {data, error} = await client.auth.signInWithPassword({email: document.getElementById('email').value.trim(), password: password.value});
      password.value = '';
      if (error) throw error;
      account(data.session);
    } catch (_) { accountStatus.textContent = 'Couldn’t sign in. Check your email and password, then try again.'; }
    finally { busy = false; signIn.querySelector('button').disabled = false; }
  });
  accept.addEventListener('click', async () => {
    if (!client || !owner || busy) return;
    const revision = generation;
    busy = true; accept.disabled = true;
    try {
      const {data, error} = await client.rpc('apply_referral', {p_code: code});
      if (revision !== generation) return;
      if (error) throw error;
      const messages = {
        ok: 'Invite accepted! You and your friend received 50 Slop Coins. Come back after your first day and finish a public game to count toward their SLOP Code skin.',
        already: 'You’ve already used a friend’s invite. Your existing rewards are safe.',
        self: 'This is your own invite code. Share it with a friend!',
        expired: 'Invite codes can be used during your first 7 days on Slop.',
        invalid: 'This invite code isn’t available. Ask your friend to check it.',
        signin: 'Please sign in again to accept this invite.',
        rate_limited: 'Too many attempts. Try again in a little while.'
      };
      rewardStatus.textContent = messages[data] || 'Couldn’t accept this invite. Please try again.';
      accept.disabled = ['ok', 'already', 'expired'].includes(data);
    } catch (_) {
      if (revision === generation) { rewardStatus.textContent = 'Couldn’t accept the invite. Please try again.'; accept.disabled = false; }
    } finally { if (revision === generation) busy = false; }
  });
}
