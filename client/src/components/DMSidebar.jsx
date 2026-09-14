import { useState } from 'react';
import { getAvatarUrl } from '../utils/avatar';

function DMSidebar({ conversations, activeConversation, onSelectConversation, onStartDM }) {
  const handleStart = () => {
    const username = prompt('Enter a username to message:');
    if (username) onStartDM(username);
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <span style={styles.header}>Direct Messages</span>
        <span style={styles.addBtn} onClick={handleStart} title="New DM">+</span>
      </div>
      {conversations.map((c) => (
        <div
          key={c.id}
          onClick={() => onSelectConversation(c)}
          style={{
            ...styles.item,
            background: activeConversation?.id === c.id ? '#404249' : 'transparent',
          }}
        >
          <img src={getAvatarUrl(c.other_username)} alt={c.other_username} style={styles.avatar} />
          <span style={{ color: '#dbdee1', fontSize: 14 }}>{c.other_username}</span>
        </div>
      ))}
    </div>
  );
}

const styles = {
  container: { padding: '16px 8px', borderBottom: '1px solid #1e1f22' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 8px' },
  header: { fontSize: 12, fontWeight: 600, color: '#949ba4', textTransform: 'uppercase' },
  addBtn: { color: '#949ba4', cursor: 'pointer', fontSize: 16, fontWeight: 700 },
  item: { display: 'flex', alignItems: 'center', gap: 12, padding: '6px 8px', borderRadius: 4, cursor: 'pointer' },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: '#40444b' },
};

export default DMSidebar;