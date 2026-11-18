-- One organization per account. Only enforced when no account already sits in more than one;
-- nothing is deleted here. The API rejects new second memberships either way.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM workspace_members GROUP BY "userId" HAVING count(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "workspace_members_userId_one_org" ON workspace_members ("userId");
  END IF;
END $$;
