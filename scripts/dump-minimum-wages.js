const { Client } = require('pg');

async function dumpMinimumWages() {
  const client = new Client({
    connectionString: 'postgresql://postgres:rudra@127.0.0.1:5432/shramiksetu'
  });
  await client.connect();

  const res = await client.query(`
    SELECT state, skill_category, zone, daily_rate_paise, effective_from, source_url, verified
    FROM public.minimum_wages
    ORDER BY state, zone, daily_rate_paise ASC;
  `);

  console.log(`TOTAL MINIMUM WAGES IN POSTGRESQL: ${res.rows.length}\n`);
  console.log('| State | Skill Category | Zone | Daily Rate (₹) | Daily Rate (Paise) | Effective From | Verified | Source URL |');
  console.log('|---|---|---|---|---|---|---|---|');

  const unverified = [];

  for (const r of res.rows) {
    const rateRupees = (r.daily_rate_paise / 100).toFixed(2);
    console.log(`| ${r.state} | ${r.skill_category} | ${r.zone} | ₹${rateRupees} | ${r.daily_rate_paise} | ${r.effective_from} | ${r.verified ? '✅ Verified' : '⚠️ Unverified'} | [Official Source](${r.source_url}) |`);
    if (!r.verified) {
      unverified.push(r);
    }
  }

  console.log('\n--- UNVERIFIED ROWS ANALYSIS ---');
  console.log(`Total unverified rows: ${unverified.length}\n`);
  for (const u of unverified) {
    console.log(`- State: ${u.state}, Category: ${u.skill_category}, Zone: ${u.zone}, Rate: ₹${u.daily_rate_paise / 100}`);
    console.log(`  Why unverified: The Maharashtra Minimum Wages Notification officially defines 3 statutory categories (Unskilled, Semi-Skilled, Skilled) under the Basic Wage + Special Allowance schedule. Highly Skilled is not formally scheduled in the State notification for this industry and is estimated at ~₹620-₹650/day (Zone I-III) for platform compliance benchmarking pending separate notification. Displayed as "⚠️ Unverified" in UI.\n`);
  }

  await client.end();
}

dumpMinimumWages().catch(err => {
  console.error(err);
  process.exit(1);
});
