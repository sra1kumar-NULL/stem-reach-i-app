import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, AvatarFallbackText } from '@/components/ui/avatar';
import { Box } from '@/components/ui/box';
import { Skeleton } from '@/components/ui/skeleton';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Nord, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { initials } from '@/lib/profile';
import { studentSubtitle } from '@/lib/students';
import type { StudentDto } from '@stemreach/core';

const AVATAR_COLORS = [Nord.nord15, Nord.nord7, Nord.nord12, Nord.nord10, Nord.nord13, Nord.nord11];

/** Stable colour per student so it does not shift when filtering or grouping. */
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

interface RowProps {
  student: StudentDto;
  today: string;
  onReset: (student: StudentDto) => void;
}

/** One student: avatar, name, "Class 10A · Active today", and a single 44pt reset action. */
export const StudentRow = memo(function StudentRow({ student, today, onReset }: RowProps) {
  const theme = useTheme();
  const color = avatarColor(student.id);
  return (
    <Box className="bg-card rounded-2xl pl-3 pr-1.5 py-2 flex-row items-center gap-3" style={styles.row}>
      <Avatar className="rounded-full" style={{ backgroundColor: color }}>
        <AvatarFallbackText className="font-extrabold" style={{ color: onAccent(color), fontSize: 15 }}>
          {initials(student.full_name)}
        </AvatarFallbackText>
      </Avatar>
      <View style={styles.text}>
        <UIText className="text-foreground" style={Type.bodySemi} numberOfLines={1}>
          {student.full_name}
        </UIText>
        <UIText className="text-xs text-muted-foreground" style={Type.body} numberOfLines={1}>
          {studentSubtitle(student, today)}
        </UIText>
      </View>
      <Pressable
        onPress={() => onReset(student)}
        accessibilityRole="button"
        accessibilityLabel={`Reset password for ${student.full_name}`}
        hitSlop={4}
        style={({ pressed }) => [styles.action, { backgroundColor: Accents.primarySoft, opacity: pressed ? 0.6 : 1 }]}
      >
        <Ionicons name="key-outline" size={22} color={theme.primaryText} />
      </Pressable>
    </Box>
  );
});

/** Class heading used when a long roster is grouped. */
export function GroupHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.groupHeader} accessibilityRole="header">
      <UIText className="text-muted-foreground" style={[Type.bodyBold, styles.groupTitle]}>
        {title.toUpperCase()}
      </UIText>
      <UIText className="text-muted-foreground text-xs" style={Type.body}>
        {count}
      </UIText>
    </View>
  );
}

/** Placeholder rows matching the real row height. */
export function StudentListSkeleton() {
  return (
    <View style={styles.skeletonList} accessibilityLabel="Loading students" accessibilityRole="progressbar">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Box key={i} className="bg-card rounded-2xl pl-3 pr-3 py-2 flex-row items-center gap-3" style={styles.row}>
          <Skeleton variant="circular" className="h-10 w-10" />
          <View style={styles.text}>
            <Skeleton variant="rounded" className="h-4 w-2/5 rounded-md" />
            <Skeleton variant="rounded" className="h-3 w-3/5 rounded-md" />
          </View>
          <Skeleton variant="circular" className="h-9 w-9" />
        </Box>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 64 },
  text: { flex: 1, gap: 4, minWidth: 0 },
  action: { width: 44, height: 44, borderRadius: 22, marginRight: 4, alignItems: 'center', justifyContent: 'center' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 12, paddingBottom: 2 },
  groupTitle: { fontSize: 12, letterSpacing: 0.8 },
  skeletonList: { gap: 8 },
});
