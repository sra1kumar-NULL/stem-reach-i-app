import { getActivations, getParticipation, getPerformance } from '@/api/client';
import { localDateString } from '@/lib/sm2';

export { getParticipation, getPerformance };

/**
 * The school-calendar day ("today" in the API's APP_TIMEZONE). The API exposes it as the `date` of the
 * activation response; falls back to the device's local day if that call fails (offline, 5xx).
 */
export async function getSchoolToday(): Promise<string> {
  try {
    return (await getActivations()).date;
  } catch {
    return localDateString();
  }
}
