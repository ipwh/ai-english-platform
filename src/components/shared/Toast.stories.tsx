// ============================================
// Storybook: Toast 元件範例
// 作為其他 31 個元件的 Story 範本
// ============================================

import type { Meta, StoryObj } from '@storybook/react';
import { Toast } from './Toast';

const meta: Meta<typeof Toast> = {
  title: 'Shared/Toast',
  component: Toast,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['success', 'error', 'warning', 'info'],
    },
    message: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof Toast>;

export const Success: Story = {
  args: {
    type: 'success',
    message: '儲存成功！Assignment saved.',
  },
};

export const Error: Story = {
  args: {
    type: 'error',
    message: '發生錯誤，請稍後重試。An error occurred.',
  },
};

export const Warning: Story = {
  args: {
    type: 'warning',
    message: '請注意：作答時間只剩 5 分鐘。',
  },
};

export const Info: Story = {
  args: {
    type: 'info',
    message: '新功能：現在支援語音輸入。',
  },
};
