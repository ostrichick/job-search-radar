const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
});
const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function partsToDate(parts) {
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}.${value('month')}.${value('day')}`;
}

function partsToDateTime(parts) {
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}.${value('month')}.${value('day')} ${value('hour')}:${value('minute')}`;
}

export function formatDate(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.replaceAll('-', '.');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text;
  return partsToDate(dateFormatter.formatToParts(date));
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return partsToDateTime(dateTimeFormatter.formatToParts(date));
}
