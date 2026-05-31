CREATE EXTERNAL TABLE users (
    id INT,
    name STRING,
    email STRING,
    created_at STRING
)
ROW FORMAT DELIMITED
FIELDS TERMINATED BY '\t'
STORED AS TEXTFILE
LOCATION '/user/hive/warehouse/users';

CREATE TABLE orders (
    id INT,
    user_id INT,
    amount DECIMAL(10, 2)
)
PARTITIONED BY (dt STRING)
STORED AS ORC;

SELECT * FROM users WHERE name = 'John';

SELECT id, name, email
FROM users
WHERE created_at > '2024-01-01'
ORDER BY created_at DESC;

INSERT OVERWRITE TABLE orders PARTITION(dt='2024-01-01')
SELECT id, user_id, amount FROM orders_staging;

WITH user_orders AS (
    SELECT u.id, u.name, COUNT(o.id) as order_count
    FROM users u
    LEFT JOIN orders o ON u.id = o.user_id
    GROUP BY u.id, u.name
)
SELECT * FROM user_orders WHERE order_count > 0;

SELECT name, order_count
FROM user_orders
LATERAL VIEW EXPLODE(split(name, ' ')) t AS part;
