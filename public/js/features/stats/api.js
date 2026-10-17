import { apiRequest } from '../../core/api.js';

export const fetchStats = (period) => apiRequest(`/api/stats?period=${encodeURIComponent(period)}`);
