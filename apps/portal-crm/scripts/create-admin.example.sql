-- Template only. Replace email/hash; do not commit real credentials.
-- Generate hash: node -e "require('bcryptjs').hash('YOUR_PASSWORD',12).then(console.log)"
BEGIN;
INSERT INTO "User" (id, name, email, "passwordHash", role, active, "createdAt")
VALUES ('user-admin', 'Admin', 'admin@example.com', '$2b$12$REPLACE_WITH_BCRYPT_HASH', 'admin', true, NOW())
ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", role = 'admin', active = true;
COMMIT;
