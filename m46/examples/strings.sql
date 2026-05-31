-- This comment contains select and from keywords that should NOT be modified
select id, name
from users
where status = 'active'
  and description = 'Please select from the list of options';

/*
  Multi-line comment with SQL keywords:
  insert into table values ('test');
  update table set column = 1;
  delete from table where id = 1;
*/
select id, title, content
from posts
where title like '%select%'
   or content like '%insert into%'
order by created_at desc;

select id, note
from logs
where note = 'Used select * from users which is bad practice'
   or note = 'Remember to use where clause on update and delete';
