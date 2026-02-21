'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { OAuthProvider } from '@/types';

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { handleOAuthCallback, oauthError, clearOAuthError } = useAuthStore();
  
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    clearOAuthError();
    
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Get provider from URL path
    const pathParts = window.location.pathname.split('/');
    const provider = pathParts[pathParts.length - 1] as OAuthProvider;

    // Handle OAuth errors from the provider
    if (error) {
      setStatus('error');
      setErrorMessage(errorDescription || error || 'OAuth authentication failed');
      return;
    }

    // Validate required parameters
    if (!code || !state) {
      setStatus('error');
      setErrorMessage('Missing required OAuth parameters');
      return;
    }

    // Validate provider
    const validProviders: OAuthProvider[] = ['google', 'github', 'microsoft', 'oidc'];
    if (!validProviders.includes(provider)) {
      setStatus('error');
      setErrorMessage('Invalid OAuth provider');
      return;
    }

    // Process the OAuth callback
    const processCallback = async () => {
      try {
        await handleOAuthCallback(provider, code, state);
        setStatus('success');
        
        // Redirect to home after a short delay
        setTimeout(() => {
          router.push('/');
        }, 1500);
      } catch (err) {
        setStatus('error');
        setErrorMessage(oauthError || 'Failed to complete OAuth authentication');
      }
    };

    processCallback();
  }, [searchParams, handleOAuthCallback, router, oauthError, clearOAuthError]);

  const handleRetry = () => {
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">
            {status === 'processing' && 'Completing Sign In'}
            {status === 'success' && 'Sign In Successful'}
            {status === 'error' && 'Sign In Failed'}
          </CardTitle>
          <CardDescription className="text-center">
            {status === 'processing' && 'Please wait while we complete the authentication...'}
            {status === 'success' && 'You have been successfully authenticated.'}
            {status === 'error' && 'We encountered an error during authentication.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4 py-6">
          {status === 'processing' && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Processing your login...
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-sm text-muted-foreground">
                Redirecting you to the dashboard...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <div className="text-center space-y-2">
                <p className="text-sm text-destructive font-medium">
                  {errorMessage}
                </p>
                <p className="text-sm text-muted-foreground">
                  Please try again or contact support if the problem persists.
                </p>
              </div>
              <Button onClick={handleRetry} variant="outline" className="mt-4">
                Back to Login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
