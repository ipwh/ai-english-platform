// Sprint 86: Plugin Registry — canonical registry for all platform plugins

import type { PlatformPlugin, PluginRegistry as IPluginRegistry } from './plugin';
import { logger } from '@/shared/logger/logger';

class PluginRegistryImpl implements IPluginRegistry {
  private plugins = new Map<string, PlatformPlugin>();
  private tags = new Map<string, Set<string>>();

  register(plugin: PlatformPlugin): void {
    if (this.plugins.has(plugin.id)) {
      logger.warn({ module: 'plugin-registry', pluginId: plugin.id }, 'Plugin already registered — overwriting');
    }
    this.plugins.set(plugin.id, plugin);
    logger.info({ module: 'plugin-registry', pluginId: plugin.id, version: plugin.version }, 'Plugin registered');
  }

  unregister(pluginId: string): void {
    this.plugins.delete(pluginId);
    for (const [, tagSet] of this.tags) {
      tagSet.delete(pluginId);
    }
  }

  getPlugin<T extends PlatformPlugin>(pluginId: string): T | undefined {
    return this.plugins.get(pluginId) as T | undefined;
  }

  getPlugins(): PlatformPlugin[] {
    return Array.from(this.plugins.values());
  }

  getPluginsByTag(tag: string): PlatformPlugin[] {
    const ids = this.tags.get(tag);
    if (!ids) return [];
    return Array.from(ids).map(id => this.plugins.get(id)!).filter(Boolean);
  }

  /** Tag a plugin for category-based lookup */
  tagPlugin(pluginId: string, tag: string): void {
    if (!this.tags.has(tag)) this.tags.set(tag, new Set());
    this.tags.get(tag)!.add(pluginId);
  }

  /** Get registry statistics */
  getStats() {
    return {
      totalPlugins: this.plugins.size,
      plugins: Array.from(this.plugins.values()).map(p => ({ id: p.id, version: p.version, name: p.name })),
      tags: Array.from(this.tags.entries()).map(([tag, ids]) => ({ tag, count: ids.size })),
    };
  }
}

/** Singleton plugin registry */
export const pluginRegistry = new PluginRegistryImpl();
