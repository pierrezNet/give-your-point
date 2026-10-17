import { apiRequest } from '../../core/api.js';

export const ownerApi = {
  companies: () => apiRequest('/api/owner/companies'),
  funnel: () => apiRequest('/api/owner/funnel'),
  deleteCompany: (companyId) => apiRequest(`/api/owner/companies/${encodeURIComponent(companyId)}`, { method: 'DELETE' }),
};
