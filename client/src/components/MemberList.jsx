import { getAvatarUrl } from '../utils/avatar';

function MemberList({ members, onlineUsers }) {
  const online = members.filter((m) => onlineUsers.includes(m.id));
  const offline = members.filter((m) => !onlineUsers.includes(m.id));

  return (
    <div style={styles.list}>
      <div style={styles.section}>ONLINE — {online.length}</div>
      {online.map((m) => (
        <div key={m.id} style={styles.member}>
          <div style={styles.avatarWrapper}>
            <img src={getAvatarUrl(m.username)} alt={m.username} style={styles.avatar} />
            <span style={styles.dot} />
          </div>
          <span style={{ color: '#dbdee1', fontSize: 14 }}>{m.username}</span>
        </div>
      ))}
      <div style={styles.section}>OFFLINE — {offline.length}</div>
      {offline.map((m) => (
        <div key={m.id} style={{ ...styles.member, opacity: 0.4 }}>
          <img src={getAvatarUrl(m.username)} alt={m.username} style={styles.avatar} />
          <span style={{ color: '#dbdee1', fontSize: 14 }}>{m.username}</span>
        </div>
      ))}
    </div>
  );
}

const styles = {
  list: { width: 240, background: '#2b2d31', padding: '16px 8px' },
  section: { fontSize: 12, fontWeight: 600, color: '#949ba4', margin: '16px 0 6px', padding: '0 8px', textTransform: 'uppercase' },
  member: { display: 'flex', alignItems: 'center', gap: 12, padding: '4px 8px', borderRadius: 4 },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: '#40444b' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#23a55a',
    display: 'inline-block',
    position: 'absolute',
    bottom: -2,
    right: -2,
    border: '2.5px solid #2b2d31',
  },
};

export default MemberList;