/*
  # Create Saved Keyboxes Table
  Creates a table to store user-generated keybox configurations.

  ## Query Description:
  This operation creates a new table 'saved_keyboxes' linked to the auth.users table.
  It enables RLS to ensure users can only access their own data.

  ## Metadata:
  - Schema-Category: "Safe"
  - Impact-Level: "Low"
  - Requires-Backup: false
  - Reversible: true

  ## Structure Details:
  - Table: public.saved_keyboxes
  - Columns: id, user_id, title, content, created_at
  - RLS: Enabled

  ## Security Implications:
  - RLS Status: Enabled
  - Policy Changes: Yes (CRUD policy for owners)
*/

create table if not exists public.saved_keyboxes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  title text not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.saved_keyboxes enable row level security;

create policy "Users can crud their own keyboxes"
  on public.saved_keyboxes for all
  using (auth.uid() = user_id);
