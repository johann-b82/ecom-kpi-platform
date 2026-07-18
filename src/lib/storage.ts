import { createClient } from '@/lib/supabase/server';

const BUCKET = 'katalog';

/** True if the Storage bucket is reachable; UI uses this to decide upload vs URL-paste. */
export async function isStorageAvailable(): Promise<boolean> {
  try {
    const { error } = await createClient().storage.getBucket(BUCKET);
    return !error;
  } catch {
    return false;
  }
}

/** Uploads a file and returns its public URL, or null so the caller can fall back to URL paste. */
export async function uploadFile(path: string, file: File): Promise<string | null> {
  try {
    const supabase = createClient();
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl || null;
  } catch {
    return null;
  }
}
