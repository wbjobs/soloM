SELECT * FROM `users` WHERE `id` = 1;

SELECT `name`, `email`
FROM `orders`
WHERE `status` = 'pending'
  AND `created_at` > '2024-01-01';

INSERT INTO users VALUES (1, 'test@example.com', 'password123');

UPDATE users SET name = 'New Name' WHERE `id` = 1;

DELETE FROM `users`;

SELECT u.`id`, u.`name`, o.`order_no`
FROM `users` AS u
JOIN `orders` AS o ON u.id = o.`user_id`
WHERE u.`status` = 'active';
