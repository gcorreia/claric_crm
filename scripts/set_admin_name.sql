UPDATE users
SET name = 'Gustavo Correia'
WHERE email = 'admin@claric.com';

SELECT id, email, name FROM users WHERE email = 'admin@claric.com';