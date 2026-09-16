import React, {useEffect, useId, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {searchPeople, followPerson, loadGames} from '../lib/catalog.js';
import {supabase, result} from '../lib/supabase.js';
import {useAuth} from '../auth.jsx';
import {Button, Loading, Notice, Slop, useAsync, Modal} from '../components/ui.jsx';
import {Icon} from '../components/Icon.jsx';
import {PUBLIC_PROFILE_COLUMNS, profileBackdrop} from '../lib/profile-banners.js';
import NativeEyePortrait from '../components/NativeEyePortrait.jsx';
import {GameCard, GameDetail} from './Play.jsx';
import './social.css';

const palettes = {
  tangerine: ['#ffb13b', '#ff8a22', '#8a361e'],
  mint: ['#9bf3c6', '#48dc96', '#165d43'],
  bubblegum: ['#ffaad0', '#ff6fae', '#8b2757'],
  grape: ['#c79bff', '#9a5cf6', '#4e2b80'],
  lavender: ['#d1b6ff', '#ae88ea', '#61467e'],
  blueberry: ['#93c6ff', '#4a93ff', '#284a84'],
  aqua: ['#8aebf7', '#32c8df', '#176276'],
  lime: ['#ddf97c', '#aee62e', '#4b641e'],
  peach: ['#ffd6c0', '#ffa785', '#865142'],
  void: ['#6e778c', '#434b5c', '#272c38'],
  cocoa: ['#cba37c', '#9e7350', '#41291a'],
  cherry: ['#ff8a8a', '#f04848', '#750b0b'],
  seafoam: ['#a8f0dc', '#5fd6b8', '#0f6552'],
  ultraviolet: ['#b07bff', '#7a3be8', '#250459'],
  porcelain: ['#f3f1ec', '#ddd9d0', '#686256'],
  butter: ['#ffeb8f', '#ffd43b', '#8f6c00'],
  rose: ['#ffb3c6', '#f5789b', '#8c2145'],
  ember: ['#ff8b5e', '#f4522e', '#751007'],
  slate: ['#aebdd1', '#7a8ca5', '#2c3646'],
  toxic: ['#b6ff4d', '#7be800', '#2a6100'],
};
const personName = person => person.display_name || person.username || 'Slop player';
const handle = person => person.username ? `@${person.username}` : 'Slop player';
function personPalette(person) {
  const [light, mid, shade] = palettes[person.slop_look?.palette] || palettes.tangerine;
  return {'--ribbon-light': light, '--ribbon-mid': mid, '--ribbon-shade': shade};
}

export default function Social() {
  const {user, requireAuth} = useAuth();
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [following, setFollowing] = useState(new Set());
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [person, setPerson] = useState(null);
  const [transitionId, setTransitionId] = useState(null);
  const pending = useRef(false);
  const people = useAsync(() => searchPeople(query.trim().replace(/^@/, '')), [query]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(term), 250);
    return () => clearTimeout(timer);
  }, [term]);
  useEffect(() => {
    let alive = true;
    setFollowing(new Set());
    setError(null);
    if (user) result(supabase.from('follows').select('following_id').eq('follower_id', user.id).limit(2000))
      .then(rows => {if (alive) setFollowing(new Set(rows.map(row => row.following_id)));})
      .catch(e => {if (alive) setError(e);});
    return () => {alive = false;};
  }, [user?.id]);

  async function follow(id) {
    if (pending.current || !requireAuth()) return;
    pending.current = true;
    const shouldFollow = !following.has(id);
    setBusy(id);
    setError(null);
    try {
      await followPerson(id, shouldFollow);
      setFollowing(old => {
        const next = new Set(old);
        if (shouldFollow) next.add(id); else next.delete(id);
        return next;
      });
    } catch (e) {setError(e);}
    finally {pending.current = false; setBusy(null);}
  }

  function openProfile(next) {
    // The same silhouette grows into the profile. Unsupported browsers and
    // Reduced Motion use the ordinary accessible dialog without a delay.
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPerson(next);
      return;
    }
    flushSync(() => setTransitionId(next.id));
    const transition = document.startViewTransition(() => flushSync(() => setPerson(next)));
    transition.finished.catch(() => {}).finally(() => setTransitionId(null));
  }

  return <div className="circle-page">
    <section className="circle-intro">
      <img className="circle-sky" src="/assets/illustrations/desert-dusk.webp" alt=""/>
      <div className="circle-intro-copy">
        <h1>Discover people</h1>
        <p>Find a player. Follow their games.</p>
        <label className="circle-search">
          <Icon name="search" size={20}/>
          <input aria-label="Search people" placeholder="Search usernames" value={term} onChange={event => setTerm(event.target.value)} autoComplete="off" spellCheck="false"/>
          {term && <button type="button" aria-label="Clear people search" onClick={() => setTerm('')}><Icon name="close" size={18}/></button>}
        </label>
      </div>
      <div className="circle-residents" aria-hidden="true">
        <NativeEyePortrait body="heart" color="bubblegum" className="circle-resident resident-heart" alt=""/>
        <NativeEyePortrait body="ghost" color="tangerine" className="circle-resident resident-ghost" alt=""/>
        <NativeEyePortrait body="star" color="mint" className="circle-resident resident-star" alt=""/>
      </div>
    </section>

    <div className="circle-results-heading">
      <h2>{query.trim() ? 'Search results' : 'People on Slop'}</h2>
      <span role="status">{people.loading ? 'Finding people…' : query.trim() && !people.error ? `${people.data?.length || 0} found` : ''}</span>
    </div>
    <Notice error={error}/>
    <Notice error={people.error} onRetry={people.refresh}/>
    {people.loading && !people.data ? <Loading label="Finding people…"/> : !people.error && !people.data?.length ?
      <div className="circle-empty"><Icon name="search" size={30}/><h3>No matching usernames</h3><p>Try another name.</p>{term && <Button variant="secondary small" onClick={() => setTerm('')}>Clear search</Button>}</div> :
      <div className={`circle-people ${people.loading ? 'is-loading' : ''}`} aria-busy={people.loading}>
        {people.data?.map((profile, index) => <PersonRibbon key={profile.id} person={profile} index={index}
          following={following.has(profile.id)} busy={busy} own={profile.id === user?.id}
          onFollow={() => follow(profile.id)} onOpen={() => openProfile(profile)}
          transition={transitionId === profile.id && !person}/>) }
      </div>}
    {person && <PersonProfile person={person} own={person.id === user?.id} following={following.has(person.id)} busy={busy}
      onFollow={() => follow(person.id)} onClose={() => setPerson(null)} transition={transitionId === person.id}/>}
  </div>;
}

