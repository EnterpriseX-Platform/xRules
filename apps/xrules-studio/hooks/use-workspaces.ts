'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Workspace, ApiResponse } from '@/types';
import { api, handleApiError } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { toast } from 'sonner';

const WORKSPACES_KEY = 'workspaces';

export function useWorkspaces() {
  const { setWorkspaces, setLoading, setError } = useWorkspaceStore();

  return useQuery({
    queryKey: [WORKSPACES_KEY],
    queryFn: async () => {
      setLoading(true);
      try {
        const response = await api.get<ApiResponse<Workspace[]>>('/workspaces');
        const workspaces = response.data || [];
        setWorkspaces(workspaces);
        return workspaces;
      } catch (error) {
        const message = handleApiError(error);
        setError(message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
  });
}

export function useWorkspace(id: string) {
  return useQuery({
    queryKey: [WORKSPACES_KEY, id],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Workspace>>(`/workspaces/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  const { addWorkspace } = useWorkspaceStore();

  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const response = await api.post<ApiResponse<Workspace>>('/workspaces', data);
      return response.data;
    },
    onSuccess: (workspace) => {
      if (workspace) {
        addWorkspace(workspace);
        queryClient.invalidateQueries({ queryKey: [WORKSPACES_KEY] });
        toast.success('Workspace created successfully');
      }
    },
    onError: (error) => {
      toast.error(handleApiError(error));
    },
  });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();
  const { updateWorkspace } = useWorkspaceStore();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Workspace>;
    }) => {
      const response = await api.patch<ApiResponse<Workspace>>(`/workspaces/${id}`, data);
      return response.data;
    },
    onSuccess: (workspace, variables) => {
      if (workspace) {
        updateWorkspace(variables.id, workspace);
        queryClient.invalidateQueries({ queryKey: [WORKSPACES_KEY] });
        toast.success('Workspace updated successfully');
      }
    },
    onError: (error) => {
      toast.error(handleApiError(error));
    },
  });
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient();
  const { removeWorkspace } = useWorkspaceStore();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/workspaces/${id}`);
      return id;
    },
    onSuccess: (id) => {
      removeWorkspace(id);
      queryClient.invalidateQueries({ queryKey: [WORKSPACES_KEY] });
      toast.success('Workspace deleted successfully');
    },
    onError: (error) => {
      toast.error(handleApiError(error));
    },
  });
}
