import { t } from '../core/i18n.js';

export function mockupSvg() {
    return `
    <svg viewBox="0 0 320 360" xmlns="http://www.w3.org/2000/svg" class="w-72 md:w-80 drop-shadow-2xl" role="img" aria-label="${t('landing.mockup_alt')}">
        <rect x="10" y="10" width="300" height="340" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
        <rect x="240" y="30" width="50" height="22" rx="8" fill="#facc15"/>
        <text x="265" y="46" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="900" fill="#1e293b">${t('landing.mockup_user_rank')}</text>
        <rect x="30" y="30" width="56" height="22" rx="8" fill="#dbeafe"/>
        <text x="58" y="46" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="800" fill="#2563eb">${t('landing.mockup_demo_label')}</text>
        <circle cx="160" cy="115" r="42" fill="url(#avatarGrad)" stroke="#bfdbfe" stroke-width="2"/>
        <text x="160" y="128" text-anchor="middle" font-family="system-ui, sans-serif" font-size="36" font-weight="900" fill="#2563eb">A</text>
        <text x="160" y="190" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" font-weight="800" fill="#1e293b">${t('landing.mockup_user_name')}</text>
        <text x="160" y="216" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="900" fill="#2563eb">${t('landing.mockup_user_pts')}</text>
        <g transform="translate(50, 250)">
            <rect width="60" height="34" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>
            <text x="30" y="22" text-anchor="middle" font-size="18">😂</text>
            <text x="48" y="22" text-anchor="middle" font-size="10" font-weight="700" fill="#64748b">5</text>
        </g>
        <g transform="translate(130, 250)">
            <rect width="60" height="34" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>
            <text x="30" y="22" text-anchor="middle" font-size="18">👿</text>
            <text x="48" y="22" text-anchor="middle" font-size="10" font-weight="700" fill="#64748b">4</text>
        </g>
        <g transform="translate(210, 250)">
            <rect width="60" height="34" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>
            <text x="30" y="22" text-anchor="middle" font-size="18">😴</text>
            <text x="48" y="22" text-anchor="middle" font-size="10" font-weight="700" fill="#64748b">3</text>
        </g>
        <g transform="translate(40, 305)">
            <rect width="240" height="30" rx="15" fill="#ea580c"/>
            <text x="120" y="20" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="900" fill="white">${t('landing.mockup_dare')}</text>
        </g>
        <defs>
            <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#dbeafe"/>
                <stop offset="100%" stop-color="#eff6ff"/>
            </linearGradient>
        </defs>
    </svg>`;
}
