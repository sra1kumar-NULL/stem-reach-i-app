import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Accents, Nord } from '@/constants/theme';
import { PRIMARY_SOLID } from './tokens';

/** Visual-only checkbox box (the parent Pressable carries role + state). */
export function CheckBox({ state }: { state: boolean | 'mixed' }) {
  const on = state !== false;
  return (
    <View style={[styles.box, on && styles.boxOn]} accessible={false} importantForAccessibility="no-hide-descendants">
      {state === true && <Ionicons name="checkmark" size={16} color={Nord.nord6} />}
      {state === 'mixed' && <Ionicons name="remove" size={16} color={Nord.nord6} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Accents.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: PRIMARY_SOLID, borderColor: PRIMARY_SOLID },
});
