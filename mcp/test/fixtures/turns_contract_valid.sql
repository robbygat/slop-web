create function public._mp_turn_contract_valid(p_contract jsonb)
returns boolean language plpgsql immutable security definer set search_path='' as $$
declare v_key text; v_rule jsonb; v_value jsonb; v_type text; v_count integer;
begin
  if p_contract is null or jsonb_typeof(p_contract)<>'object'
     or octet_length(p_contract::text)>4096 then return false; end if;
  if (select count(*) from jsonb_object_keys(p_contract))<>5
     or p_contract->>'protocol' is distinct from 'turns-v1'
     or p_contract->>'mode' is distinct from 'match'
     or p_contract->'seats' is distinct from '2'::jsonb
     or jsonb_typeof(p_contract->'max_turns') is distinct from 'number'
     or (p_contract->>'max_turns') !~ '^[0-9]{1,3}$'
     or (p_contract->>'max_turns')::integer not between 1 and 256
     or jsonb_typeof(p_contract->'action_schema') is distinct from 'object' then return false; end if;
  v_count:=0;
  for v_key,v_rule in select key,value from jsonb_each(p_contract->'action_schema') loop
    v_count:=v_count+1;
    if v_count>8 or v_key !~ '^[a-z][a-z0-9_]{0,31}$' or v_key in ('prototype','constructor')
       or jsonb_typeof(v_rule)<>'object' then return false; end if;
    v_type:=v_rule->>'type';
    if v_type in ('number','integer') then
      if (select count(*) from jsonb_object_keys(v_rule))<>3
         or jsonb_typeof(v_rule->'min') is distinct from 'number'
         or jsonb_typeof(v_rule->'max') is distinct from 'number'
         or (v_rule->>'min')::numeric < -1000000 or (v_rule->>'max')::numeric > 1000000
         or (v_rule->>'min')::numeric > (v_rule->>'max')::numeric
         or (v_type='integer' and ((v_rule->>'min')::numeric<>trunc((v_rule->>'min')::numeric)
           or (v_rule->>'max')::numeric<>trunc((v_rule->>'max')::numeric))) then return false; end if;
    elsif v_type='enum' then
      if (select count(*) from jsonb_object_keys(v_rule))<>2
         or jsonb_typeof(v_rule->'values') is distinct from 'array'
         or jsonb_array_length(v_rule->'values') not between 1 and 16 then return false; end if;
      if (select count(distinct value) from jsonb_array_elements(v_rule->'values'))
          <>jsonb_array_length(v_rule->'values') then return false; end if;
      for v_value in select value from jsonb_array_elements(v_rule->'values') loop
        if jsonb_typeof(v_value)<>'string' or char_length(v_value#>>'{}') not between 1 and 32 then return false; end if;
      end loop;
    else return false;
    end if;
  end loop;
  return v_count between 1 and 8;
exception when others then return false;
end;
$$;
