import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

interface SnippetConnection {
  ydoc: Y.Doc;
  provider: WebsocketProvider | null;
  persistence: IndexeddbPersistence;
  titleText: Y.Text;
  contentText: Y.Text;
}

const connections = new Map<string, SnippetConnection>();

export const getOrCreateSnippet = async (
  snippetId: string,
  token: string
): Promise<SnippetConnection> => {
  if (connections.has(snippetId)) {
    return connections.get(snippetId)!;
  }

  const ydoc = new Y.Doc();
  const persistence = new IndexeddbPersistence(snippetId, ydoc);

  await persistence.whenSynced;

  const titleText = ydoc.getText('title');
  const contentText = ydoc.getText('content');

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

  const provider = new WebsocketProvider(wsUrl, snippetId, ydoc, {
    params: { token },
    connect: true,
  });

  provider.on('status', (event: { status: string }) => {
    console.log(`Yjs connection status for ${snippetId}: ${event.status}`);
  });

  provider.on('connection-close', () => {
    console.log(`Yjs connection closed for ${snippetId} - will auto-reconnect`);
  });

  const connection: SnippetConnection = {
    ydoc,
    provider,
    persistence,
    titleText,
    contentText,
  };

  connections.set(snippetId, connection);
  return connection;
};

export const disconnectSnippet = (snippetId: string) => {
  const connection = connections.get(snippetId);
  if (connection) {
    if (connection.provider) {
      connection.provider.disconnect();
      connection.provider.destroy();
    }
    connection.persistence.destroy();
    connection.ydoc.destroy();
    connections.delete(snippetId);
  }
};

export const destroyAllConnections = () => {
  connections.forEach((_, snippetId) => disconnectSnippet(snippetId));
};
