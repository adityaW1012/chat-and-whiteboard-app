import { getAvatarUrl } from '../utils/avatar';

function ChannelList({ server, channels, activeChannel, onSelectChannel, user, onLogout }) {
  const handleCopyInvite = () => {
    navigator.clipboard.writeText(server.invite_code);
    alert(`Invite code copied: ${server.invite_code}`);
  };

  return (
    <div style={styles.list}>
      <div style={styles.header}>
        <span>{server ? server.name : 'Select a server'}</span>
        {server && (
          <button onClick={handleCopyInvite} style={styles.inviteBtn} title="Copy invite code">
            Invite
          </button>
        )}
      </div>
      <div style={styles.channels}>
        {channels.map((channel) => (
          <div
            key={channel.id}
            onClick={() => onSelectChannel(channel)}
            style={{
              ...styles.channel,
              background: activeChannel?.id === channel.id ? '#404249' : 'transparent',
              color: activeChannel?.id === channel.id ? '#fff' : '#96989d',
            }}
          >
            <span style={{ marginRight: 6, opacity: 0.6 }}>#</span>
            {channel.name}
          </div>
        ))}
      </div>
      <div style={styles.userBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={getAvatarUrl(user.username)} alt={user.username} style={styles.avatar} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{user.username}</div>
            <div style={{ fontSize: 11, color: '#23a55a' }}>Online</div>
          </div>
        </div>
        <button onClick={onLogout} style={styles.logoutBtn}>Log out</button>
      </div>
    </div>
  );
}

const styles = {
  list: { width: 240, background: '#2b2d31', color: '#dbdee1', display: 'flex', flexDirection: 'column' },
  header: {
    padding: '12px 16px',
    fontWeight: 600,
    fontSize: 15,
    borderBottom: '1px solid #1e1f22',
    boxShadow: '0 1px 0 rgba(0,0,0,0.2)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#fff',
  },
  inviteBtn: {
    fontSize: 11,
    fontWeight: 500,
    background: '#404249',
    color: '#dbdee1',
    border: 'none',
    borderRadius: 4,
    padding: '4px 8px',
    cursor: 'pointer',
  },
  channels: { flex: 1, padding: '8px' },
  channel: {
    padding: '6px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    marginBottom: 2,
    fontSize: 15,
    fontWeight: 500,
  },
  userBar: {
    padding: '8px',
    background: '#232428',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: '#40444b' },
  logoutBtn: {
    background: '#404249',
    color: '#dbdee1',
    border: 'none',
    borderRadius: 4,
    padding: '6px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
};

export default ChannelList;