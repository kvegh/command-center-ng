export const isReportClientId = value => typeof value === 'string' && /^ccng-report-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
export const isReportSettingClientId = value => typeof value === 'string' && /^ccng-report-setting-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
