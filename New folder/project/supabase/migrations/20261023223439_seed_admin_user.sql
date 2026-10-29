/*
# Seed default admin user

Creates a default admin account so the system is immediately usable.
Username: admin
Password: admin123
Role: admin

The password is hashed with pgcrypto's crypt() + gen_salt('bf').
*/

INSERT INTO app_users (username, password_hash, full_name, role)
VALUES ('admin', crypt('admin123', gen_salt('bf')), 'مدير النظام', 'admin')
ON CONFLICT (username) DO NOTHING;
