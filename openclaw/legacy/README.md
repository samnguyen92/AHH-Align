# legacy/

One-off scripts kept for reference only. They are **not** imported by the bot or by any job and are not
maintained: several of them were written for the old Supabase setup and will need changes before they run
again (use `pg_client.create_client()` instead of the `supabase` package). Delete them once you are sure
you no longer need them.
