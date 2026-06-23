import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  commitBindings,
  connectModbus,
  ConnectionApiError,
  disconnectModbus,
  getConnectionStatus,
  getModelBundle,
  listPorts,
  scanRegisters,
  testRead,
} from "./api";
import type {
  Binding,
  ConnectionFormState,
  EndpointError,
  ScanRequest,
  ScanRow,
  TestReadResult,
} from "./types";

const DEFAULT_FORM: ConnectionFormState = {
  port: "",
  baudrate: 9600,
  parity: "N",
  stopbits: 1,
  bytesize: 8,
  slaveId: 1,
  pollHz: 1,
};

const DEFAULT_SCAN: ScanRequest = {
  startReg: 0,
  count: 42,
  regType: "input",
  dataType: "float32",
  wordOrder: "AB",
};

function upsertEndpointError(errors: EndpointError[], next: EndpointError): EndpointError[] {
  const idx = errors.findIndex((e) => e.endpoint === next.endpoint);
  if (idx >= 0) {
    const copy = [...errors];
    copy[idx] = next;
    return copy;
  }
  return [...errors, next];
}

function removeEndpointError(errors: EndpointError[], endpoint: string): EndpointError[] {
  return errors.filter((e) => e.endpoint !== endpoint);
}

export function useConnectionPanel() {
  const queryClient = useQueryClient();

  const [form, setForm] = useState<ConnectionFormState>(DEFAULT_FORM);
  const [scanRequest, setScanRequest] = useState<ScanRequest>(DEFAULT_SCAN);
  const [scanRows, setScanRows] = useState<ScanRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<ScanRow | null>(null);
  const [pendingBindings, setPendingBindings] = useState<Binding[]>([]);
  const [lastCommitMessage, setLastCommitMessage] = useState<string | null>(null);
  const [endpointErrors, setEndpointErrors] = useState<EndpointError[]>([]);
  const [lastTestResult, setLastTestResult] = useState<TestReadResult | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [committedTagIds, setCommittedTagIds] = useState<Set<string>>(new Set());

  const portsQuery = useQuery({
    queryKey: ["connection-ports"],
    queryFn: ({ signal }) => listPorts(signal),
    retry: false,
  });

  const statusQuery = useQuery({
    queryKey: ["connection-status"],
    queryFn: ({ signal }) => getConnectionStatus(signal),
    refetchInterval: 1000,
    retry: false,
  });

  const modelQuery = useQuery({
    queryKey: ["connection-model"],
    queryFn: ({ signal }) => getModelBundle(signal),
    retry: false,
  });

  useEffect(() => {
    if (portsQuery.isError) {
      const err = portsQuery.error;
      const next =
        err instanceof ConnectionApiError
          ? err.toEndpointError()
          : { endpoint: "GET /api/ports", message: String(err) };
      setEndpointErrors((prev) => upsertEndpointError(prev, next));
    } else if (portsQuery.isSuccess) {
      setEndpointErrors((prev) => removeEndpointError(prev, "GET /api/ports"));
    }
  }, [portsQuery.isError, portsQuery.isSuccess, portsQuery.error]);

  useEffect(() => {
    if (statusQuery.isError) {
      const err = statusQuery.error;
      const next =
        err instanceof ConnectionApiError
          ? err.toEndpointError()
          : { endpoint: "GET /api/connection/status", message: String(err) };
      setEndpointErrors((prev) => upsertEndpointError(prev, next));
    } else if (statusQuery.isSuccess) {
      setEndpointErrors((prev) => removeEndpointError(prev, "GET /api/connection/status"));
    }
  }, [statusQuery.isError, statusQuery.isSuccess, statusQuery.error]);

  useEffect(() => {
    if (modelQuery.isError) {
      const err = modelQuery.error;
      const next =
        err instanceof ConnectionApiError
          ? err.toEndpointError()
          : { endpoint: "GET /api/model", message: String(err) };
      setEndpointErrors((prev) => upsertEndpointError(prev, next));
    } else if (modelQuery.isSuccess) {
      setEndpointErrors((prev) => removeEndpointError(prev, "GET /api/model"));
    }
  }, [modelQuery.isError, modelQuery.isSuccess, modelQuery.error]);

  useEffect(() => {
    const ports = portsQuery.data;
    if (ports?.length === 1 && !form.port) {
      setForm((prev) => ({ ...prev, port: ports[0]! }));
    }
  }, [portsQuery.data, form.port]);

  const connectMutation = useMutation({
    mutationFn: () => connectModbus(form),
    onSuccess: () => {
      setEndpointErrors((prev) => removeEndpointError(prev, "POST /api/connection"));
      void statusQuery.refetch();
    },
    onError: (err) => {
      const next =
        err instanceof ConnectionApiError
          ? err.toEndpointError()
          : { endpoint: "POST /api/connection", message: String(err) };
      setEndpointErrors((prev) => upsertEndpointError(prev, next));
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectModbus(),
    onSuccess: () => void statusQuery.refetch(),
    onError: (err) => {
      const next =
        err instanceof ConnectionApiError
          ? err.toEndpointError()
          : { endpoint: "POST /api/connection/disconnect", message: String(err) };
      setEndpointErrors((prev) => upsertEndpointError(prev, next));
    },
  });

  const scanMutation = useMutation({
    mutationFn: () => scanRegisters(scanRequest),
    onSuccess: (rows) => {
      setScanRows(rows);
      setEndpointErrors((prev) => removeEndpointError(prev, "POST /api/scan"));
    },
    onError: (err) => {
      const next =
        err instanceof ConnectionApiError
          ? err.toEndpointError()
          : { endpoint: "POST /api/scan", message: String(err) };
      setEndpointErrors((prev) => upsertEndpointError(prev, next));
    },
  });

  const testReadMutation = useMutation({
    mutationFn: (channelRef: string) => testRead(channelRef),
    onSuccess: (result) => {
      setLastTestResult(result);
      setEndpointErrors((prev) => removeEndpointError(prev, "POST /api/test"));
    },
    onError: (err) => {
      setLastTestResult(null);
      const next =
        err instanceof ConnectionApiError
          ? err.toEndpointError()
          : { endpoint: "POST /api/test", message: String(err) };
      setEndpointErrors((prev) => upsertEndpointError(prev, next));
    },
  });

  const commitBindingsMutation = useMutation({
    mutationFn: () => commitBindings(pendingBindings),
    onSuccess: (result) => {
      const committedIds = pendingBindings.map((b) => b.tagId).filter(Boolean);
      setCommittedTagIds((prev) => {
        const next = new Set(prev);
        committedIds.forEach((id) => next.add(id));
        return next;
      });
      setPendingBindings([]);
      setCommitError(null);
      const auditId = result.audit_id ?? (result.audit_entry as { id?: string } | undefined)?.id;
      const auditNote = auditId ? ` Audit: ${auditId}.` : "";
      setLastCommitMessage(
        `Model bindings committed. Runtime will reflect new TagFrames when polling sees the tag.${auditNote}`,
      );
      setEndpointErrors((prev) => removeEndpointError(prev, "POST /api/bindings"));
      void modelQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["compiled-bundle"] });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err);
      setCommitError(message);
      const next =
        err instanceof ConnectionApiError
          ? err.toEndpointError()
          : { endpoint: "POST /api/bindings", message };
      setEndpointErrors((prev) => upsertEndpointError(prev, next));
    },
  });

  const updateForm = useCallback((patch: Partial<ConnectionFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateScanRequest = useCallback((patch: Partial<ScanRequest>) => {
    setScanRequest((prev) => ({ ...prev, ...patch }));
  }, []);

  const connect = useCallback(() => connectMutation.mutate(), [connectMutation]);
  const disconnect = useCallback(() => disconnectMutation.mutate(), [disconnectMutation]);
  const scan = useCallback(() => scanMutation.mutate(), [scanMutation]);

  const selectRow = useCallback((row: ScanRow | null) => {
    setSelectedRow(row);
    setLastTestResult(null);
  }, []);

  const testSelectedRow = useCallback(() => {
    if (!selectedRow?.channelRef) return;
    testReadMutation.mutate(selectedRow.channelRef);
  }, [selectedRow, testReadMutation]);

  const addOrUpdatePendingBinding = useCallback((binding: Binding) => {
    setPendingBindings((prev) => {
      const idx = prev.findIndex((b) => b.channelRef === binding.channelRef);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = binding;
        return copy;
      }
      return [...prev, binding];
    });
    setCommitError(null);
  }, []);

  const removePendingBinding = useCallback((channelRef: string) => {
    setPendingBindings((prev) => prev.filter((b) => b.channelRef !== channelRef));
  }, []);

  const clearPendingBindings = useCallback(() => {
    setPendingBindings([]);
    setCommitError(null);
  }, []);

  const commitPendingBindings = useCallback(() => {
    commitBindingsMutation.mutate();
  }, [commitBindingsMutation]);

  const refreshPorts = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["connection-ports"] });
  }, [queryClient]);

  const isTagCommitted = useCallback(
    (tagId: string) => committedTagIds.has(tagId),
    [committedTagIds],
  );

  return {
    form,
    scanRequest,
    scanRows,
    selectedRow,
    pendingBindings,
    lastCommitMessage,
    endpointErrors,
    lastTestResult,
    commitError,
    ports: portsQuery.data ?? [],
    portsLoading: portsQuery.isLoading,
    portsError: portsQuery.isError,
    status: statusQuery.data,
    statusLoading: statusQuery.isLoading,
    model: modelQuery.data,
    modelLoading: modelQuery.isLoading,
    connectPending: connectMutation.isPending,
    disconnectPending: disconnectMutation.isPending,
    scanPending: scanMutation.isPending,
    testPending: testReadMutation.isPending,
    commitPending: commitBindingsMutation.isPending,
    updateForm,
    updateScanRequest,
    connect,
    disconnect,
    scan,
    selectRow,
    testSelectedRow,
    addOrUpdatePendingBinding,
    removePendingBinding,
    clearPendingBindings,
    commitPendingBindings,
    refreshPorts,
    committedTagIds,
    isTagCommitted,
  };
}