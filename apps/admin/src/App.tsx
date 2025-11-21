import { useMemo } from 'react';
import { AdminShell } from './components/admin/AdminShell';
import { ConnectionPanel } from './features/connection/ConnectionPanel';
import { StatusCards } from './features/connection/StatusCards';
import { ActivityLog } from './features/activity/ActivityLog';
import { PreviewPane } from './features/preview/PreviewPane';
import { StrapiCard } from './features/strapi/StrapiCard';
import { getPreviewCandidates, getRuntimeConfig } from './lib/runtime-config';
import { useAdminConsole } from './hooks/useAdminConsole';

export const App = () => {
  const runtimeConfig = useMemo(() => getRuntimeConfig(), []);
  const previewPaths = useMemo(() => getPreviewCandidates(), []);
  const admin = useAdminConsole(runtimeConfig);

  return (
    <AdminShell>
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <ConnectionPanel apiAvailable={admin.state.apiAvailable} connecting={admin.connecting} onConnect={admin.connect} />
          <StatusCards
            apiAvailable={admin.state.apiAvailable}
            connection={admin.state.connection}
            lastDeploy={admin.state.lastDeploy}
            isDeploying={admin.state.isDeploying}
            onDisconnect={admin.disconnect}
            onDeploy={admin.deploy}
          />
          <ActivityLog entries={admin.logs} onClear={admin.clearLogs} />
          <StrapiCard strapiUrl={runtimeConfig.strapiUrl} />
        </div>
        <PreviewPane config={runtimeConfig} paths={previewPaths} />
      </div>
    </AdminShell>
  );
};

