// Sprint 88: Workflow Registry — canonical registry for workflow definitions
// Workflows are registered here and discovered by the WorkflowEngine.

import type { WorkflowDefinition } from './workflow';
import { logger } from '@/shared/logger/logger';

class WorkflowRegistry {
  private workflows = new Map<string, WorkflowDefinition>();
  private tags = new Map<string, Set<string>>();

  register(workflow: WorkflowDefinition): void {
    if (this.workflows.has(workflow.name)) {
      logger.warn({ module: 'workflow-registry', name: workflow.name }, 'Workflow already registered — overwriting');
    }
    this.workflows.set(workflow.name, workflow);
    for (const tag of workflow.tags) {
      if (!this.tags.has(tag)) this.tags.set(tag, new Set());
      this.tags.get(tag)!.add(workflow.name);
    }
    logger.info({ module: 'workflow-registry', name: workflow.name, stages: workflow.stages.length }, 'Workflow registered');
  }

  unregister(name: string): void {
    this.workflows.delete(name);
    for (const [, tagSet] of this.tags) tagSet.delete(name);
  }

  getWorkflow(name: string): WorkflowDefinition | undefined {
    return this.workflows.get(name);
  }

  listWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  getWorkflowsByTag(tag: string): WorkflowDefinition[] {
    const names = this.tags.get(tag);
    if (!names) return [];
    return Array.from(names).map(n => this.workflows.get(n)!).filter(Boolean);
  }

  getStats() {
    return {
      totalWorkflows: this.workflows.size,
      workflows: Array.from(this.workflows.values()).map(w => ({
        name: w.name,
        description: w.description,
        stages: w.stages.length,
        tags: w.tags,
      })),
    };
  }
}

export const workflowRegistry = new WorkflowRegistry();
