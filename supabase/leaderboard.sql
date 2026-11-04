-- The shared leaderboard, as applied to the Supabase project (migration "leaderboard").
-- If the scoring in src/score-values.mjs changes, update submit_score to match.

-- One row per device: a random id, a public name, and that player's best Keeper run.
create table public.scores (
  player_id text primary key,
  name text not null check (char_length(name) between 1 and 12),
  score integer not null check (score > 0),
  time_s numeric(10, 2) not null check (time_s > 0),
  created_at timestamptz not null default now()
);
create index scores_rank on public.scores (score desc, time_s asc, created_at asc);

-- No policies: nobody reads or writes the table directly, and device ids stay private.
alter table public.scores enable row level security;

create function public.get_leaderboard(p_player text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('rank', rn, 'name', name, 'score', score, 'time', time_s) order by rn)
      from (
        select name, score, time_s,
               row_number() over (order by score desc, time_s asc, created_at asc) as rn
        from public.scores
        order by score desc, time_s asc, created_at asc
        limit 10
      ) t
    ), '[]'::jsonb),
    'you', (
      select jsonb_build_object(
        'rank', (select count(*) + 1 from public.scores o
                 where o.score > m.score
                    or (o.score = m.score and o.time_s < m.time_s)
                    or (o.score = m.score and o.time_s = m.time_s and o.created_at < m.created_at)),
        'score', m.score,
        'time', m.time_s)
      from public.scores m
      where m.player_id = p_player
    )
  );
$$;

-- Recomputes the score from the run's totals and refuses anything the game can't produce.
-- A browser game can't prove a run really happened; this only stops impossible results.
create function public.submit_score(p_player text, p_name text, p_run jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_words text[];
  v_plain text;
  v_key text;
  v_score numeric; v_time numeric; v_defeated numeric; v_souls numeric;
  v_seals numeric; v_health numeric; v_breaches numeric; v_expected numeric;
  v_result text;
begin
  if p_player is null or p_player !~ '^[A-Za-z0-9-]{16,64}$' then
    return jsonb_build_object('error', 'Bad player.');
  end if;

  -- Name.
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if v_name = '' then return jsonb_build_object('error', 'Enter a name.'); end if;
  if char_length(v_name) > 12 then return jsonb_build_object('error', 'Use 12 characters or fewer.'); end if;
  if v_name !~ '^[A-Za-z0-9 _-]+$' then return jsonb_build_object('error', 'Use letters, numbers, spaces, - or _ only.'); end if;
  v_words := regexp_split_to_array(translate(lower(v_name), '013457', 'oieast'), '[^a-z]+');
  v_plain := array_to_string(v_words, '');
  if v_plain ~ '(fuck|shit|cunt|nigg|bitch|hitler|whore|slut|pussy|asshole|retard|kike|chink)'
     or v_words && array['fag', 'rape', 'nazi', 'dick', 'cock', 'spic'] then
    return jsonb_build_object('error', 'Please choose a different name.');
  end if;

  -- Run totals: all numbers, all whole except time.
  if p_run is null or jsonb_typeof(p_run) <> 'object' then return jsonb_build_object('error', 'Bad run.'); end if;
  foreach v_key in array array['score', 'time', 'defeated', 'souls', 'seals', 'health', 'breaches'] loop
    if jsonb_typeof(p_run -> v_key) is distinct from 'number' then return jsonb_build_object('error', 'Bad run.'); end if;
  end loop;
  v_score := (p_run ->> 'score')::numeric;
  v_time := (p_run ->> 'time')::numeric;
  v_defeated := (p_run ->> 'defeated')::numeric;
  v_souls := (p_run ->> 'souls')::numeric;
  v_seals := (p_run ->> 'seals')::numeric;
  v_health := (p_run ->> 'health')::numeric;
  v_breaches := (p_run ->> 'breaches')::numeric;
  v_result := p_run ->> 'result';
  if v_result is null or v_result not in ('victory', 'defeat') then return jsonb_build_object('error', 'Bad result.'); end if;
  if v_score <> trunc(v_score) or v_defeated <> trunc(v_defeated) or v_souls <> trunc(v_souls)
     or v_seals <> trunc(v_seals) or v_health <> trunc(v_health) or v_breaches <> trunc(v_breaches) then
    return jsonb_build_object('error', 'Impossible totals.');
  end if;
  if v_defeated not between 0 and 18 or v_souls not between 0 and v_defeated or v_seals not between 0 and 3
     or v_health not between 0 and 3 or v_breaches not between 0 and 3 then
    return jsonb_build_object('error', 'Impossible totals.');
  end if;
  if v_time <= 0 or v_time > 86400 then return jsonb_build_object('error', 'Bad time.'); end if;

  v_expected := v_defeated * 10 + v_souls * 25 + v_seals * 100;
  if v_result = 'victory' then
    if v_seals <> 3 or v_health < 1 or v_breaches >= 3 then return jsonb_build_object('error', 'Impossible win.'); end if;
    v_expected := v_expected + v_health * 100 + (3 - v_breaches) * 50;
  end if;
  if v_score <> v_expected then return jsonb_build_object('error', 'Score does not add up.'); end if;
  if v_score <= 0 then return jsonb_build_object('error', 'Nothing to post.'); end if;
  -- Undead rise at most about one every 1.7 seconds.
  if v_time < (v_defeated - 1) * 1.5 then return jsonb_build_object('error', 'Too fast.'); end if;

  -- Only a better result replaces a player's old one.
  insert into public.scores as s (player_id, name, score, time_s)
  values (p_player, v_name, v_score::integer, round(v_time, 2))
  on conflict (player_id) do update
    set name = excluded.name, score = excluded.score, time_s = excluded.time_s, created_at = now()
    where excluded.score > s.score or (excluded.score = s.score and excluded.time_s < s.time_s);

  return public.get_leaderboard(p_player);
end;
$$;

revoke all on function public.get_leaderboard(text) from public;
revoke all on function public.submit_score(text, text, jsonb) from public;
grant execute on function public.get_leaderboard(text) to anon, authenticated;
grant execute on function public.submit_score(text, text, jsonb) to anon, authenticated;
revoke all on table public.scores from anon, authenticated;
