'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateRule } from '@/hooks/use-rules';

interface CreateRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  projectId: string;
}

export function CreateRuleModal({ isOpen, onClose, workspaceId, projectId }: CreateRuleModalProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const createRule = useCreateRule();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !workspaceId || !projectId) return;

    try {
      const rule = await createRule.mutateAsync({
        workspaceId,
        projectId,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
        },
      });
      
      setName('');
      setDescription('');
      onClose();
      
      // Navigate to the rule editor
      if (rule?.id) {
        router.push(`/workspaces/${workspaceId}/projects/${projectId}/rules/${rule.id}`);
      }
    } catch {
      // Error handled by hook
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Rule</DialogTitle>
            <DialogDescription>
              Create a new rule/flow for this project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="My Rule"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of your rule..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={createRule.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createRule.isPending || !name.trim()}>
              {createRule.isPending ? 'Creating...' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
