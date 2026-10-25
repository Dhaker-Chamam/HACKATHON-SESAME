import os

# The suite runs on the JSON copy in data/ so it is deterministic and works offline.
# tests/test_supabase_sync.py checks separately that Supabase holds the same data.
os.environ["BP_DATA_SOURCE"] = "local"

from app.auth import current_user
from app.main import app

app.dependency_overrides[current_user] = lambda: {
    "id": "test-user",
    "email": "test@example.com",
    "user_metadata": {"full_name": "Test User"},
}
