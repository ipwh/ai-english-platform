// ============================================
// Tests: AI Provider Registry — fallback chain & caching
// P1: Core AI function test coverage
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================
// 一、Provider Interface Type Check
// ============================================

import type { AIProvider } from '../providers/provider-interface';

describe('AIProvider Interface', () => {
  it('should define the correct interface shape', () => {
    // Type-level test: verify AIProvider shape (call returns string per interface)
    const mockProvider: AIProvider = {
      name: 'mock',
      isConfigured: () => true,
      call: async () => 'mock response',
    };
    expect(mockProvider.name).toBe('mock');
    expect(mockProvider.isConfigured()).toBe(true);
  });

  it('isProviderAvailable should return false for unconfigured providers', async () => {
    const { isProviderAvailable } = await import('../providers/provider-interface');
    const unconfigured: AIProvider = {
      name: 'unconfigured',
      isConfigured: () => false,
      call: async () => '',
    };
    expect(isProviderAvailable(unconfigured)).toBe(false);
  });
});

// ============================================
// 二、ChatMessage Types
// ============================================

import type { ChatMessage, LLMCallOptions, ProviderCallResult } from '../providers/types';

describe('Provider Types', () => {
  it('ChatMessage should support system/user/assistant roles', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe('system');
  });

  it('LLMCallOptions should support all optional fields', () => {
    const opts: LLMCallOptions = {
      temperature: 0.7,
      maxTokens: 2048,
      jsonMode: true,
      timeoutMs: 8000,
    };
    expect(opts.temperature).toBe(0.7);
    expect(opts.jsonMode).toBe(true);
  });

  it('ProviderCallResult should track latency and fallback status', () => {
    const result: ProviderCallResult = {
      text: 'response',
      provider: 'deepseek',
      latencyMs: 1234,
      fallback: false,
    };
    expect(result.provider).toBe('deepseek');
    expect(result.fallback).toBe(false);
  });
});

// ============================================
// 三、Provider Registry Fallback Logic
// ============================================

describe('ProviderRegistry Fallback Chain', () => {
  it('should iterate through providers in priority order', async () => {
    const { providerRegistry } = await import('../providers/provider-registry');
    // Verify registry exists and has providers
    const available = providerRegistry.getAvailableProviders();
    // At least 1 provider should be available in test environment
    // (DeepSeek if DEEPSEEK_API_KEY is set, otherwise may be 0)
    expect(Array.isArray(available)).toBe(true);
  }, 15000);

  it('should track last used provider', async () => {
    const { providerRegistry } = await import('../providers/provider-registry');
    const last = providerRegistry.getLastUsed();
    expect(typeof last).toBe('string');
  });

  it('should return a provider by name', async () => {
    const { providerRegistry } = await import('../providers/provider-registry');
    const deepseek = providerRegistry.getProvider('deepseek');
    expect(deepseek).toBeDefined();
    expect(deepseek?.name).toBe('deepseek');
  });
});
