import { startPage } from '../core/page.js';
import { startFeedback } from '../features/feedback/controller.js';

if (startPage()) startFeedback();
