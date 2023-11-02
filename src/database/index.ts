import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const projectUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
const tableName = process.env.SUPABASE_TABLE!;

const supabase = createClient(projectUrl, supabaseKey);

supabase.auth.signInWithPassword({
  email: process.env.SUPABASE_EMAIL!,
  password: process.env.SUPABASE_PASSWORD!,
})

const getData = async (userId: number) => supabase
  .from(tableName)
  .select('*')
  .eq('telegram_profile_id', userId);

const create = async (obj: any) => supabase
  .from(tableName)
  .insert(obj)
  .select();

const remove = (battleTag: string, userId: number) => supabase
  .from(tableName)
  .delete()
  .eq('battle_tag', battleTag)
  .eq('telegram_profile_id', userId);

export {
  create, getData, remove
};
