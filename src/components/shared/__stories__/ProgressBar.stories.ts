import type { Meta, StoryObj } from '@storybook/react';
import { ProgressBar } from '../ProgressBar';

const meta: Meta<typeof ProgressBar> = {
  title: 'Shared/ProgressBar',
  component: ProgressBar,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100 } },
    color: { control: 'select', options: ['blue', 'green', 'red', 'yellow'] },
  },
};

export default meta;
type Story = StoryObj<typeof ProgressBar>;

export const Low: Story = { args: { value: 25, color: 'red', label: '25%' } };
export const Medium: Story = { args: { value: 55, color: 'yellow', label: '55%' } };
export const High: Story = { args: { value: 85, color: 'green', label: '85%' } };
export const Full: Story = { args: { value: 100, color: 'green', label: '100%' } };
export const Empty: Story = { args: { value: 0, color: 'blue', label: '0%' } };
export const WithoutLabel: Story = { args: { value: 65 } };