function PersonRibbon({person, index, following, busy, own, onFollow, onOpen, transition}) {
  const paintId = `ribbon-${useId().replaceAll(':', '')}`;
  return <article className="slop-person-ribbon" style={{...personPalette(person), '--ribbon-order': index % 4, viewTransitionName: transition ? 'slop-person-profile' : 'none'}}>
    <svg className="person-ribbon-surface" viewBox="0 0 260 330" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={paintId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--ribbon-light)"/><stop offset=".32" stopColor="var(--ribbon-mid)"/><stop offset="1" stopColor="var(--ribbon-shade)"/></linearGradient></defs>
      <path fill={`url(#${paintId})`} d="M28 104 C10 104 5 120 8 144 C13 178 3 240 9 286 C12 314 30 326 58 326 L202 326 C230 326 248 314 251 286 C257 240 247 178 252 144 C255 120 250 104 232 104 L181 104 C164 104 161 90 156 75 C148 51 112 51 104 75 C99 90 96 104 79 104 Z"/>
    </svg>
    <button className="person-ribbon-open" onClick={onOpen} aria-label={`Open ${personName(person)}, ${handle(person)}`}>
      <NativeEyePortrait look={person.slop_look} avatar={person.avatar_url} className="person-ribbon-slop" alt="" loading="lazy"/>
      <span className="person-ribbon-identity"><span className="person-ribbon-name">{personName(person)}</span><span className="person-ribbon-handle">{handle(person)}</span></span>
      {person.bio && <span className="person-ribbon-bio">{person.bio}</span>}
      <span className="person-ribbon-enter"><span>View profile</span><Icon name="arrow" size={18}/></span>
    </button>
    <div className="person-ribbon-actions">
      {own ? <span className="person-ribbon-self">You</span> : <button type="button" className={`person-ribbon-follow ${following ? 'is-following' : ''}`} disabled={!!busy} onClick={onFollow} aria-label={`${following ? 'Unfollow' : 'Follow'} ${handle(person)}`}>
        <Icon name={following ? 'check' : 'plus'} size={17}/>{busy === person.id ? 'Saving…' : following ? 'Following' : 'Follow'}
      </button>}
    </div>
  </article>;
}

