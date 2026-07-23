// Sprint 40+: Modal Storybook stories
import type { Meta, StoryObj } from '@storybook/react';
import { Modal } from '../Modal';

const meta: Meta<typeof Modal> = {
  title: 'Shared/Modal',
  component: Modal,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    isOpen: { control: 'boolean' },
    title: { control: 'text' },
    size: { control: 'select', options: ['sm', 'md', 'lg', 'xl', 'full'] },
    onClose: { action: 'closed' },
  },
};

export default meta;
type Story = StoryObj<typeof Modal>;

export const Small: Story = {
  args: {
    isOpen: true,
    title: '確認刪除',
    size: 'sm',
    children: <div className="p-4"><p>確定要刪除這個項目嗎？此操作無法復原。</p></div>,
    onClose: () => {},
  },
};

export const Medium: Story = {
  args: {
    isOpen: true,
    title: '新增生字',
    size: 'md',
    children: (
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">單字</label>
          <input className="w-full border rounded px-3 py-2" placeholder="輸入英文單字" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">中文意思</label>
          <input className="w-full border rounded px-3 py-2" placeholder="輸入中文翻譯" />
        </div>
      </div>
    ),
    onClose: () => {},
  },
};

export const Large: Story = {
  args: {
    isOpen: true,
    title: '練習結果',
    size: 'lg',
    children: (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-green-50 p-4 rounded-lg text-center">
            <div className="text-3xl font-bold text-green-600">8</div>
            <div className="text-sm text-green-700">正確</div>
          </div>
          <div className="bg-red-50 p-4 rounded-lg text-center">
            <div className="text-3xl font-bold text-red-600">2</div>
            <div className="text-sm text-red-700">錯誤</div>
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold">正確率 80%</div>
          <div className="text-sm text-gray-500">DSE Level 4</div>
        </div>
      </div>
    ),
    onClose: () => {},
  },
};

export const Closed: Story = {
  args: {
    isOpen: false,
    title: '隱藏視窗',
    children: <div className="p-4">此 Modal 應隱藏</div>,
    onClose: () => {},
  },
};
