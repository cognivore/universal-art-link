import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminRuntimeConfig } from '../lib/runtime-config';
import {
  connectRemote,
  deploySite,
  disconnectRemote,
  fetchAdminState,
  type AdminStatePayload,
  type DeployStatus,
  type RemoteConnection
} from '../lib/admin-api';

export type LogEntry = {
  id: string;
  at: string;
  variant: 'info' | 'success' | 'error';
  message: string;
};

export type ConsoleState = {
  connection: RemoteConnection | null;
  isDeploying: boolean;
  lastDeploy?: DeployStatus | null;
  apiAvailable: boolean;
};

const initialState: ConsoleState = {
  connection: null,
  isDeploying: false,
  lastDeploy: null,
  apiAvailable: true
};

export const useAdminConsole = (config: AdminRuntimeConfig) => {
  const [state, setState] = useState<ConsoleState>(initialState);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connecting, setConnecting] = useState(false);

  const pushLog = useCallback((message: string, variant: LogEntry['variant'] = 'info') => {
    setLogs((entries) => [
      {
        id: crypto.randomUUID(),
        at: new Date().toLocaleTimeString(),
        variant,
        message
      },
      ...entries
    ]);
  }, []);

  const applyState = useCallback((payload: AdminStatePayload) => {
    setState({
      connection: payload.connection,
      isDeploying: payload.isDeploying,
      lastDeploy: payload.lastDeploy,
      apiAvailable: true
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const payload = await fetchAdminState(config);
      applyState(payload);
      if (payload.lastDeploy) {
        pushLog(payload.lastDeploy.message, payload.lastDeploy.status);
      }
    } catch (error) {
      setState((previous) => ({
        ...previous,
        apiAvailable: false,
        connection: null
      }));
      pushLog(error instanceof Error ? error.message : String(error), 'error');
    }
  }, [applyState, config, pushLog]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onConnect = useCallback(
    async (input: { baseUrl: string; secret: string }) => {
      setConnecting(true);
      try {
        const payload = await connectRemote(config, input);
        applyState(payload);
        pushLog(`Connected to ${payload.connection?.remoteName ?? payload.connection?.baseUrl ?? input.baseUrl}`, 'success');
      } catch (error) {
        pushLog(error instanceof Error ? error.message : String(error), 'error');
        throw error;
      } finally {
        setConnecting(false);
      }
    },
    [applyState, config, pushLog]
  );

  const onDisconnect = useCallback(async () => {
    await disconnectRemote(config);
    setState((previous) => ({
      ...previous,
      connection: null
    }));
    pushLog('Disconnected from remote.');
  }, [config, pushLog]);

  const onDeploy = useCallback(async () => {
    setState((previous) => ({
      ...previous,
      isDeploying: true
    }));
    try {
      const result = await deploySite(config);
      setState((previous) => ({
        ...previous,
        isDeploying: false,
        lastDeploy: result
      }));
      pushLog(result.message, 'success');
    } catch (error) {
      setState((previous) => ({
        ...previous,
        isDeploying: false
      }));
      const message = error instanceof Error ? error.message : String(error);
      pushLog(message, 'error');
      throw error;
    } finally {
      void refresh();
    }
  }, [config, pushLog, refresh]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return useMemo(
    () => ({
      state,
      logs,
      connecting,
      connect: onConnect,
      disconnect: onDisconnect,
      deploy: onDeploy,
      refresh,
      clearLogs
    }),
    [connecting, logs, onConnect, onDisconnect, onDeploy, refresh, state, clearLogs]
  );
};

