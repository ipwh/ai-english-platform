// Sprint 40+: Skeleton Storybook stories
import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton } from '../Skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'Shared/Skeleton',
  component: Skeleton,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    width: { control: 'text' },
    height: { control: 'text' },
    className: { control: 'text' },
    variant: { control: 'select', options: ['text', 'circular', 'rectangular', 'rounded'] },
  },
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const TextLine: Story = {
  args: {
    width: '200px',
    height: '16px',
    variant: 'text',
  },
};

export const AvatarCircle: Story = {
  args: {
    width: '48px',
    height: '48px',
    variant: 'circular',
  },
};

export const CardPreview: Story = {
  args: {
    width: '300px',
    height: '180px',
    variant: 'rounded',
  },
};

export const FullWidth: Story = {
  args: {
    width: '100%',
    height: '40px',
    variant: 'rectangular',
  },
};

export const MultipleLines: Story = {
  render: () => (
    <div className="space-y-3 w-80">
      <Skeleton width="100%" height="20px" variant="text" />
      <Skeleton width="80%" height="16px" variant="text" />
      <Skeleton width="60%" height="16px" variant="text" />
      <Skeleton width="90%" height="16px" variant="text" />
    </div>
  ),
};
