// Approval feedback describes a specific live grant, not a permanent UI state.
export function mcpConnectionNotice(notice, connections, ownerId, now = Date.now()) {
  if (!notice || !ownerId || notice.owner_id !== ownerId) return '';
  const connection = connections?.find(item => item.connection_id === notice.connection_id);
  if (connection?.status !== 'active' || Date.parse(connection.expires_at) <= now ||
      !Number.isFinite(Date.parse(connection.expires_at))) return '';
  return `${connection.client_name} is connected. Ask it to send your first game.`;
}
