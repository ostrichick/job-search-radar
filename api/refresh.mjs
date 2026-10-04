import { collectJobs } from '../scripts/collect-jobs.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = await collectJobs({ includeManual: false, persist: false });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({ error: String(error?.message ?? error) });
  }
}
