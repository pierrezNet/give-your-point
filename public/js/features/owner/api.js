import { apiRequest } from '../../core/api.js';

export const ownerApi = {
  companies: () => apiRequest('/api/owner/companies'),
  funnel: () => apiRequest('/api/owner/funnel'),
  setCompanyActive: (companyId, active) => apiRequest(`/api/owner/companies/${encodeURIComponent(companyId)}/active`, { method: 'PATCH', body: { active } }),
  deleteCompany: (companyId) => apiRequest(`/api/owner/companies/${encodeURIComponent(companyId)}`, { method: 'DELETE' }),
};
