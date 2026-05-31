CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    id INT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

SELECT * FROM users WHERE name = 'John';

SELECT id, name, email
FROM users
WHERE created_at > '2024-01-01'
ORDER BY created_at DESC;

INSERT INTO users (name, email)
VALUES ('Alice', 'alice@example.com')
RETURNING id;

UPDATE users
SET email = 'new@example.com'
WHERE id = 1;

DELETE FROM users WHERE id = 999;
