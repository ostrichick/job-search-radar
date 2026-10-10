import { collectApiJobs } from '../scripts/api-collection.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = await collectApiJobs();
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({ error: String(error?.message ?? error) });
  }
}
