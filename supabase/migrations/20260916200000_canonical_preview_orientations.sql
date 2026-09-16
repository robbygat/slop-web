-- Canonical media retains an exact, bounded frame/byte receipt for each game
-- orientation. Existing portrait receipts stay valid; arbitrary device sizes do
-- not. Preserve every owner, immutable source, storage and publication guard.
set local lock_timeout = '5s';
lock table public.games in share row exclusive mode;

do $canonical_preview_orientations$
declare
  item record;
  definition text;
  previous text;
  updated text;
  target regprocedure;
begin
  for item in select * from (values
    ('games_preview_dimensions_check'),
    ('games_preview_ready_metadata_check')
  ) names(name) loop
    select pg_get_constraintdef(oid) into definition from pg_constraint
      where conrelid='public.games'::regclass and conname=item.name;
    if definition is null then raise exception 'missing preview constraint: %',item.name;end if;
    previous:='(preview_width = 360) AND (preview_height = 640)';
    updated:='(((preview_width = 360) AND (preview_height = 640)) OR ((preview_width = 640) AND (preview_height = 360)) OR ((preview_width = 640) AND (preview_height = 640)))';
    if position('((preview_width = 640) AND (preview_height = 360))' in definition)>0
       and position('((preview_width = 640) AND (preview_height = 640))' in definition)>0 then
      continue;
    elsif (length(definition)-length(replace(definition,previous,'')))/length(previous)=1 then
      execute format('alter table public.games drop constraint %I',item.name);
      execute format('alter table public.games add constraint %I %s',item.name,replace(definition,previous,updated));
    else
      raise exception 'unrecognized preview dimensions constraint: %',item.name;
    end if;
  end loop;

  -- Exact source substitution fails closed on an unfamiliar deployed guard.
  -- CREATE OR REPLACE retains the owner, ACL, SECURITY DEFINER and search_path.
  for item in select * from (values
    ('public.record_game_preview(text,text,text,text,integer,integer,integer,bigint)',
      E'p_width <> 360\n     or p_height <> 640',
      'not coalesce((p_width = 360 and p_height = 640) or (p_width = 640 and p_height = 360) or (p_width = 640 and p_height = 640), false)'),
    ('public.check_creator_game_publication(text,jsonb,uuid)',
      'c.preview_width is distinct from 360 or c.preview_height is distinct from 640',
      'not coalesce((c.preview_width = 360 and c.preview_height = 640) or (c.preview_width = 640 and c.preview_height = 360) or (c.preview_width = 640 and c.preview_height = 640), false)')
  ) functions(signature,old_bound,new_bound) loop
    target:=to_regprocedure(item.signature);
    if target is null then raise exception 'missing preview authority: %',item.signature;end if;
    definition:=pg_get_functiondef(target);
    if position(item.new_bound in definition)>0 then continue;
    elsif (length(definition)-length(replace(definition,item.old_bound,'')))/length(item.old_bound)=1 then
      execute replace(definition,item.old_bound,item.new_bound);
    else
      raise exception 'unrecognized preview dimensions authority: %',item.signature;
    end if;
  end loop;
end;
$canonical_preview_orientations$;
