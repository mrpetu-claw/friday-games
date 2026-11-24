-- Minimal stand-ins for what a Supabase project provides, for local testing only.
do $$ begin if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; end $$;
create schema extensions;
create schema realtime;
create table realtime.sent (id serial, topic text, event text, payload jsonb, private boolean);
create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql as $$ insert into realtime.sent(topic,event,payload,private) values (topic,event,payload,private) $$;
grant usage on schema public to anon, authenticated;
