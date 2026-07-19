import type { Meta, StoryObj } from '@storybook/react';
import { EmptyState } from '../EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'Shared/EmptyState',
  component: EmptyState,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const NoData: Story = { args: { message: '暫無資料', icon: '📭' } };
export const NoSearchResults: Story = { args: { message: '找不到相符的結果', icon: '🔍' } };
export const Error: Story = { args: { message: '載入失敗，請稍後重試', icon: '⚠️' } };
export const CustomAction: Story = {
  args: {
    message: '尚無練習記錄',
    icon: '📝',
    action: { label: '開始練習', onClick: () => {} },
  },
};
