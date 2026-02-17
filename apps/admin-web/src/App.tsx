import React from 'react';
import { useAuth } from './hooks/useAuth.js';
import { useCrdt } from './hooks/useCrdt.js';
import { LoginPage } from './components/LoginPage.js';
import { Editor } from './components/Editor.js';
import { siteApi } from './api.js';

export const App: React.FC = () => {
  const { auth, login, logout } = useAuth();
  const { doc, status, undo, redo } = useCrdt();

  if (auth.status === 'loading') {
    return <div className="loading">Loading...</div>;
  }

  if (auth.status === 'unauthenticated') {
    return <LoginPage onLogin={login} />;
  }

  const isMetaAdmin = auth.memberships.some(
    (m: { role: string }) => m.role === 'meta_admin',
  );

  return (
    <Editor
      doc={doc}
      status={status}
      undo={undo}
      redo={redo}
      isMetaAdmin={isMetaAdmin}
      onLogout={logout}
      onPublish={async () => {
        try {
          await siteApi.publish();
        } catch (err) {
          console.error('Publish failed:', err);
        }
      }}
      onSnapshot={async (label) => {
        try {
          await siteApi.createSnapshot(label);
        } catch (err) {
          console.error('Snapshot failed:', err);
        }
      }}
    />
  );
};
