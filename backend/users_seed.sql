INSERT INTO users (name, username, role)
VALUES
    ('Kether Eaglestone', 'keaglestone', 'admin'),
    ('Edward Wilcox', 'ewilcox', 'broker'),
    ('Maisie Moss', 'mmoss', 'broker')
ON CONFLICT (username) DO UPDATE
SET name = EXCLUDED.name,
    role = EXCLUDED.role,
    is_active = TRUE;
