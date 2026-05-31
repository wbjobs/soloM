CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
VALUES ('Alice', 'alice@example.com');

UPDATE users
SET email = 'new@example.com'
WHERE id = 1;

DELETE FROM users WHERE id = 999;
