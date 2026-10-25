import os

# The suite runs on the JSON copy in data/ so it is deterministic and works offline.
# tests/test_supabase_sync.py checks separately that Supabase holds the same data.
os.environ["BP_DATA_SOURCE"] = "local"
