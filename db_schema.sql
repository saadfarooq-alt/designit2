
-- Create table for submissions in Supabase (PostgreSQL)

create table public.submissions (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  author text not null,
  image_data text not null, 
  status text check (status in ('pending', 'approved', 'rejected')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.submissions enable row level security;

-- Policy: Allow anyone to insert submissions
create policy "Enable insert for all users" on public.submissions for insert with check (true);

-- Policy: Allow public to read approved submissions
create policy "Enable read access for approved" on public.submissions for select using (status = 'approved');

-- Admin access is handled via Service Role Key in the backend API

