-- Heroes and a leaderboard for each story, as applied to the Supabase project (migration "heroes").
-- Story 1 (Cemetery Keeper) keeps public.scores, now with the hero used. Story 2 (Last Survivor)
-- gets its own board, ranked by the fastest escape. Both keep one row per device.

-- ---------------- Story 1: the hero on each score ----------------
alter table public.scores add column hero text not null default 'pip'
  check (hero in ('pip', 'pip-white', 'monk', 'bone-king'));

create or replace function public.get_leaderboard(p_player text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('rank', rn, 'name', name, 'hero', hero, 'score', score, 'time', time_s) order by rn)
      from (
        select name, hero, score, time_s,
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
        'hero', m.hero,
        'score', m.score,
        'time', m.time_s)
      from public.scores m
      where m.player_id = p_player
    )
  );
$$;

-- Shared name rules: returns the problem, or null when the name is fine.
create or replace function public.leaderboard_name_error(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_words text[];
  v_plain text;
begin
  if p_name = '' then return 'Enter a name.'; end if;
  if char_length(p_name) > 12 then return 'Use 12 characters or fewer.'; end if;
  if p_name !~ '^[A-Za-z0-9 _-]+$' then return 'Use letters, numbers, spaces, - or _ only.'; end if;
  v_words := regexp_split_to_array(translate(lower(p_name), '013457', 'oieast'), '[^a-z]+');
  v_plain := array_to_string(v_words, '');
  if v_plain ~ '(fuck|shit|cunt|nigg|bitch|hitler|whore|slut|pussy|asshole|retard|kike|chink)'
     or v_words && array['fag', 'rape', 'nazi', 'dick', 'cock', 'spic'] then
    return 'Please choose a different name.';
  end if;
  return null;
end;
$$;

-- Same checks as before, plus the hero: Pip the White carries a fourth heart, so only he may
-- finish with four. Older clients send no hero and post as Pip.
create or replace function public.submit_score(p_player text, p_name text, p_run jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_error text;
  v_key text;
  v_hero text;
  v_max_health numeric;
  v_score numeric; v_time numeric; v_defeated numeric; v_souls numeric;
  v_seals numeric; v_health numeric; v_breaches numeric; v_expected numeric;
  v_result text;
begin
  if p_player is null or p_player !~ '^[A-Za-z0-9-]{16,64}$' then
    return jsonb_build_object('error', 'Bad player.');
  end if;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_error := public.leaderboard_name_error(v_name);
  if v_error is not null then return jsonb_build_object('error', v_error); end if;

  if p_run is null or jsonb_typeof(p_run) <> 'object' then return jsonb_build_object('error', 'Bad run.'); end if;
  v_hero := coalesce(p_run ->> 'hero', 'pip');
  if v_hero not in ('pip', 'pip-white', 'monk', 'bone-king') then return jsonb_build_object('error', 'Bad hero.'); end if;
  v_max_health := case when v_hero = 'pip-white' then 4 else 3 end;
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
     or v_health not between 0 and v_max_health or v_breaches not between 0 and 3 then
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
  if v_time < (v_defeated - 1) * 1.5 then return jsonb_build_object('error', 'Too fast.'); end if;

  insert into public.scores as s (player_id, name, hero, score, time_s)
  values (p_player, v_name, v_hero, v_score::integer, round(v_time, 2))
  on conflict (player_id) do update
    set name = excluded.name, hero = excluded.hero, score = excluded.score, time_s = excluded.time_s, created_at = now()
    where excluded.score > s.score or (excluded.score = s.score and excluded.time_s < s.time_s);

  return public.get_leaderboard(p_player);
end;
$$;

-- ---------------- Story 2: fastest escapes ----------------
create table public.survivor_scores (
  player_id text primary key,
  name text not null check (char_length(name) between 1 and 12),
  hero text not null default 'mara' check (hero in ('mara', 'theo', 'kate', 'reyes')),
  time_s numeric(10, 2) not null check (time_s > 0),
  created_at timestamptz not null default now()
);
create index survivor_scores_rank on public.survivor_scores (time_s asc, created_at asc);
alter table public.survivor_scores enable row level security;

create function public.get_survivor_leaderboard(p_player text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('rank', rn, 'name', name, 'hero', hero, 'time', time_s) order by rn)
      from (
        select name, hero, time_s, row_number() over (order by time_s asc, created_at asc) as rn
        from public.survivor_scores
        order by time_s asc, created_at asc
        limit 10
      ) t
    ), '[]'::jsonb),
    'you', (
      select jsonb_build_object(
        'rank', (select count(*) + 1 from public.survivor_scores o
                 where o.time_s < m.time_s or (o.time_s = m.time_s and o.created_at < m.created_at)),
        'hero', m.hero,
        'time', m.time_s)
      from public.survivor_scores m
      where m.player_id = p_player
    )
  );
$$;

-- Only escapes count: all three tasks done and the refuge reached. The fastest route through the
-- city takes well over 18 seconds even for the quickest hero, so anything faster is refused.
create function public.submit_survivor_score(p_player text, p_name text, p_run jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_error text;
  v_hero text;
  v_time numeric;
begin
  if p_player is null or p_player !~ '^[A-Za-z0-9-]{16,64}$' then
    return jsonb_build_object('error', 'Bad player.');
  end if;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_error := public.leaderboard_name_error(v_name);
  if v_error is not null then return jsonb_build_object('error', v_error); end if;

  if p_run is null or jsonb_typeof(p_run) <> 'object' then return jsonb_build_object('error', 'Bad run.'); end if;
  v_hero := coalesce(p_run ->> 'hero', 'mara');
  if v_hero not in ('mara', 'theo', 'kate', 'reyes') then return jsonb_build_object('error', 'Bad hero.'); end if;
  if p_run ->> 'result' is distinct from 'victory' then return jsonb_build_object('error', 'Only escapes count.'); end if;
  if jsonb_typeof(p_run -> 'tasks') is distinct from 'number' or (p_run ->> 'tasks')::numeric <> 3 then
    return jsonb_build_object('error', 'Impossible run.');
  end if;
  if jsonb_typeof(p_run -> 'time') is distinct from 'number' then return jsonb_build_object('error', 'Bad run.'); end if;
  v_time := (p_run ->> 'time')::numeric;
  if v_time < 18 or v_time > 86400 then return jsonb_build_object('error', 'Bad time.'); end if;

  insert into public.survivor_scores as s (player_id, name, hero, time_s)
  values (p_player, v_name, v_hero, round(v_time, 2))
  on conflict (player_id) do update
    set name = excluded.name, hero = excluded.hero, time_s = excluded.time_s, created_at = now()
    where excluded.time_s < s.time_s;

  return public.get_survivor_leaderboard(p_player);
end;
$$;

revoke all on function public.leaderboard_name_error(text) from public, anon, authenticated;
revoke all on function public.get_survivor_leaderboard(text) from public;
revoke all on function public.submit_survivor_score(text, text, jsonb) from public;
grant execute on function public.get_survivor_leaderboard(text) to anon, authenticated;
grant execute on function public.submit_survivor_score(text, text, jsonb) to anon, authenticated;
revoke all on table public.survivor_scores from anon, authenticated;
