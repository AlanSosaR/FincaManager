import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://udhuizkqnmkhljmezzkd.supabase.co';
const supabaseKey = 'sb_publishable_OPRK980X_0v6whN-5MwnMQ_W8e81Xq7';

export const supabase = createClient(supabaseUrl, supabaseKey);
