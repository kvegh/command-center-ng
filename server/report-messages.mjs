export const isReportClientId = value => typeof value === 'string' && /^ccng-report-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
export const isReportSettingClientId = value => typeof value === 'string' && /^ccng-report-setting-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
export const isCoordinatorEventClientId = value => typeof value === 'string' && /^ccng-event-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);

function clientFlags(value) {
  return isReportClientId(value) ? { internalReport: true }
    : isReportSettingClientId(value) ? { internalReportControl: true }
    : isCoordinatorEventClientId(value) ? { internalCoordinatorEvent: true } : null;
}

export function markInternalInput(content, clientId) {
  if (!clientFlags(clientId) || !Array.isArray(content) || content.length !== 1) return content;
  const text = content[0];
  if (text?.type !== 'text' || typeof text.text !== 'string' || !text.text || text.text_elements?.length) return content;
  return [{ ...text, text_elements: [{ byteRange: { start: 0, end: Buffer.byteLength(text.text, 'utf8') }, placeholder: clientId }] }];
}

export function reportMessageFlags(item, previous) {
  if (item.type !== 'userMessage') return {};
  const fromClient = clientFlags(item.clientId);
  if (fromClient) return fromClient;
  if (Array.isArray(item.content) && item.content.length === 1) {
    const text = item.content[0], marker = Array.isArray(text?.text_elements) && text.text_elements.length === 1 ? text.text_elements[0] : null;
    if (text?.type === 'text' && typeof text.text === 'string' && text.text && marker?.byteRange?.start === 0 && marker.byteRange.end === Buffer.byteLength(text.text, 'utf8')) {
      const fromMarker = clientFlags(marker.placeholder);
      if (fromMarker) return fromMarker;
    }
  }
  if (item.clientId == null && previous?.id === item.id && previous.type === 'user') {
    if (previous.internalReport === true) return { internalReport: true };
    if (previous.internalReportControl === true) return { internalReportControl: true };
    if (previous.internalCoordinatorEvent === true) return { internalCoordinatorEvent: true };
  }
  return {};
}
