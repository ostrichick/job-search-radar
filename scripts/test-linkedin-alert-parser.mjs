import assert from 'node:assert/strict';
import { parseLinkedInJobAlert } from './linkedin-alert-parser.mjs';

const body = `
[Your job alert for transcriptionist](https://www.linkedin.com/comm/jobs/search-results/?keywords=transcriptionist)

New jobs match your preferences.

[ElevenLabs](https://www.linkedin.com/comm/jobs/view/4474366615/?trackingId=logo)
[Transcription / Subtitling Specialist (Freelance)
ElevenLabs · South Korea (Remote)](https://www.linkedin.com/comm/jobs/view/4474366615/?trackingId=job)

[Beep Saúde](https://www.linkedin.com/comm/jobs/view/4472652150/?trackingId=logo)
[[Cadastro e Autorizações] Assistente de Transcrição
Beep Saúde · Rio de Janeiro, RJ (On-site) Easy Apply](https://www.linkedin.com/comm/jobs/view/4472652150/?trackingId=job)

You are receiving Job Alert emails.
`;

const jobs = parseLinkedInJobAlert({ body, emailTs: '2026-10-02T10:02:25Z' });
assert.equal(jobs.length, 2, 'company-logo links must not duplicate actual job links');
assert.deepEqual(jobs[0], {
  id: 'linkedin-alert:4474366615',
  linkedinJobId: '4474366615',
  source: 'LinkedIn Job Alert',
  title: 'Transcription / Subtitling Specialist (Freelance)',
  company: 'ElevenLabs',
  location: 'South Korea (Remote)',
  remote: true,
  workplace: 'remote',
  url: 'https://www.linkedin.com/jobs/view/4474366615/',
  alertReceivedAt: '2026-10-02T10:02:25Z'
});
assert.equal(jobs[1].title, '[Cadastro e Autorizações] Assistente de Transcrição');
assert.equal(jobs[1].location, 'Rio de Janeiro, RJ (On-site)');
assert.equal(jobs[1].workplace, 'onsite');
assert.equal(jobs[1].remote, false);
assert.equal(parseLinkedInJobAlert({ body: 'ordinary email' }).length, 0, 'non-alert email must not be parsed speculatively');

console.log('LinkedIn alert parser tests passed');
