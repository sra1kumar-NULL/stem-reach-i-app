import { ActivityIndicator } from 'react-native';

import { Box } from '@/components/ui/box';

interface Props {
  label?: string;
}

export function LoadingScreen({ label = 'Loading, please wait' }: Props) {
  return (
    <Box
      className="flex-1 items-center justify-center bg-background"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <ActivityIndicator size="large" />
    </Box>
  );
}
