import { startPage } from '../core/page.js';
import { startStats } from '../features/stats/controller.js';

if (startPage()) startStats();
