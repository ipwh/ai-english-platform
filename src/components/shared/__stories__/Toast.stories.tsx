import type { Meta, StoryObj } from '@storybook/react';
import { Toast, ToastProvider } from '../Toast';

const meta: Meta<typeof Toast> = {
  title: 'Shared/Toast',
  component: Toast,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  decorators: [(Story: React.FC) => <ToastProvider><Story /></ToastProvider>],
};

export default meta;
type Story = StoryObj<typeof Toast>;

export const Success: Story = { args: { message: '儲存成功！', type: 'success', visible: true } };
export const Error: Story = { args: { message: '操作失敗，請重試', type: 'error', visible: true } };
export const Warning: Story = { args: { message: '請注意：未儲存的變更將會遺失', type: 'warning', visible: true } };
export const Info: Story = { args: { message: '新版本已推出', type: 'info', visible: true } };
export const Hidden: Story = { args: { message: '隱藏', type: 'info', visible: false } };
