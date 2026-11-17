import { createToursView } from './tours-ui.js';

const $ = (id) => document.getElementById(id);
createToursView({ $ }).setActive(true);
