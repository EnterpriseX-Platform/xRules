'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Project, ApiResponse } from '@/types';
import { api, handleApiError } from '@/lib/api-client';
import { toast } from 'sonner';

const PROJECTS_KEY = 'projects';

export function useProjects(workspaceId: string) {
  return useQuery({
    queryKey: [PROJECTS_KEY, workspaceId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Project[]>>(
        `/workspaces/${workspaceId}/projects`
      );
      return response.data || [];
    },
    enabled: !!workspaceId,
  });
}

export function useProject(workspaceId: string, projectId: string) {
  return useQuery({
    queryKey: [PROJECTS_KEY, workspaceId, projectId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Project>>(
        `/workspaces/${workspaceId}/projects/${projectId}`
      );
      return response.data;
    },
    enabled: !!workspaceId && !!projectId,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      data,
    }: {
      workspaceId: string;
      data: {
        name: string;
        description?: string;
        code?: string;
        group?: string;
        agency?: string;
        level?: string;
      };
    }) => {
      const response = await api.post<ApiResponse<Project>>(
        `/workspaces/${workspaceId}/projects`,
        data
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [PROJECTS_KEY, variables.workspaceId],
      });
      toast.success('Project created successfully');
    },
    onError: (error) => {
      toast.error(handleApiError(error));
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      projectId,
      data,
    }: {
      workspaceId: string;
      projectId: string;
      data: Partial<Project>;
    }) => {
      const response = await api.patch<ApiResponse<Project>>(
        `/workspaces/${workspaceId}/projects/${projectId}`,
        data
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [PROJECTS_KEY, variables.workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: [PROJECTS_KEY, variables.workspaceId, variables.projectId],
      });
      toast.success('Project updated successfully');
    },
    onError: (error) => {
      toast.error(handleApiError(error));
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      projectId,
    }: {
      workspaceId: string;
      projectId: string;
    }) => {
      await api.delete(`/workspaces/${workspaceId}/projects/${projectId}`);
      return { workspaceId, projectId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [PROJECTS_KEY, variables.workspaceId],
      });
      toast.success('Project deleted successfully');
    },
    onError: (error) => {
      toast.error(handleApiError(error));
    },
  });
}
