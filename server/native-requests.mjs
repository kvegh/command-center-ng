const fail = message => Object.assign(new Error(message), { status: 400 });
export const COMMAND_APPROVAL = 'item/commandExecution/requestApproval';
export const FILE_APPROVAL = 'item/fileChange/requestApproval';
export const CLARIFICATION = 'item/tool/requestUserInput';
export const PERMISSIONS = 'item/permissions/requestApproval';
export const MCP_REQUEST = 'mcpServer/elicitation/request';
export const knownHumanRequests = [COMMAND_APPROVAL, FILE_APPROVAL, CLARIFICATION, PERMISSIONS, MCP_REQUEST, 'execCommandApproval', 'applyPatchApproval'];
export const isHumanRequest = method => knownHumanRequests.includes(method) || /(?:\/requestApproval|\/requestUserInput|\/elicitation\/request)$/.test(method);
export function requestKind(question) {
  return ({ 'claude/tool/requestApproval': 'Claude tool approval', 'claude/tool/requestUserInput': 'Claude question', 'claude/mcp/elicitation/request': question.params.mode === 'url' ? 'External step' : 'MCP form', [COMMAND_APPROVAL]: 'Command approval', [FILE_APPROVAL]: 'File approval', [CLARIFICATION]: 'Question', [PERMISSIONS]: 'Permission request', [MCP_REQUEST]: question.params.mode === 'url' ? 'External step' : 'MCP form' })[question.method] || 'Unsupported native request';
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const options = schema => {
  if (Array.isArray(schema.enum) && schema.enum.every(value => typeof value === 'string')) return schema.enum.map((value, index) => ({ value, label: schema.enumNames?.[index] || value }));
  const choices = schema.oneOf || schema.anyOf;
  if (Array.isArray(choices) && choices.every(choice => object(choice) && typeof choice.const === 'string' && Object.keys(choice).every(key => ['const', 'title', 'description'].includes(key)))) return choices.map(choice => ({ value: choice.const, label: choice.title || choice.const }));
  return null;
};
export function formFields(schema) {
  if (!object(schema) || schema.type !== 'object' || !object(schema.properties) || Object.keys(schema).some(key => !['$schema', 'type', 'title', 'description', 'properties', 'required', 'additionalProperties'].includes(key)) || (schema.required && (!Array.isArray(schema.required) || schema.required.some(key => !Object.hasOwn(schema.properties, key))))) return null;
  const entries = Object.entries(schema.properties); if (entries.length > 64) return null;
  const fields = [];
  for (const [name, field] of entries) {
    if (['__proto__', 'constructor', 'prototype'].includes(name) || !object(field) || !['string', 'number', 'integer', 'boolean', 'array'].includes(field.type) || Object.keys(field).some(key => !['type', 'title', 'description', 'default', 'enum', 'enumNames', 'oneOf', 'minLength', 'maxLength', 'minimum', 'maximum', 'format', 'items', 'minItems', 'maxItems'].includes(key))) return null;
    const choices = field.type === 'array' ? object(field.items) && options(field.items) : options(field);
    if ((field.type === 'array' && (!choices || Object.keys(field.items).some(key => !['type', 'enum', 'oneOf', 'anyOf'].includes(key)))) || ((field.enum || field.oneOf) && !choices) || choices?.length > 128) return null;
    if (field.format && !['email', 'uri', 'date', 'date-time', 'password'].includes(field.format)) return null;
    for (const key of ['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems']) if (field[key] !== undefined && (!Number.isFinite(field[key]) || (['minLength', 'maxLength', 'minItems', 'maxItems'].includes(key) && (!Number.isInteger(field[key]) || field[key] < 0)))) return null;
    fields.push({ ...field, name, label: field.title || name, required: !!schema.required?.includes(name), options: choices || null });
  }
  return fields;
}
export function formContent(schema, content) {
  const fields = formFields(schema);
  if (!fields) throw fail('This form schema needs the native client. The request remains open.');
  if (!object(content) || JSON.stringify(content).length > 16000 || Object.keys(content).some(key => !fields.some(field => field.name === key))) throw fail('Submit only the requested form fields.');
  for (const field of fields) {
    const value = content[field.name];
    if (value === undefined) { if (field.required) throw fail(`Answer ${field.label}.`); continue; }
    let valid = field.type === 'string' ? typeof value === 'string' && value.length <= Math.min(8000, field.maxLength ?? 8000) && value.length >= (field.minLength ?? 0)
      : field.type === 'number' || field.type === 'integer' ? typeof value === 'number' && Number.isFinite(value) && (field.type !== 'integer' || Number.isInteger(value)) && value >= (field.minimum ?? -Infinity) && value <= (field.maximum ?? Infinity)
      : field.type === 'boolean' ? typeof value === 'boolean'
      : Array.isArray(value) && value.length >= (field.minItems ?? 0) && value.length <= Math.min(128, field.maxItems ?? 128) && new Set(value).size === value.length && value.every(item => typeof item === 'string' && field.options.some(option => option.value === item));
    if (field.options && field.type !== 'array') valid &&= field.options.some(option => option.value === value);
    if (field.type === 'string' && field.format && value) {
      if (field.format === 'email') valid &&= /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      if (field.format === 'uri') { try { new URL(value); } catch { valid = false; } }
      if (field.format === 'date') valid &&= /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
      if (field.format === 'date-time') valid &&= !Number.isNaN(Date.parse(value));
    }
    if (!valid) throw fail(`Check the answer for ${field.label}.`);
  }
  return Object.fromEntries(fields.filter(field => Object.hasOwn(content, field.name)).map(field => [field.name, content[field.name]]));
}
export function manualRequestAnswer(question, answer) {
  if (question.method === PERMISSIONS) {
    if (!['accept', 'decline'].includes(answer.decision)) throw fail('Allow the exact requested permissions for this turn, or decline.');
    const requested = question.params.permissions;
    if (answer.decision === 'accept' && (!object(requested) || Object.keys(requested).some(key => !['network', 'fileSystem'].includes(key)))) throw fail('This permission profile needs review in the native client.');
    return { permissions: answer.decision === 'decline' ? {} : Object.fromEntries(Object.entries(requested).filter(([, value]) => value !== null)), scope: 'turn' };
  }
  if (question.method === MCP_REQUEST) {
    if (!['accept', 'decline', 'cancel'].includes(answer.decision)) throw fail('Choose an explicit form action.');
    const form = ['form', 'openai/form', 'openaiForm'].includes(question.params.mode);
    if (answer.decision === 'accept' && !form && question.params.mode !== 'url') throw fail('This MCP request mode needs the native client.');
    return { action: answer.decision, content: answer.decision === 'accept' && form ? formContent(question.params.requestedSchema, answer.content) : null, _meta: null };
  }
  throw fail('This native request has no supported answer format here. It remains open; use the native client.');
}
