import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import type { DeployStatus, RemoteConnection } from '../../lib/admin-api';

export type StatusCardsProps = {
  apiAvailable: boolean;
  connection: RemoteConnection | null;
  lastDeploy?: DeployStatus | null;
  isDeploying: boolean;
  onDisconnect: () => Promise<void>;
  onDeploy: () => Promise<void>;
};

const statusVariant = (status?: DeployStatus | null): 'default' | 'success' | 'error' => {
  if (!status) return 'default';
  if (status.status === 'success') return 'success';
  if (status.status === 'error') return 'error';
  return 'default';
};

export const StatusCards = ({ apiAvailable, connection, lastDeploy, isDeploying, onDisconnect, onDeploy }: StatusCardsProps) => {
  const canDeploy = Boolean(connection) && apiAvailable && !isDeploying;

  const host = (() => {
    if (!connection?.baseUrl) return null;
    try {
      return new URL(connection.baseUrl).host;
    } catch {
      return connection.baseUrl;
    }
  })();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="border-dashed">
        <CardHeader className="pb-4">
          <CardDescription className="uppercase tracking-[0.3em] text-xs">Connection</CardDescription>
          <CardTitle className="flex items-center gap-2 text-lg">
            {connection ? connection.remoteName ?? host ?? 'Connected' : 'Not connected'}
            <span className="text-xs font-normal text-muted-foreground">{apiAvailable ? null : '(API offline)'}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-start justify-between gap-4 pt-0">
          <div className="space-y-2 text-sm text-muted-foreground">
            {connection ? (
              <>
                <p>Verified {connection.lastVerifiedAt ? new Date(connection.lastVerifiedAt).toLocaleString() : 'unknown'}</p>
                {connection.targetPath ? <p>Target: {connection.targetPath}</p> : null}
              </>
            ) : (
              <p>Use the form to establish a remote link.</p>
            )}
          </div>
          <Button variant="outline" disabled={!connection || isDeploying} onClick={() => onDisconnect()}>
            Disconnect
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardDescription className="uppercase tracking-[0.3em] text-xs">Deploy</CardDescription>
            <Badge variant={statusVariant(lastDeploy)}>{lastDeploy?.status ?? 'Idle'}</Badge>
          </div>
          <CardTitle>{lastDeploy?.message ?? 'Connect first to unlock deploys'}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Button size="lg" className="w-full" disabled={!canDeploy} onClick={() => onDeploy()}>
            {isDeploying ? 'Deploying…' : connection ? `Deploy to ${connection.baseUrl}` : 'Deploy site'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

