import { WebhookConfig, WebhookEvent } from '@xrules/core';
import { WebhookPayload, WebhookDeliveryResult } from '../types';

export class WebhookConnector {
  private config: WebhookConfig;

  constructor(config: WebhookConfig) {
    this.config = config;
  }

  async send(event: string, data: Record<string, unknown>): Promise<WebhookDeliveryResult> {
    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    if (this.config.secret) {
      payload.signature = this.generateSignature(payload);
    }

    const startTime = performance.now();
    let retryCount = 0;
    let lastError: Error | null = null;

    const maxRetries = this.config.retryPolicy?.maxRetries ?? 3;
    const retryInterval = this.config.retryPolicy?.retryInterval ?? 1000;

    while (retryCount <= maxRetries) {
      try {
        const response = await fetch(this.config.url, {
          method: this.config.method,
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-ID': crypto.randomUUID(),
            'X-Event-Type': event,
            ...this.config.headers,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.config.timeout ?? 30000),
        });

        const responseBody = await response.text();

        return {
          success: response.ok,
          statusCode: response.status,
          responseBody,
          latency: performance.now() - startTime,
          retryCount,
        };
      } catch (error) {
        lastError = error as Error;
        retryCount++;

        if (retryCount <= maxRetries) {
          const backoffDelay = retryInterval * Math.pow(
            this.config.retryPolicy?.backoffMultiplier ?? 2,
            retryCount - 1
          );
          await this.delay(Math.min(backoffDelay, this.config.retryPolicy?.maxInterval ?? 60000));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Max retries exceeded',
      latency: performance.now() - startTime,
      retryCount: retryCount - 1,
    };
  }

  async test(): Promise<{ success: boolean; latency: number; error?: string }> {
    const testPayload: WebhookPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: { message: 'Test webhook connection' },
    };

    const startTime = performance.now();

    try {
      const response = await fetch(this.config.url, {
        method: this.config.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-ID': crypto.randomUUID(),
          'X-Event-Type': 'test',
          ...this.config.headers,
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000),
      });

      return {
        success: response.ok,
        latency: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        latency: performance.now() - startTime,
        error: (error as Error).message,
      };
    }
  }

  verifySignature(payload: WebhookPayload, signature: string, secret: string): boolean {
    const expectedSignature = this.generateSignature(payload, secret);
    return signature === expectedSignature;
  }

  private generateSignature(payload: WebhookPayload, secret?: string): string {
    const key = secret || this.config.secret;
    if (!key) throw new Error('No secret configured for signature generation');

    // Simple HMAC-like signature for demo
    // In production, use proper crypto library
    const data = `${payload.event}.${payload.timestamp}.${JSON.stringify(payload.data)}`;
    return btoa(data.split('').map((c, i) => 
      String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
    ).join(''));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function createWebhookConnector(config: WebhookConfig): WebhookConnector {
  return new WebhookConnector(config);
}