async function profileStats(id) {
  const queries = [
    supabase.from('games').select('id', {count: 'exact', head: true}).eq('owner_id', id).eq('status', 'published').eq('media_delete_authorized', false).ilike('html', '%slop.js%'),
    supabase.from('follows').select('follower_id', {count: 'exact', head: true}).eq('following_id', id),
    supabase.from('follows').select('following_id', {count: 'exact', head: true}).eq('follower_id', id),
  ];
  const rows = await Promise.all(queries);
  return rows.map(row => row.error ? null : row.count);
}

function PersonProfile({person, following, busy, own, onFollow, onClose, transition}) {
  const details = useAsync(() => result(supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('id', person.id).single()), [person.id]);
  const games = useAsync(() => loadGames({owner: person.id}), [person.id]);
  const stats = useAsync(() => profileStats(person.id), [person.id, following]);
  const [selected, setSelected] = useState(null);
  const profile = details.data || person;
  const backdrop = profileBackdrop(profile.profile_banner_id);
  return <Modal title={handle(profile)} onClose={onClose} className="circle-profile-modal">
    <div className="circle-profile-surface" style={{...personPalette(profile), viewTransitionName: transition ? 'slop-person-profile' : 'none'}}>
      <div className="circle-profile-scene">
        <img src={backdrop} alt="" className="circle-profile-world"/>
        <Slop interactive look={profile.slop_look} paused={!!selected} controls className="circle-profile-character" alt={`${personName(profile)}'s Slop`}/>
      </div>
      <div className="circle-profile-identity">
        <div><h2>{personName(profile)}</h2><p>{handle(profile)}</p></div>
        {own ? <a className="button secondary small" href="#/you" onClick={onClose}>Your profile<Icon name="arrow" size={17}/></a> : <Button icon={following ? 'check' : 'plus'} variant={following ? 'secondary' : ''} disabled={!!busy} onClick={onFollow}>{busy === person.id ? 'Saving…' : following ? 'Following' : 'Follow'}</Button>}
      </div>
      {profile.bio && <p className="circle-profile-bio">{profile.bio}</p>}
      <dl className="circle-profile-stats">{['Games', 'Followers', 'Following'].map((label, index) => <div key={label}><dt>{label}</dt><dd>{stats.data?.[index] == null ? '—' : new Intl.NumberFormat().format(stats.data[index])}</dd></div>)}</dl>
    </div>
    <section className="circle-profile-games"><h3>Games</h3><Notice error={details.error} onRetry={details.refresh}/><Notice error={games.error} onRetry={games.refresh}/>
      {games.loading ? <Loading label="Loading games…"/> : games.data?.length ? <div className="game-grid">{games.data.map(game => <GameCard key={game.id} game={game} onOpen={setSelected}/>)}</div> : !games.error && <div className="circle-profile-no-games"><Icon name="play" size={24}/><p>No published games yet.</p></div>}
    </section>
    {selected && <GameDetail game={selected} onClose={() => setSelected(null)}/>}
  </Modal>;
}
