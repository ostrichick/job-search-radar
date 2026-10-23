// Keep the original collector's public module path stable after moving the
// classic Nicole UI. The shared Nicole screen uses its own feed health rules.
export { feedHealth, maximumFeedAgeMs } from '../nicole-classic/feed-health.js';
