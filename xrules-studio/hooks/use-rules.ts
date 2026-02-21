'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Rule, ApiResponse, FlowNode, FlowEdge } from '@/types';
import { api, handleApiError } from '@/lib/api-client';
import { toast } from 'sonner';

const RULES_KEY = 'rules';

export function useRules(workspaceId: string, projectId: string) {
  return useQuery({
    queryKey: [RULES_KEY, workspaceId, projectId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Rule[]>>(
        `/workspaces/${workspaceId}/projects/${projectId}/rules`
      );
      return response.data || [];
    },
    enabled: !!workspaceId && !!projectId,
  });
}

export function useRule(workspaceId: string, projectId: string, ruleId: string) {
  return useQuery({
    queryKey: [RULES_KEY, workspaceId, projectId, ruleId],
    queryFn: async () => {
      const response = await api.get<ApiResponse<Rule>>(
        `/workspaces/${workspaceId}/projects/${projectId}/rules/${ruleId}`
      );
      return response.data;
    },
    enabled: !!workspaceId && !!projectId && !!ruleId,
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      projectId,
      data,
    }: {
      workspaceId: string;
      projectId: string;
      data: { name: string; description?: string };
    }) => {
      const response = await api.post<ApiResponse<Rule>>(
        `/workspaces/${workspaceId}/projects/${projectId}/rules`,
        data
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [RULES_KEY, variables.workspaceId, variables.projectId],
      });
      toast.success('Rule created successfully');
    },
    onError: (error) => {
      toast.error(handleApiError(error));
    },
  });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      projectId,
      ruleId,
      data,
    }: {
      workspaceId: string;
      projectId: string;
      ruleId: string;
      data: {
        name?: string;
        description?: string;
        nodes?: FlowNode[];
        edges?: FlowEdge[];
        status?: 'draft' | 'active' | 'archived';
      };
    }) => {
      const response = await api.patch<ApiResponse<Rule>>(
        `/workspaces/${workspaceId}/projects/${projectId}/rules/${ruleId}`,
        data
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [RULES_KEY, variables.workspaceId, variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: [RULES_KEY, variables.workspaceId, variables.projectId, variables.ruleId],
      });
      toast.success('Rule saved successfully');
    },
    onError: (error) => {
      toast.error(handleApiError(error));
    },
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      projectId,
      ruleId,
    }: {
      workspaceId: string;
      projectId: string;
      ruleId: string;
    }) => {
      await api.delete(
        `/workspaces/${workspaceId}/projects/${projectId}/rules/${ruleId}`
      );
      return { workspaceId, projectId, ruleId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [RULES_KEY, variables.workspaceId, variables.projectId],
      });
      toast.success('Rule deleted successfully');
    },
    onError: (error) => {
      toast.error(handleApiError(error));
    },
  });
}

export function useExecuteRule() {
  return useMutation({
    mutationFn: async ({
      workspaceId,
      projectId,
      ruleId,
      input,
    }: {
      workspaceId: string;
      projectId: string;
      ruleId: string;
      input?: Record<string, unknown>;
    }) => {
      const response = await api.post<ApiResponse<{ executionId: string }>>(
        `/workspaces/${workspaceId}/projects/${projectId}/rules/${ruleId}/execute`,
        { input }
      );
      return response.data;
    },
    onSuccess: () => {
      toast.success('Rule execution started');
    },
    onError: (error) => {
      toast.error(handleApiError(error));
    },
  });
}
