import { Stack } from 'expo-router';

/** Questions tab owns its own stack so the editor opens over the list and Back returns to it. */
export default function QuestionsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
