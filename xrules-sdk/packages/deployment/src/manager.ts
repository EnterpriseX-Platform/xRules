import { Deployment, DeploymentStatus, Release, Rule } from '@xrules/core';
import { DeployOptions, RollbackOptions } from './types';

export class DeploymentManager {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  async deploy(
    ruleId: string,
    environmentId: string,
    options: Partial<DeployOptions> = {}
  ): Promise<Deployment> {
    const response = await fetch(`${this.apiUrl}/api/v1/rules/${ruleId}/deploy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        environmentId,
        ...options,
      }),
    });

    if (!response.ok) {
      throw new Error(`Deployment failed: ${response.statusText}`);
    }

    return response.json();
  }

  async rollback(
    deploymentId: string,
    options: Partial<RollbackOptions> = {}
  ): Promise<Deployment> {
    const response = await fetch(
      `${this.apiUrl}/api/v1/deployments/${deploymentId}/rollback`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(options),
      }
    );

    if (!response.ok) {
      throw new Error(`Rollback failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getStatus(deploymentId: string): Promise<DeploymentStatus> {
    const response = await fetch(
      `${this.apiUrl}/api/v1/deployments/${deploymentId}/status`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get status: ${response.statusText}`);
    }

    return response.json();
  }

  async getDeployments(
    ruleId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Deployment[]> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));

    const response = await fetch(
      `${this.apiUrl}/api/v1/rules/${ruleId}/deployments?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get deployments: ${response.statusText}`);
    }

    return response.json();
  }

  async createRelease(
    ruleId: string,
    release: Partial<Release>
  ): Promise<Release> {
    const response = await fetch(`${this.apiUrl}/api/v1/rules/${ruleId}/releases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(release),
    });

    if (!response.ok) {
      throw new Error(`Failed to create release: ${response.statusText}`);
    }

    return response.json();
  }

  async approveDeployment(deploymentId: string, approved: boolean): Promise<void> {
    const response = await fetch(
      `${this.apiUrl}/api/v1/deployments/${deploymentId}/approve`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ approved }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to approve deployment: ${response.statusText}`);
    }
  }
}

export function createDeploymentManager(apiUrl: string, apiKey: string): DeploymentManager {
  return new DeploymentManager(apiUrl, apiKey);
}
