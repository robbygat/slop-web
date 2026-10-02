-- Exact account standing for the web result screen. This deliberately uses the
-- SAME uncapped ordering as competitive_top_scores, including its per-game
-- verified/community authority and earliest-best tie break. It does not grant
-- direct access to scores or to the private ranking functions.
begin;

do $standing_preflight$
begin
  if to_regprocedure('public._live_crown_rankings(text)') is null
     or to_regprocedure('public.competitive_top_scores(text,integer)') is null
     or to_regprocedure('public.top_scores(text,integer)') is null then
    raise exception 'game player standing requires the existing live leaderboard contracts';
  end if;
end;
$standing_preflight$;

create or replace function public.my_game_standing(p_game text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_game text := btrim(coalesce(p_game, ''));
  v_result jsonb;
begin
  if v_user is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if v_game = '' or char_length(v_game) > 160 or v_game ~ '[[:cntrl:]]' then
    raise exception 'invalid_score_game' using errcode = '22023';
  end if;

  with live as materialized (
    select ranking.user_id, ranking.score, ranking.crown_rank as rank,
      ranking.score_authority
    from public._live_crown_rankings(v_game) ranking
  ), legacy_bests as (
    -- The website's documented fallback is top_scores when live has no rows.
    -- That legacy endpoint orders max(score) DESC, user_id ASC. In particular,
    -- a zero-only board is not inferred from the positive-score Crown ranking.
    select score_row.user_id, max(score_row.score)::bigint as score
    from public.scores score_row
    join public.profiles profile on profile.id = score_row.user_id
    where score_row.game = v_game
      and not exists (select 1 from live)
      and exists (
        select 1 from public.games game_row
        where game_row.slug = v_game and game_row.status = 'published'
      )
    group by score_row.user_id
  ), ranked as materialized (
    select live.user_id, live.score, live.rank, live.score_authority from live
    union all
    select legacy_bests.user_id, legacy_bests.score,
      row_number() over (order by legacy_bests.score desc, legacy_bests.user_id),
      'community_unverified'::text
    from legacy_bests
  ), mine as (
    select ranked.* from ranked where ranked.user_id = v_user
  )
  select jsonb_build_object(
    'available', true,
    'user_id', v_user,
    'game_id', v_game,
    'score_authority', coalesce(
      (select ranked.score_authority from ranked order by ranked.rank limit 1),
      'community_unverified'
    ),
    'has_score', mine.user_id is not null,
    'best', mine.score,
    'rank', mine.rank,
    'next_rank', ahead.rank,
    'next_score', ahead.score,
    -- Equal scores retain their original tie order; one additional point is
    -- required to pass the row above. The score cap has no achievable target.
    'points_to_next', case
      when ahead.score < 99999999 then ahead.score - mine.score + 1
      else null
    end
  ) into v_result
  from (select 1) seed
  left join mine on true
  left join ranked ahead on ahead.rank = mine.rank - 1;

  return v_result;
end;
$$;

revoke all on function public.my_game_standing(text) from public, anon;
grant execute on function public.my_game_standing(text) to authenticated;

comment on function public.my_game_standing(text) is
  'Account-scoped complete leaderboard rank, board best and next-position target; follows the live board authority without top-N inference.';

notify pgrst, 'reload schema';
commit;
