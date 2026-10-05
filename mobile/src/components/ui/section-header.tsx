import type { ComponentProps } from 'react';

import { Heading } from '@/components/ui/heading';

export function SectionHeader({ children, ...props }: ComponentProps<typeof Heading>) {
  return (
    <Heading size="sm" accessibilityRole="header" {...props}>
      {children}
    </Heading>
  );
}
