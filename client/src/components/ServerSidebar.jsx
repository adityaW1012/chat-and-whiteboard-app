import { useState } from 'react';

function ServerSidebar({ servers, activeServer, showingDM, onSelectServer, onCreateServer, onJoinServer, onShowDMs }) {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <div style={styles.sidebar}>
      {/* Home / DM icon */}
      <div style={styles.iconWrapper}>
        <div style={{ ...styles.pill, height: showingDM ? 40 : 8 }} />
        <div
          onClick={onShowDMs}
          style={{
            ...styles.icon,
            background: showingDM ? '#5865F2' : '#313338',
            borderRadius: showingDM ? '30%' : '50%',
          }}
          title="Direct Messages"
        >
          💬
        </div>
      </div>

      <div style={styles.divider} />

      {servers.map((server) => {
        const isActive = !showingDM && activeServer?.id === server.id;
        const isHovered = hoveredId === server.id;
        return (
          <div key={server.id} style={styles.iconWrapper}>
            <div style={{ ...styles.pill, height: isActive ? 40 : isHovered ? 20 : 8 }} />
            <div
              onClick={() => onSelectServer(server)}
              onMouseEnter={() => setHoveredId(server.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                ...styles.icon,
                background: isActive ? '#5865F2' : '#313338',
                borderRadius: isActive || isHovered ? '30%' : '50%',
              }}
              title={server.name}
            >
              {server.name.charAt(0).toUpperCase()}
            </div>
          </div>
        );
      })}

      <div
        style={{ ...styles.icon, background: '#313338', color: '#23a55a', borderRadius: '50%' }}
        onClick={onCreateServer}
        title="Create Server"
        onMouseEnter={(e) => (e.currentTarget.style.borderRadius = '30%')}
        onMouseLeave={(e) => (e.currentTarget.style.borderRadius = '50%')}
      >
        +
      </div>
      <div
        style={{ ...styles.icon, background: '#313338', color: '#23a55a', fontSize: 11, borderRadius: '50%' }}
        onClick={onJoinServer}
        title="Join Server"
        onMouseEnter={(e) => (e.currentTarget.style.borderRadius = '30%')}
        onMouseLeave={(e) => (e.currentTarget.style.borderRadius = '50%')}
      >
        Join
      </div>
    </div>
  );
}

const styles = {
  sidebar: {
    width: 72,
    background: '#1e1f22',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 0',
    gap: 8,
  },
  iconWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  pill: {
    position: 'absolute',
    left: 0,
    width: 4,
    borderRadius: '0 4px 4px 0',
    background: '#ffffff',
    transition: 'height 0.15s ease',
  },
  icon: {
    width: 48,
    height: 48,
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 18,
    transition: 'border-radius 0.15s ease, background 0.15s ease',
  },
  divider: {
    width: 32,
    height: 2,
    background: '#35363c',
    borderRadius: 1,
    margin: '4px 0',
  },
};

export default ServerSidebar;