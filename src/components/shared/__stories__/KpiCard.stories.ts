// Sprint 40+: KpiCard Storybook stories
import type { Meta, StoryObj } from '@storybook/react';
import { KpiCard } from '../KpiCard';

const meta: Meta<typeof KpiCard> = {
  title: 'Shared/KpiCard',
  component: KpiCard,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    value: { control: 'text' },
    change: { control: 'text' },
    icon: { control: 'text' },
    trend: { control: 'select', options: ['up', 'down', 'neutral'] },
  },
};

export default meta;
type Story = StoryObj<typeof KpiCard>;

export const PositiveTrend: Story = {
  args: {
    title: '練習次數',
    value: '42',
    change: '+12%',
    icon: '📊',
    trend: 'up',
  },
};

export const NegativeTrend: Story = {
  args: {
    title: '錯誤率',
    value: '15%',
    change: '+3%',
    icon: '⚠️',
    trend: 'down',
  },
};

export const Neutral: Story = {
  args: {
    title: '連續學習天數',
    value: '7',
    change: '不變',
    icon: '🔥',
    trend: 'neutral',
  },
};

export const LargeValue: Story = {
  args: {
    title: '總 XP',
    value: '1,234',
    change: '+56 本日',
    icon: '⭐',
    trend: 'up',
  },
};

export const EmptyState: Story = {
  args: {
    title: '本週練習',
    value: '0',
    change: '尚未開始',
    icon: '📝',
    trend: 'neutral',
  },
};
