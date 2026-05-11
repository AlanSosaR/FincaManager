import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://udhuizkqnmkhljmezzkd.supabase.co';
const supabaseKey = 'sb_publishable_OPRK980X_0v6whN-5MwnMQ_W8e81Xq7';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Testing connection...");
  const { data, error } = await supabase.from('motores').select('*').limit(1);
  if (error) {
    console.log("Error connection to Supabase:", error);
  } else {
    console.log("Success! Data:", data);
  }
}

test();
