-- Exact, reviewed patch to the deployed allowance routine. Keep all existing
-- request-grouping, AI refund and daily expiry behavior. No balance changes.
do $stripe_refund_allowance$
declare
  definition text;
  old_predicate constant text := 'ledger.reason <> ''daily_expire''';
  new_predicate constant text := 'ledger.reason not in (''daily_expire'', ''stripe_topup_reversal'')';
begin
  select pg_get_functiondef(to_regprocedure(
    'public._net_coin_spend_since(uuid,timestamp with time zone)'
  )) into definition;
  if definition is null then raise exception 'coin allowance authority missing'; end if;
  if strpos(definition, old_predicate) = 0 and
     (length(definition) - length(replace(definition, new_predicate, ''))) / length(new_predicate) = 3 then return; end if;
  if (length(definition) - length(replace(definition, old_predicate, ''))) / length(old_predicate) <> 3
     or strpos(definition, 'stripe_topup_reversal') <> 0 then
    raise exception 'unexpected coin allowance definition; review before patch';
  end if;
  execute replace(definition, old_predicate, new_predicate);
end;
$stripe_refund_allowance$;
