from contextlib import contextmanager

from neo4j import GraphDatabase, managed_transaction

from app.config import settings


class Neo4jConnection:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._driver = None
        return cls._instance

    @property
    def driver(self):
        if self._driver is None:
            self._driver = GraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
            )
        return self._driver

    def close(self):
        if self._driver is not None:
            self._driver.close()
            self._driver = None

    @contextmanager
    def session(self, database=None):
        db = database or settings.NEO4J_DATABASE
        session = self.driver.session(database=db)
        try:
            yield session
        finally:
            session.close()

    def execute_query(self, query, parameters=None, database=None):
        with self.session(database) as session:
            result = session.run(query, parameters or {})
            records = [record.data() for record in result]
            return records

    def execute_write(self, query, parameters=None, database=None):
        with self.session(database) as session:
            result = session.write_transaction(
                lambda tx: tx.run(query, parameters or {})
            )
            return [record.data() for record in result]


neo4j_conn = Neo4jConnection()
