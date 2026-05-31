SELECT `id`, `name`, `email`
FROM `users`
WHERE `status` = 'active'
  AND `created_at` > '2024-01-01'
ORDER BY `created_at` DESC
LIMIT 10;

SELECT u.`id`, u.`name`, COUNT(o.`id`) AS `order_count`
FROM `users` AS u
LEFT JOIN `orders` AS o ON u.`id` = o.`user_id`
WHERE u.`status` = 'active'
GROUP BY u.`id`, u.`name`
HAVING `order_count` > 5;

INSERT INTO `users` (`name`, `email`, `password`)
VALUES ('John Doe', 'john@example.com', 'hashed_password');

UPDATE `users`
SET `name` = 'Jane Doe',
    `updated_at` = NOW()
WHERE `id` = 1;
