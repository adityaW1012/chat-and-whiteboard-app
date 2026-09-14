import { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { AuthProvider, useAuth } from './AuthContext';
import AuthPage from './pages/AuthPage';
import ServerSidebar from './components/ServerSidebar';
import ChannelList from './components/ChannelList';
import ChatWindow from './components/ChatWindow';
import MemberList from './components/MemberList';
import DMSidebar from './components/DMSidebar';
import Whiteboard from './components/Whiteboard';
import api from './api';

function MainApp() {
  const { user, logout } = useAuth();

  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);

  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);

  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);
  const [dmView, setDmView] = useState('chat');

  const [showingDM, setShowingDM] = useState(true);

  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io(); // no URL = connects to whatever host served the page

    socketRef.current.on('connect', () => {
      socketRef.current.emit('identify', user.id);
    });

    socketRef.current.on('receive_message', (message) => {
      setMessages((prev) => [...prev, message]);
    });

    socketRef.current.on('receive_dm', (message) => {
      setDmMessages((prev) => [...prev, message]);
    });

    socketRef.current.on('online_users', (userIds) => {
      setOnlineUsers(userIds);
    });

    socketRef.current.on('new_conversation', (conversation) => {
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conversation.id);
        return exists ? prev : [...prev, conversation];
      });
    });

    socketRef.current.on('message_edited', (updated) => {
      console.log('message_edited received:', updated); // TEMP DEBUG
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
    });

    socketRef.current.on('message_deleted', ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });

    socketRef.current.on('dm_edited', (updated) => {
      console.log('dm_edited received:', updated); // TEMP DEBUG
      setDmMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
    });

    socketRef.current.on('dm_deleted', ({ messageId }) => {
      setDmMessages((prev) => prev.filter((m) => m.id !== messageId));
    });

    return () => socketRef.current.disconnect();
  }, []);

  useEffect(() => {
    api.get('/servers').then((res) => setServers(res.data));
    api.get('/dms').then((res) => setConversations(res.data));
  }, []);

  useEffect(() => {
    if (!activeServer) return;
    api.get(`/servers/${activeServer.id}/channels`).then((res) => {
      setChannels(res.data);
      setActiveChannel(null);
      setMessages([]);
    });
    api.get(`/servers/${activeServer.id}/members`).then((res) => {
      setMembers(res.data);
    });
  }, [activeServer]);

  useEffect(() => {
    if (!activeChannel) return;
    api.get(`/messages/${activeChannel.id}`).then((res) => setMessages(res.data));
    socketRef.current.emit('join_channel', activeChannel.id);
    return () => socketRef.current.emit('leave_channel', activeChannel.id);
  }, [activeChannel]);

  useEffect(() => {
    if (!activeConversation) return;
    api.get(`/dms/${activeConversation.id}/messages`).then((res) => setDmMessages(res.data));
    socketRef.current.emit('join_dm', activeConversation.id);
    return () => socketRef.current.emit('leave_dm', activeConversation.id);
  }, [activeConversation]);

  useEffect(() => {
    setDmView('chat');
  }, [activeConversation]);

  const handleCreateServer = async () => {
    const name = prompt('Server name:');
    if (!name) return;
    const res = await api.post('/servers', { name });
    setServers((prev) => [...prev, res.data]);
  };

  const handleJoinServer = async () => {
    const code = prompt('Enter invite code:');
    if (!code) return;
    try {
      const res = await api.post('/servers/join', { inviteCode: code });
      setServers((prev) => [...prev, res.data]);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to join server');
    }
  };

  const handleSendMessage = (content) => {
    socketRef.current.emit('send_message', {
      channelId: activeChannel.id,
      userId: user.id,
      content,
      username: user.username,
    });
  };

  const handleEditMessage = (messageId, content) => {
    socketRef.current.emit('edit_message', {
      messageId,
      channelId: activeChannel.id,
      userId: user.id,
      content,
    });
  };

  const handleDeleteMessage = (messageId) => {
    socketRef.current.emit('delete_message', {
      messageId,
      channelId: activeChannel.id,
      userId: user.id,
    });
  };

  const handleStartDM = async (username) => {
    try {
      const res = await api.post('/dms/start', { username });
      const newConversation = {
        id: res.data.id,
        other_user_id: res.data.otherUser.id,
        other_username: res.data.otherUser.username,
      };

      setConversations((prev) => {
        const exists = prev.some((c) => c.id === newConversation.id);
        return exists ? prev : [...prev, newConversation];
      });

      socketRef.current.emit('notify_dm_start', {
        targetUserId: res.data.otherUser.id,
        conversation: { id: res.data.id, other_user_id: user.id, other_username: user.username },
      });

      setShowingDM(true);
      setActiveConversation(newConversation);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start DM');
    }
  };

  const handleSendDM = (content) => {
    socketRef.current.emit('send_dm', {
      conversationId: activeConversation.id,
      senderId: user.id,
      content,
      username: user.username,
    });
  };

  const handleEditDM = (messageId, content) => {
    socketRef.current.emit('edit_dm', {
      messageId,
      conversationId: activeConversation.id,
      userId: user.id,
      content,
    });
  };

  const handleDeleteDM = (messageId) => {
    socketRef.current.emit('delete_dm', {
      messageId,
      conversationId: activeConversation.id,
      userId: user.id,
    });
  };

  const handleShowDMs = () => {
    setShowingDM(true);
    setActiveServer(null);
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <ServerSidebar
        servers={servers}
        activeServer={activeServer}
        showingDM={showingDM}
        onSelectServer={(s) => { setShowingDM(false); setActiveConversation(null); setActiveServer(s); }}
        onCreateServer={handleCreateServer}
        onJoinServer={handleJoinServer}
        onShowDMs={handleShowDMs}
      />

      {showingDM ? (
        <div style={{ width: 240, background: '#2b2d31', display: 'flex', flexDirection: 'column' }}>
          <DMSidebar
            conversations={conversations}
            activeConversation={activeConversation}
            onSelectConversation={setActiveConversation}
            onStartDM={handleStartDM}
          />
        </div>
      ) : (
        <ChannelList
          server={activeServer}
          channels={channels}
          activeChannel={activeChannel}
          onSelectChannel={setActiveChannel}
          user={user}
          onLogout={logout}
        />
      )}

      {showingDM ? (
        activeConversation ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={styles.tabBar}>
              <div
                onClick={() => setDmView('chat')}
                style={{ ...styles.tab, ...(dmView === 'chat' ? styles.tabActive : {}) }}
              >
                Chat
              </div>
              <div
                onClick={() => setDmView('whiteboard')}
                style={{ ...styles.tab, ...(dmView === 'whiteboard' ? styles.tabActive : {}) }}
              >
                Whiteboard
              </div>
            </div>
            {dmView === 'chat' ? (
              <ChatWindow
                channel={{ id: activeConversation.id, name: activeConversation.other_username }}
                messages={dmMessages}
                onSendMessage={handleSendDM}
                onEditMessage={handleEditDM}
                onDeleteMessage={handleDeleteDM}
                socket={socketRef.current}
                username={user.username}
                currentUserId={user.id}
              />
            ) : (
              <Whiteboard conversationId={activeConversation.id} socket={socketRef.current} username={user.username} />
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#72767d', background: '#313338' }}>
            Select a conversation or start a new one
          </div>
        )
      ) : (
        <ChatWindow
          channel={activeChannel}
          messages={messages}
          onSendMessage={handleSendMessage}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          socket={socketRef.current}
          username={user.username}
          currentUserId={user.id}
        />
      )}

      {!showingDM && <MemberList members={members} onlineUsers={onlineUsers} />}
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <AuthPage />} />
      <Route path="/" element={user ? <MainApp /> : <Navigate to="/login" />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

const styles = {
  tabBar: { display: 'flex', gap: 4, padding: '8px 16px 0', background: '#313338', borderBottom: '1px solid #1e1f22' },
  tab: { padding: '8px 16px', cursor: 'pointer', color: '#949ba4', fontSize: 14, fontWeight: 500, borderBottom: '2px solid transparent' },
  tabActive: { color: '#fff', borderBottom: '2px solid #5865f2' },
};

export default App;