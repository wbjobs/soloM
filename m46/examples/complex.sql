WITH cte_sales AS (
    SELECT user_id, SUM(amount) AS total_sales
    FROM orders
    WHERE status = 'completed'
    GROUP BY user_id
),
cte_users AS (
    SELECT u.id, u.name, c.total_sales
    FROM users u
    INNER JOIN cte_sales c ON u.id = c.user_id
    WHERE c.total_sales > 1000
)
SELECT *
FROM cte_users
WHERE id IN (
    SELECT user_id
    FROM orders
    WHERE created_at >= '2024-01-01'
      AND amount > (
          SELECT AVG(amount)
          FROM orders
          WHERE status = 'completed'
      )
)
ORDER BY total_sales DESC;

SELECT o.id, o.user_id, o.amount
FROM orders o
WHERE o.amount > (
    SELECT AVG(amount)
    FROM orders
    WHERE user_id = o.user_id
)
AND EXISTS (
    SELECT 1
    FROM order_items oi
    WHERE oi.order_id = o.id
      AND oi.quantity > 5
);
